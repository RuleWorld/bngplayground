import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator.ts';
import type { GeneratorOptions } from '../src/services/graph/NetworkGenerator.ts';
import { NetworkExporter } from '../src/services/graph/NetworkExporter.ts';
import { BNGLVisitor } from '../src/parser/BNGLVisitor.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { BNGLexer } from '../src/parser/generated/BNGLexer.ts';
import { BNGParser as AntlrParser } from '../src/parser/generated/BNGParser.ts';
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

function applySetParameterActions(model: BNGLModel): void {
  const actions = model.actions ?? [];
  if (actions.length === 0) return;

  const paramMap = new Map<string, number>(
    Object.entries(model.parameters).map(([k, v]) => [k, Number(v)])
  );

  for (const action of actions) {
    if (action.type !== 'setParameter') continue;

    const parameter = action.args?.parameter;
    if (typeof parameter !== 'string' || parameter.length === 0) continue;

    const rawValue = action.args?.value;
    let evaluated: number | null = null;
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      evaluated = rawValue;
    } else if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim().replace(/^"(.*)"$/, '$1');
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        evaluated = parsed;
      } else {
        try {
          const v = BNGLParser.evaluateExpression(trimmed, paramMap);
          if (Number.isFinite(v)) evaluated = v;
        } catch {
          // Ignore invalid expressions and keep existing value.
        }
      }
    }

    if (evaluated === null) continue;
    model.parameters[parameter] = evaluated;
    paramMap.set(parameter, evaluated);
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
      rateExpression: rxn.rateExpression,
      productStoichiometries: rxn.productStoichiometries ? [...rxn.productStoichiometries] : undefined,
      scalingVolume: rxn.scalingVolume,
      totalRate: (rxn as any).totalRate
    }
  ));

  return { species: remappedSpecies, reactions: remappedReactions };
}

async function main() {
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

  // 1. Parse BNGL using ANTLR and Visitor to get BNGLModel
  log('Parsing BNGL...');
  const inputStream = CharStreams.fromString(bnglCode);
  const lexer = new BNGLexer(inputStream);
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new AntlrParser(tokenStream);
  const tree = parser.prog();
  const visitor = new BNGLVisitor();
  const model = visitor.visitProg(tree);
  applySetParameterActions(model);
  log(`Parsed model: ${Object.keys(model.parameters).length} parameters, ${model.species.length} seeds, ${model.reactionRules.length} rules.`);
  log(`Parameter keys: ${JSON.stringify(Object.keys(model.parameters))}`);

  // 2. Prepare Network Generation
  log('Preparing network generation...');
  
  // Create seed concentration map
  const seedConcentrationMap = new Map<string, number>();
  model.species.forEach((s: BNGLSpecies) => {
      log(`Seed: ${s.name}, Conc: ${s.initialConcentration}`);
      seedConcentrationMap.set(s.name, s.initialConcentration);
  });

  // Convert seed species to SpeciesGraph
  const seedSpeciesGraphs = model.species.map((s: BNGLSpecies) => {
    log(`Parsing seed species graph: ${s.name}`);
    return BNGLParser.parseSpeciesGraph(s.name, true);
  });
  
  const options: Partial<GeneratorOptions> & { parameters: Map<string, number>, seedConcentrationMap?: Map<string, number> } = {
      maxSpecies: model.networkOptions?.maxSpecies || 10000,
      maxReactions: model.networkOptions?.maxReactions || 100000,
      maxIterations: model.networkOptions?.maxIter ?? 5000,
      maxAgg: model.networkOptions?.maxAgg ?? 500,
      maxStoich: model.networkOptions?.maxStoich
        ? new Map(Object.entries(model.networkOptions.maxStoich as Record<string, number>))
        : 500,
      parameters: new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v)])),
      seedConcentrationMap,
      compartments: model.compartments?.map((c: any) => ({
          name: c.name,
          dimension: c.dimension,
          size: c.size,
          parent: c.parent
      }))
  };

    // 3. Generate Network
    log('Generating network...');
    try {
      const generator = new NetworkGenerator(options);
      
      // We need the rules as graph/core/RxnRule objects.
      const rules: any[] = [];
      model.reactionRules.forEach((r: ReactionRule) => {
          log(`Parsing rule: ${r.name || 'unnamed'}`);
          if (!r.reactionString) {
              log('WARNING: reactionString is missing!');
              return;
          }
          const normalizedReactionString = normalizeReactionString(r.reactionString);

          // Forward rule
          const forwardRule = BNGLParser.parseRxnRule(
              normalizedReactionString,
              (r.rateExpression || r.rate) as string | number, 
              r.name,
              { isMoveConnected: r.moveConnected }
          );
          const constraints = Array.isArray((r as any).constraints) ? (r as any).constraints as string[] : [];
          if (constraints.length > 0) {
              forwardRule.applyConstraints(
                  constraints,
                  (patternStr: string) => BNGLParser.parseSpeciesGraph(patternStr, true)
              );
          }
          if ((r as any).deleteMolecules) {
              (forwardRule as any).isDeleteMolecules = true;
              let globalMolOffset = 0;
              const deleteIndices: number[] = [];
              for (const reactantPattern of forwardRule.reactants) {
                  for (let molIdx = 0; molIdx < reactantPattern.molecules.length; molIdx++) {
                      deleteIndices.push(globalMolOffset + molIdx);
                  }
                  globalMolOffset += reactantPattern.molecules.length;
              }
              forwardRule.deleteMolecules = deleteIndices;
          }
          (forwardRule as any).totalRate = !!(r as any).totalRate;
          (forwardRule as any).originalRate = (r.rateExpression || r.rate);
          rules.push(forwardRule);

          // Reverse rule
          if (r.isBidirectional) {
              log(`Parsing reverse rule for: ${r.name || 'unnamed'}`);
              const reverseSign = normalizedReactionString.includes('<->') ? '<->' : '->';
              const [reactants, products] = normalizedReactionString.split(reverseSign);
              const reverseString = `${products.trim()} -> ${reactants.trim()}`;
              const reverseRate = (r.reverseRate ?? r.rateExpression ?? r.rate) as string | number;
              const reverseRule = BNGLParser.parseRxnRule(
                  reverseString,
                  reverseRate,
                  r.name ? `_reverse_${r.name}` : undefined,
                  { isMoveConnected: r.moveConnected }
              );
              if (constraints.length > 0) {
                  reverseRule.applyConstraints(
                      constraints,
                      (patternStr: string) => BNGLParser.parseSpeciesGraph(patternStr, true)
                  );
              }
              rules.push(reverseRule);
          }
      });

    log(`Starting generation with ${seedSpeciesGraphs.length} seeds and ${rules.length} rules...`);
    const generated = await generator.generate(seedSpeciesGraphs, rules);
    const hasExplicitGenerateNetworkAction = (model.actions ?? []).some((a: any) => a?.type === 'generate_network');
    const { species, reactions } = hasExplicitGenerateNetworkAction
      ? { species: generated.species, reactions: generated.reactions }
      : pruneNetDisconnectedSpecies(generated.species, generated.reactions);
    log(`Generation complete: ${generated.species.length} species, ${generated.reactions.length} reactions.`);
    if (species.length !== generated.species.length) {
      log(`Pruned disconnected species for .net export: ${generated.species.length} -> ${species.length}`);
    }

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
