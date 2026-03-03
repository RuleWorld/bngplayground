import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseBNGL } from '../services/parseBNGL';
import { lintBNGL, formatLintResults } from '../services/bnglLinter';

const TEST_MODEL_WITH_ISSUES = `
# Demo model with various lint-detectable issues

begin parameters
  kf 1.0
  kr 0.1
  unused_param 42.0
end parameters

begin molecule types
  A(b,b)           # Symmetric sites - will trigger warning
  B(a~U~P)
  C(x)
  UnusedMol(y)     # Never used - will trigger info
end molecule types

begin seed species
  A(b,b) 100
  B(a~U) 0         # Zero concentration - will trigger info
end seed species

begin observables
  Molecules A_total A()
  Molecules B_phos B(a~P)
  Molecules B_phos B(a~P)  # Duplicate observable name
end observables

begin reaction rules
  # Rule using undefined state
  A(b) + B(a~X) -> A(b!1).B(a~X!1) kf
  
  # Rule with undefined parameter
  A(b!1).B(a!1) -> A(b) + B(a) undefined_rate
  
  # Bidirectional rule missing reverse rate (if grammar allows)
  B(a~U) -> B(a~P) kf
end reaction rules
`;

const VALID_MODEL = `
begin parameters
  kf 1.0
  kr 0.1
end parameters

begin molecule types
  A(b)
  B(a~U~P)
end molecule types

begin seed species
  A(b) 100
  B(a~U) 50
end seed species

begin observables
  Molecules A_free A(b)
  Molecules B_phos B(a~P)
end observables

begin reaction rules
  A(b) + B(a~U) -> A(b!1).B(a~U!1) kf
  A(b!1).B(a!1) -> A(b) + B(a) kr
  B(a~U) -> B(a~P) kf
end reaction rules
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const code = fs.readFileSync(filePath, 'utf-8');
    console.log(`\n📄 Linting: ${path.basename(filePath)}\n`);

    try {
      const model = parseBNGL(code);
      const result = lintBNGL(model);
      console.log(formatLintResults(result));
    } catch (error: any) {
      console.error(`Parse error: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('='.repeat(60));
    console.log('BNGL Linter Demo');
    console.log('='.repeat(60));

    console.log('\n📄 Test Model (with intentional issues):\n');
    try {
      const model = parseBNGL(TEST_MODEL_WITH_ISSUES);
      const result = lintBNGL(model);
      console.log(formatLintResults(result));
    } catch (error: any) {
      console.error(`Parse error: ${error.message}`);
    }

    console.log('\n' + '-'.repeat(60) + '\n');

    console.log('📄 Valid Model:\n');
    try {
      const model = parseBNGL(VALID_MODEL);
      const result = lintBNGL(model);
      console.log(formatLintResults(result));
    } catch (error: any) {
      console.error(`Parse error: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});