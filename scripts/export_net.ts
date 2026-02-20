import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical.ts';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator.ts';
import type { GeneratorOptions } from '../src/services/graph/NetworkGenerator.ts';
import { NetworkExporter } from '../src/services/graph/NetworkExporter.ts';
import { parseBNGL } from '../services/parseBNGL.ts';
import { generateExpandedNetwork } from '../services/simulation/NetworkExpansion.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { BNGLModel, BNGLSpecies, ReactionRule } from '../types.ts';
import { Species } from '../src/services/graph/core/Species.ts';
import { Rxn } from '../src/services/graph/core/Rxn.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.resolve(__dirname, 'export.log');

function log(msg: any) {
    console.log(msg);
    fs.appendFileSync(logPath, (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
}

function normalizeRuleSide(side: string): string {
  let s = side.trim();
  if (s === '' || s === '0') return '0';

  // Remove standalone null-species terms while preserving wildcard syntax like !+.
  // Examples handled:
  // - "0 + A" -> "A"
  // - "A + 0" -> "A"
  // - "A + 0 + B" -> "A + B"
  const middleZero = /\s*\+\s*0\s*\+\s*/g;
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(middleZero, ' + ');
    s = s.replace(/^\s*0\s*\+\s*/, '');
    s = s.replace(/\s*\+\s*0\s*$/, '');
    s = s.trim();
  }

  return s.length > 0 ? s : '0';
}

function normalizeReactionString(raw: string): string {
  const arrow = raw.includes('<->') ? '<->' : '->';
  const parts = raw.split(arrow);
  if (parts.length !== 2) return raw;
  return `${normalizeRuleSide(parts[0])} ${arrow} ${normalizeRuleSide(parts[1])}`;
}

function applySetParameterActions(model: BNGLModel, bnglCode: string): void {
  // BNG2 semantics: the .net file reflects the LAST value of each parameter after
  // ALL setParameter() calls have been processed. BNG2 updates the .net file parameter
  // table whenever setParameter is called (or at the final generate_network).
  // We replicate this by applying ALL setParameter() calls in order (last wins).
  //
  // We parse directly from the raw BNGL text because parseBNGL() does not populate
  // model.actions with setParameter entries.
  //
  // IMPORTANT: Strip full-line comments (lines starting with optional whitespace + '#')
  // before searching for setParameter calls, to avoid matching commented-out calls.
  const uncommentedCode = bnglCode
    .split('\n')
    .map((line) => {
      const commentIdx = line.indexOf('#');
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join('\n');

  const evalMap = new Map<string, number>(
    Object.entries(model.parameters).map(([k, v]) => [k, Number(v)])
  );

  // Match: setParameter("ParamName", value_or_expr)
  const setParamRegex = /setParameter\s*\(\s*"([^"]+)"\s*,\s*([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = setParamRegex.exec(uncommentedCode)) !== null) {
    const paramName = m[1].trim();
    const rawValue = m[2].trim();

    let numValue: number = NaN;
    // Try as a plain numeric literal (handles "0", "2.5", "1e-3", etc.)
    const strictNum = Number(rawValue);
    if (Number.isFinite(strictNum)) {
      numValue = strictNum;
    } else {
      // Try to evaluate as an expression using current parameter values
      try {
        const evaluated = BNGLParser.evaluateExpression(rawValue, evalMap);
        if (Number.isFinite(evaluated)) {
          numValue = evaluated;
        }
      } catch {
        // Ignore unresolvable expressions
      }
    }

    if (!isNaN(numValue)) {
      model.parameters[paramName] = numValue;
      evalMap.set(paramName, numValue);
    }
  }
}

function pruneNetDisconnectedSpecies(
  species: Species[],
  reactions: Rxn[]
): { species: Species[]; reactions: Rxn[] } {
  const usedSpeciesIndices = new Set<number>();

  for (const rxn of reactions) {
    for (const idx of rxn.reactants) {
      if (idx >= 0) usedSpeciesIndices.add(idx);
    }
    for (const idx of rxn.products) {
      if (idx >= 0) usedSpeciesIndices.add(idx);
    }
  }

  if (usedSpeciesIndices.size === 0 || usedSpeciesIndices.size === species.length) {
    return { species, reactions };
  }

  const keptOldIndices = Array.from(usedSpeciesIndices)
    .filter((idx) => idx >= 0 && idx < species.length)
    .sort((a, b) => a - b);

  const indexMap = new Map<number, number>();
  const remappedSpecies = keptOldIndices.map((oldIdx, newIdx) => {
    indexMap.set(oldIdx, newIdx);
    const s = species[oldIdx];
    const copy = new Species(s.graph, newIdx, s.concentration);
    copy.initialConcentration = s.initialConcentration;
    (copy as Species & { isConstant?: boolean }).isConstant = (s as Species & { isConstant?: boolean }).isConstant;
    return copy;
  });

  const remapIndex = (idx: number): number => {
    const mapped = indexMap.get(idx);
    return mapped === undefined ? idx : mapped;
  };

  const remappedReactions = reactions.map((rxn) => new Rxn(
    rxn.reactants.map(remapIndex),
    rxn.products.map(remapIndex),
    rxn.rate,
    rxn.name,
    {
      degeneracy: rxn.degeneracy,
      propensityFactor: rxn.propensityFactor,
      statFactor: rxn.statFactor,
      rateExpression: rxn.rateExpression,
      productStoichiometries: rxn.productStoichiometries ? [...rxn.productStoichiometries] : undefined,
      scalingVolume: rxn.scalingVolume,
      totalRate: (rxn as any).totalRate
    }
  ));

  return { species: remappedSpecies, reactions: remappedReactions };
}

function applySetConcentrationActions(model: BNGLModel, species: Species[]): void {
  const actions = model.actions ?? [];
  if (actions.length === 0) return;

  for (const action of actions) {
    if (action.type !== 'setConcentration') continue;

    const rawSpecies = action.args?.species;
    if (typeof rawSpecies !== 'string' || rawSpecies.length === 0) continue;

    let newConc: number | null = null;
    const rawValue = action.args?.value;
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      newConc = rawValue;
    } else if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim().replace(/^"(.*)"$/, '$1');
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        newConc = parsed;
      } else {
        try {
          const evalMap = new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v)]));
          const evaluated = BNGLParser.evaluateExpression(trimmed, evalMap);
          if (Number.isFinite(evaluated)) {
            newConc = evaluated;
          }
        } catch {
          // Ignore invalid setConcentration expressions.
        }
      }
    }

    if (newConc === null) continue;

    try {
      const graph = BNGLParser.parseSpeciesGraph(rawSpecies, true);
      const canonical = GraphCanonicalizer.canonicalize(graph);
      const match = species.find((s) => GraphCanonicalizer.canonicalize(s.graph) === canonical);
      if (match) {
        match.concentration = newConc;
      }
    } catch {
      // Ignore parse failures for action species and continue.
    }
  }
}

async function main() {
    log('Starting main...');
    log(`BNGLParser available: ${!!BNGLParser}`);
    log(`GraphCanonicalizer available: ${!!GraphCanonicalizer}`);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  log('Starting export script...');
  const args = process.argv.slice(2);
  if (args.length < 1) {
    log('Usage: npx ts-node scripts/export_net.ts <bngl_file> [output_file]');
    process.exit(1);
  }

  const bnglPath = path.resolve(args[0]);
  const outputPath = args[1] || bnglPath.replace('.bngl', '.net');

  log(`Reading BNGL from ${bnglPath}...`);
  const bnglCode = fs.readFileSync(bnglPath, 'utf8');

  // 1. Parse BNGL model
  log('Parsing BNGL...');
  const model = parseBNGL(bnglCode);
  applySetParameterActions(model, bnglCode);
  const evalParamMap = new Map<string, number>(
    Object.entries(model.parameters).map(([k, v]) => [k, Number(v)])
  );
  log(`Parsed model: ${Object.keys(model.parameters).length} parameters, ${model.species.length} seeds, ${model.reactionRules.length} rules.`);
  log(`Parameter keys: ${JSON.stringify(Object.keys(model.parameters))}`);

  // 2. Prepare Network Generation
  log('Preparing network generation...');

  const seedConstantMap = new Map<string, boolean>();
  model.species.forEach((s: BNGLSpecies) => {
      log(`Seed: ${s.name}, Conc: ${s.initialConcentration}`);
      const graph = BNGLParser.parseSpeciesGraph(s.name, true);
      const canonical = GraphCanonicalizer.canonicalize(graph);
      if (canonical !== s.name) {
        log(`   Note: Canonical name for seed is ${canonical}`);
      }
      seedConstantMap.set(canonical, !!s.isConstant);
  });

    // 3. Generate Network
    log('Generating network...');
    try {
      const expandedModel = await generateExpandedNetwork(model, () => {}, () => {});
      const expandedSpecies = expandedModel.species ?? [];
      const expandedReactions = (expandedModel as any).reactions ?? [];

      const species: Species[] = expandedSpecies.map((s: BNGLSpecies, idx: number) => {
        const graph = BNGLParser.parseSpeciesGraph(s.name, true);
        const concentration = Number(s.initialConcentration ?? 0);
        const sp = new Species(graph, idx, concentration);
        sp.initialConcentration = concentration;
        // Propagate isConstant from expanded species (set by NetworkExpansion from seed $ prefix)
        (sp as Species & { isConstant?: boolean }).isConstant = !!s.isConstant;
        return sp;
      });

      const speciesNameToIndex = new Map<string, number>();
      species.forEach((sp, idx) => {
        const canonical = GraphCanonicalizer.canonicalize(sp.graph);
        speciesNameToIndex.set(canonical, idx);
        speciesNameToIndex.set(sp.graph.toString(), idx);
      });

      const toIndex = (name: string): number => {
        const direct = speciesNameToIndex.get(name);
        if (direct !== undefined) return direct;
        const canonical = GraphCanonicalizer.canonicalize(BNGLParser.parseSpeciesGraph(name, true));
        const mapped = speciesNameToIndex.get(canonical);
        if (mapped === undefined) {
          throw new Error(`Unable to map generated species "${name}" to index`);
        }
        return mapped;
      };

      const reactions: Rxn[] = expandedReactions.map((reaction: any) => {
        const reactants = Array.isArray(reaction.reactants)
          ? reaction.reactants.map((name: string) => toIndex(name))
          : [];
        const products = Array.isArray(reaction.products)
          ? reaction.products.map((name: string) => toIndex(name))
          : [];

        const numericRate = Number(
          Number.isFinite(reaction.rateConstant)
            ? reaction.rateConstant
            : reaction.rate
        );

        const symbolicRateExpression = typeof reaction.rate === 'string'
          ? reaction.rate
          : reaction.rateExpression;

        let inferredStatFactor = 1;
        if (!Number.isFinite(reaction.statFactor) && typeof symbolicRateExpression === 'string' && symbolicRateExpression.trim().length > 0) {
          const expr = symbolicRateExpression.trim();
          let exprValue = Number(expr);
          if (!Number.isFinite(exprValue)) {
            try {
              exprValue = BNGLParser.evaluateExpression(expr, evalParamMap);
            } catch {
              exprValue = NaN;
            }
          }
          if (Number.isFinite(exprValue) && Math.abs(exprValue) > 1e-15 && Number.isFinite(numericRate)) {
            const ratio = numericRate / exprValue;
            if (Number.isFinite(ratio) && Math.abs(ratio) > 1e-15) {
              inferredStatFactor = Number(ratio.toPrecision(12));
            }
          }
        }

        return new Rxn(
          reactants,
          products,
          Number.isFinite(numericRate) ? numericRate : 0,
          reaction.name ?? '',
          {
            degeneracy: reaction.degeneracy,
            propensityFactor: reaction.propensityFactor,
            statFactor: Number.isFinite(reaction.statFactor) ? reaction.statFactor : inferredStatFactor,
            rateExpression: symbolicRateExpression,
            productStoichiometries: Array.isArray(reaction.productStoichiometries)
              ? reaction.productStoichiometries
              : undefined,
            scalingVolume: reaction.scalingVolume ?? undefined,
            totalRate: reaction.totalRate,
          }
        );
      });

    for (const s of species) {
      const canonical = GraphCanonicalizer.canonicalize(s.graph);
      const mapped = seedConstantMap.get(canonical);
      if (mapped !== undefined) {
        // seedConstantMap found an explicit match — use it (handles canonical key consistency)
        (s as Species & { isConstant?: boolean }).isConstant = mapped;
      }
      // else: keep the value already copied from expandedSpecies.isConstant (set above)
      if (s.concentration === undefined) {
        s.concentration = s.initialConcentration ?? 0;
      }
    }

    applySetConcentrationActions(model, species);

    log(`Generation complete: ${species.length} species, ${reactions.length} reactions.`);

    // 4. Export to .net format
    log('Exporting to .net format...');
    const exporter = NetworkExporter.export(
      model,
      species,
      reactions
    );

    // 5. Write to file
    log(`Writing .net to ${outputPath}...`);
    fs.writeFileSync(outputPath, exporter);
    log('Done.');
  } catch (err) {
    console.error('Error during generation or export:');
    console.error(err);
    process.exit(1);
  }
}

function logError(err: any) {
    log('ERROR:');
    if (err instanceof Error) {
        log(err.message);
        log(err.stack);
    } else {
        log(err);
    }
}

main().catch(err => {
  logError(err);
  process.exit(1);
});
