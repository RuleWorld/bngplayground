/**
 * Run the Atomizer structural/translation gate against an existing SBML Test Suite checkout.
 *
 * Required:
 *   SBML_TEST_SUITE_DIR=/path/to/sbml-test-suite
 * Optional:
 *   SBML_SUITE_EXPECTED_COUNT=1692
 *   SBML_SUITE_OUT=artifacts/atomizer-roundtrip/sbml-suite-audit.json
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { parseBNGLStrict } from '@bngplayground/engine';
import { Atomizer } from '../../src/lib/atomizer';

type SuiteResult = {
  file: string;
  success: boolean;
  strictParse: boolean;
  warningCategories: string[];
  warningCounts: Record<string, number>;
  eventConverted: boolean;
  eventPreserved: boolean;
  eventUntranslated: boolean;
  error?: string;
};

function findSemanticL3V2Files(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else if (/-sbml-l3v2\.xml$/i.test(entry) && /(?:^|[/\\])semantic(?:[/\\])/i.test(relative(root, path))) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

async function main(): Promise<void> {
  const suiteRoot = process.env.SBML_TEST_SUITE_DIR;
  if (!suiteRoot) {
    throw new Error('Set SBML_TEST_SUITE_DIR to a checked-out SBML Test Suite repository.');
  }
  const root = resolve(suiteRoot);
  const files = findSemanticL3V2Files(root);
  if (files.length === 0) {
    throw new Error(`No semantic *-sbml-l3v2.xml files found under ${root}`);
  }

  const atomizer = new Atomizer({ quietMode: true, useId: true, atomize: false });
  await atomizer.initialize();
  const results: SuiteResult[] = [];
  for (const file of files) {
    const result: SuiteResult = {
      file: relative(root, file),
      success: false,
      strictParse: false,
      warningCategories: [],
      warningCounts: {},
      eventConverted: false,
      eventPreserved: false,
      eventUntranslated: false,
    };
    try {
      const atomized = await atomizer.atomize(readFileSync(file, 'utf8'));
      result.success = atomized.success;
      const warnings = atomizer.getModel()?.importWarnings || [];
      result.warningCategories = [...new Set(warnings.map((warning) => warning.category))].sort();
      result.warningCounts = warnings.reduce<Record<string, number>>((counts, warning) => {
        counts[warning.category] = (counts[warning.category] || 0) + (warning.count || 1);
        return counts;
      }, {});
      result.eventConverted = /time-triggered event\(s\) converted/i.test(atomized.bngl);
      result.eventPreserved = /#\s*@sbml-event\s+/i.test(atomized.bngl);
      // A diagnostic note may remain for an event that is preserved losslessly in metadata.
      // Count it as untranslated only when neither an executable action nor metadata exists.
      result.eventUntranslated = /Events NOT simulated/i.test(atomized.bngl) && !result.eventPreserved;
      if (!atomized.success) {
        result.error = atomized.error || 'Atomizer returned success=false';
      } else {
        try {
          parseBNGLStrict(atomized.bngl);
          result.strictParse = true;
        } catch (error) {
          result.error = `strict BNGL parse failed: ${String(error)}`;
        }
      }
    } catch (error) {
      result.error = String(error);
    }
    results.push(result);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    suiteRoot: root,
    filePattern: '**/semantic/**/*-sbml-l3v2.xml',
    totalFiles: results.length,
    success: results.filter((result) => result.success).length,
    strictParse: results.filter((result) => result.strictParse).length,
    strictFailures: results.filter((result) => !result.strictParse).length,
    eventModels: results.filter((result) => result.warningCategories.includes('event')).length,
    eventConverted: results.filter((result) => result.eventConverted).length,
    eventPreserved: results.filter((result) => result.eventPreserved).length,
    eventUntranslated: results.filter((result) => result.eventUntranslated).length,
    eventDiagnostic: results.filter((result) => result.warningCategories.includes('event') && !result.eventConverted).length,
    warningCategories: [...new Set(results.flatMap((result) => result.warningCategories))].sort(),
    warningCounts: results.reduce<Record<string, number>>((counts, result) => {
      for (const [category, count] of Object.entries(result.warningCounts)) {
        counts[category] = (counts[category] || 0) + count;
      }
      return counts;
    }, {}),
    results,
  };

  const expectedCount = Number(process.env.SBML_SUITE_EXPECTED_COUNT || '0');
  if (expectedCount > 0 && summary.totalFiles !== expectedCount) {
    throw new Error(`Expected ${expectedCount} suite files, found ${summary.totalFiles}`);
  }
  const output = resolve(process.env.SBML_SUITE_OUT || 'artifacts/atomizer-roundtrip/sbml-suite-audit.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ output, ...summary, results: undefined }, null, 2));
  if (summary.strictFailures > 0 || summary.success !== summary.totalFiles) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
