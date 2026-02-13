import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { NetworkGenerator, GeneratorOptions } from '../src/services/graph/NetworkGenerator.ts';
import { NetworkExporter } from '../src/services/graph/NetworkExporter.ts';
import { BNGLVisitor } from '../src/parser/BNGLVisitor.ts';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { BNGLexer } from '../src/parser/generated/BNGLexer.ts';
import { BNGParser as AntlrParser } from '../src/parser/generated/BNGParser.ts';
import { BNGLModel, BNGLSpecies, ReactionRule } from '../types.ts';
import { Species } from '../src/services/graph/core/Species.ts';
import { Rxn } from '../src/services/graph/core/Rxn.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.resolve(__dirname, 'export.log');

function log(msg: any) {
    console.log(msg);
    fs.appendFileSync(logPath, (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n');
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
      maxIterations: model.networkOptions?.maxIter ?? 100,
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

          // Forward rule
          const forwardRule = BNGLParser.parseRxnRule(
              r.reactionString, 
              (r.rateExpression || r.rate) as string | number, 
              r.name,
              { isMoveConnected: r.moveConnected }
          );
          rules.push(forwardRule);

          // Reverse rule
          if (r.isBidirectional && r.reverseRate) {
              log(`Parsing reverse rule for: ${r.name || 'unnamed'}`);
              const reverseSign = r.reactionString.includes('<->') ? '<->' : '->';
              const [reactants, products] = r.reactionString.split(reverseSign);
              const reverseString = `${products.trim()} -> ${reactants.trim()}`;
              const reverseRule = BNGLParser.parseRxnRule(
                  reverseString,
                  r.reverseRate,
                  r.name ? `_reverse_${r.name}` : undefined,
                  { isMoveConnected: r.moveConnected }
              );
              rules.push(reverseRule);
          }
      });

    log(`Starting generation with ${seedSpeciesGraphs.length} seeds and ${rules.length} rules...`);
    const { species, reactions } = await generator.generate(seedSpeciesGraphs, rules);
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
