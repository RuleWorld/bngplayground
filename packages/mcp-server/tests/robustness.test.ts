import { describe, it, expect } from 'vitest';

import { handleParseBngl } from '../src/handlers/parseBngl';
import { handleGenerateNetwork } from '../src/handlers/generateNetwork';
import { handleSimulate } from '../src/handlers/simulate';
import { handleParameterScan } from '../src/handlers/parameterScan';
import { handleValidateModel } from '../src/handlers/validateModel';
import { handleGetContactMap } from '../src/handlers/getContactMap';
import { handleFitParameters } from '../src/handlers/fitParameters';
import { handleImportPetab } from '../src/handlers/importPetab';
import { handleReduceModel } from '../src/handlers/reduceModel';
import { handleQueryPathwayCommons } from '../src/handlers/queryPathwayCommons';
import { handleSobolSensitivity } from '../src/handlers/sobolSensitivity';
import { handleIdentifiability } from '../src/handlers/identifiability';
import { handleBayesianInference } from '../src/handlers/bayesianInference';
import { handleExportModel } from '../src/handlers/exportModel';
import { handleComposeModel } from '../src/handlers/composeModel';
import { handleEditModel } from '../src/handlers/editModel';
import { handleDiagnoseModel } from '../src/handlers/diagnoseModel';
import { handleExplainModel } from '../src/handlers/explainModel';
import { handleOptimalExperiment } from '../src/handlers/optimalExperiment';
import { handleVerifyModel } from '../src/handlers/verifyModel';
import { handleBifurcationAnalysis } from '../src/handlers/bifurcationAnalysis';
import { handleTemporalAnalysis } from '../src/handlers/temporalAnalysis';
import { handleSymbolicSteadyState } from '../src/handlers/symbolicSteadyState';
import { handleCompareModels } from '../src/handlers/compareModels';
import { handleSearchStructure } from '../src/handlers/searchStructure';
import { handlePKPD } from '../src/handlers/pkpd';
import { handleMultiscaleSimulation } from '../src/handlers/multiscaleSimulation';

// ---------------------------------------------------------------------------
// Shared model fixtures
// ---------------------------------------------------------------------------

const WORKING_MODEL = `begin parameters
  kf 0.1
  kr 0.01
  kcat 0.5
end parameters

begin molecule types
  A(b,s~U~P)
  B(a)
end molecule types

begin seed species
  A(b,s~U) 100
  B(a) 50
end seed species

begin observables
  Molecules Ap A(s~P)
  Molecules AB A(b!1).B(a!1)
  Molecules Atot A()
end observables

begin reaction rules
  A(b) + B(a) <-> A(b!1).B(a!1) kf, kr
  A(b!1,s~U).B(a!1) -> A(b!1,s~P).B(a!1) kcat
end reaction rules`;

const MINIMAL_MODEL = `begin parameters
  k 1
end parameters
begin molecule types
  X()
end molecule types
begin seed species
  X() 10
end seed species
begin observables
  Molecules Xtot X()
end observables
begin reaction rules
  X() -> 0 k
end reaction rules`;

const GARBAGE_CODE = 'not even close to BNGL @#$%^&*';

const SAMPLE_DATA = [
  { time: 0, observables: { Ap: 0, AB: 0 } },
  { time: 5, observables: { Ap: 30, AB: 20 } },
  { time: 10, observables: { Ap: 50, AB: 25 } },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertStructuredResponse(result: any): void {
  expect(result).toBeDefined();
  expect(result.content).toBeDefined();
  expect(result.structuredContent).toBeDefined();
}

/**
 * Some handlers let Zod validation errors propagate (parseArgs called outside
 * try/catch). This wrapper captures those throws so we can still assert the
 * handler produced a *meaningful* error rather than a segfault or hang.
 * Returns either the structured tool result or a synthetic error envelope.
 */
async function safeCall(fn: () => Promise<any>): Promise<any> {
  try {
    return await fn();
  } catch (err: any) {
    // The handler threw -- verify it is a meaningful error string
    const msg = err?.message ?? String(err);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    // Return a synthetic envelope so callers can do further checks
    return {
      content: [{ type: 'text', text: msg }],
      structuredContent: { error: msg },
    };
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP Tool Robustness', { timeout: 60000 }, () => {

  // =========================================================================
  // parse_bngl
  // =========================================================================
  describe('parse_bngl', () => {
    it('should parse a valid model', async () => {
      const result = await handleParseBngl({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.success).toBe(true);
    });

    it('should not crash on empty string', async () => {
      const result = await handleParseBngl({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage input', async () => {
      const result = await handleParseBngl({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code field', async () => {
      const result = await handleParseBngl({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on numeric code field', async () => {
      const result = await handleParseBngl({ code: 12345 as any });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // generate_network
  // =========================================================================
  describe('generate_network', () => {
    it('should generate a network from a valid model', async () => {
      const result = await handleGenerateNetwork({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.species).toBeDefined();
    });

    it('should not crash on empty code', async () => {
      const result = await handleGenerateNetwork({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code field', async () => {
      const result = await safeCall(() => handleGenerateNetwork({}));
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on model with no rules', async () => {
      const noRules = `begin parameters
  k 1
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 10
end seed species
begin observables
  Molecules Atot A()
end observables
begin reaction rules
end reaction rules`;
      const result = await handleGenerateNetwork({ code: noRules });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage code', async () => {
      const result = await handleGenerateNetwork({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });

    it('should respect max_agents limit', async () => {
      const result = await handleGenerateNetwork({ code: WORKING_MODEL, max_agents: 5 });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // simulate
  // =========================================================================
  describe('simulate', () => {
    it('should simulate a valid model with t_end', async () => {
      const result = await handleSimulate({ code: WORKING_MODEL, t_end: 5, n_steps: 10 });
      assertStructuredResponse(result);
      expect(result.structuredContent.data).toBeDefined();
    });

    it('should not crash with missing t_end (uses default)', async () => {
      const result = await handleSimulate({ code: WORKING_MODEL });
      assertStructuredResponse(result);
    });

    it('should not crash with zero t_end', async () => {
      const result = await handleSimulate({ code: WORKING_MODEL, t_end: 0 });
      assertStructuredResponse(result);
    });

    it('should not crash with negative t_end', async () => {
      const result = await safeCall(() => handleSimulate({ code: WORKING_MODEL, t_end: -5 }));
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on empty code', async () => {
      const result = await handleSimulate({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code field', async () => {
      const result = await safeCall(() => handleSimulate({}));
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleSimulate({ code: GARBAGE_CODE, t_end: 1 });
      assertStructuredResponse(result);
    });

    it('should simulate with SSA method', async () => {
      const result = await handleSimulate({ code: WORKING_MODEL, method: 'ssa', t_end: 1, n_steps: 5 });
      assertStructuredResponse(result);
    });

    it('should not crash on invalid method string', async () => {
      const result = await safeCall(() => handleSimulate({ code: WORKING_MODEL, method: 'bogus' as any, t_end: 1 }));
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash with numeric code field', async () => {
      const result = await safeCall(() => handleSimulate({ code: 999 as any, t_end: 1 }));
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });
  });

  // =========================================================================
  // parameter_scan
  // =========================================================================
  describe('parameter_scan', () => {
    it('should run a valid 1D scan', async () => {
      const result = await handleParameterScan({
        code: WORKING_MODEL,
        parameter: 'kf',
        start: 0.01,
        end: 1.0,
        steps: 3,
        t_end: 1,
        n_steps: 5,
      });
      assertStructuredResponse(result);
      expect(result.structuredContent.mode).toBe('1d');
    });

    it('should not crash on nonexistent parameter', async () => {
      const result = await handleParameterScan({
        code: WORKING_MODEL,
        parameter: 'nonexistent_param',
        start: 0.01,
        end: 1.0,
        steps: 3,
        t_end: 1,
        n_steps: 5,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleParameterScan({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing parameter name', async () => {
      const result = await handleParameterScan({ code: WORKING_MODEL, start: 0, end: 1, steps: 2 });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleParameterScan({
        code: GARBAGE_CODE,
        parameter: 'k',
        start: 0,
        end: 1,
        steps: 2,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // validate_model
  // =========================================================================
  describe('validate_model', () => {
    it('should validate a correct model', async () => {
      const result = await handleValidateModel({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.valid).toBe(true);
    });

    it('should not crash on empty code', async () => {
      const result = await handleValidateModel({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on invalid model', async () => {
      const result = await handleValidateModel({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleValidateModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on numeric code', async () => {
      const result = await handleValidateModel({ code: 42 as any });
      assertStructuredResponse(result);
    });

    it('should accept include_nfsim flag', async () => {
      const result = await handleValidateModel({ code: WORKING_MODEL, include_nfsim: true });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // get_contact_map
  // =========================================================================
  describe('get_contact_map', () => {
    it('should build contact map for valid model', async () => {
      const result = await handleGetContactMap({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.nodes).toBeDefined();
    });

    it('should not crash on empty model', async () => {
      const result = await handleGetContactMap({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleGetContactMap({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleGetContactMap({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // fit_parameters (input validation only - skip heavy compute)
  // =========================================================================
  describe('fit_parameters', () => {
    it('should not crash on valid input with low iterations', async () => {
      const result = await handleFitParameters({
        code: WORKING_MODEL,
        parameters: { kf: { min: 0.01, max: 1.0, initial: 0.1 } },
        data: SAMPLE_DATA,
        max_iterations: 2,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleFitParameters({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing parameters field', async () => {
      const result = await handleFitParameters({ code: WORKING_MODEL, data: SAMPLE_DATA });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing data field', async () => {
      const result = await handleFitParameters({
        code: WORKING_MODEL,
        parameters: { kf: { min: 0.01, max: 1.0 } },
      });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code with valid params/data', async () => {
      const result = await handleFitParameters({
        code: GARBAGE_CODE,
        parameters: { x: { min: 0, max: 1 } },
        data: [{ time: 0, observables: { y: 0 } }],
        max_iterations: 1,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // import_petab
  // =========================================================================
  describe('import_petab', () => {
    it('should not crash on empty input', async () => {
      const result = await handleImportPetab({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing measurements', async () => {
      const result = await handleImportPetab({ code: WORKING_MODEL, petab_parameters: 'col1\tcol2' });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on all empty strings', async () => {
      const result = await handleImportPetab({
        code: '',
        petab_parameters: '',
        petab_measurements: '',
      });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage TSV', async () => {
      const result = await handleImportPetab({
        code: WORKING_MODEL,
        petab_parameters: 'garbage\ttsv\ndata',
        petab_measurements: 'more\tgarbage\ntsv',
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // reduce_model
  // =========================================================================
  describe('reduce_model', () => {
    it('should not crash on valid input with low iterations', async () => {
      const result = await handleReduceModel({
        code: WORKING_MODEL,
        parameters: { kf: { min: 0.01, max: 1.0 } },
        data: SAMPLE_DATA,
        max_iterations: 2,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleReduceModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleReduceModel({
        code: GARBAGE_CODE,
        parameters: { k: { min: 0, max: 1 } },
        data: [{ time: 0, observables: { x: 0 } }],
        max_iterations: 1,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // query_pathway_commons
  // =========================================================================
  describe('query_pathway_commons', () => {
    it('should not crash on valid model', async () => {
      const result = await handleQueryPathwayCommons({ code: WORKING_MODEL });
      assertStructuredResponse(result);
    });

    it('should not crash on empty code', async () => {
      const result = await handleQueryPathwayCommons({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleQueryPathwayCommons({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleQueryPathwayCommons({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // sobol_sensitivity (input validation only)
  // =========================================================================
  describe('sobol_sensitivity', () => {
    it('should not crash on valid input with minimal samples', async () => {
      const result = await handleSobolSensitivity({
        code: MINIMAL_MODEL,
        parameters: [{ name: 'k', min: 0.1, max: 10 }],
        n_samples: 8,
        n_bootstrap: 10,
        t_end: 1,
        n_steps: 5,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleSobolSensitivity({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing parameters array', async () => {
      const result = await handleSobolSensitivity({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on empty parameters array', async () => {
      const result = await handleSobolSensitivity({ code: WORKING_MODEL, parameters: [] });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage code', async () => {
      const result = await handleSobolSensitivity({
        code: GARBAGE_CODE,
        parameters: [{ name: 'x', min: 0, max: 1 }],
        n_samples: 8,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // identifiability_analysis
  // =========================================================================
  describe('identifiability_analysis', () => {
    it('should not crash on valid input', async () => {
      const result = await handleIdentifiability({
        code: MINIMAL_MODEL,
        data: [
          { time: 0, observables: { Xtot: 10 } },
          { time: 1, observables: { Xtot: 3 } },
        ],
        n_grid: 3,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleIdentifiability({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing data', async () => {
      const result = await handleIdentifiability({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleIdentifiability({
        code: GARBAGE_CODE,
        data: [{ time: 0, observables: { x: 0 } }],
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // bayesian_inference (input validation only)
  // =========================================================================
  describe('bayesian_inference', () => {
    it('should not crash on valid input with minimal particles', async () => {
      const result = await handleBayesianInference({
        code: MINIMAL_MODEL,
        priors: [{ name: 'k', distribution: 'uniform', min: 0.1, max: 10 }],
        data: [
          { time: 0, observables: { Xtot: 10 } },
          { time: 1, observables: { Xtot: 3 } },
        ],
        n_particles: 5,
        n_populations: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleBayesianInference({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing priors', async () => {
      const result = await handleBayesianInference({
        code: WORKING_MODEL,
        data: SAMPLE_DATA,
      });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing data', async () => {
      const result = await handleBayesianInference({
        code: WORKING_MODEL,
        priors: [{ name: 'kf', distribution: 'uniform', min: 0.01, max: 1 }],
      });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleBayesianInference({
        code: GARBAGE_CODE,
        priors: [{ name: 'x', distribution: 'uniform', min: 0, max: 1 }],
        data: [{ time: 0, observables: { y: 0 } }],
        n_particles: 2,
        n_populations: 1,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // export_model
  // =========================================================================
  describe('export_model', () => {
    it('should export to sedml format', async () => {
      const result = await handleExportModel({ code: WORKING_MODEL, format: 'sedml' });
      assertStructuredResponse(result);
    });

    it('should export to omex format', async () => {
      const result = await handleExportModel({ code: WORKING_MODEL, format: 'omex' });
      assertStructuredResponse(result);
    });

    it('should export to sbml format', async () => {
      const result = await handleExportModel({ code: WORKING_MODEL, format: 'sbml' });
      assertStructuredResponse(result);
    });

    it('should export to annotations format', async () => {
      const result = await handleExportModel({ code: WORKING_MODEL, format: 'annotations' });
      assertStructuredResponse(result);
    });

    it('should not crash on invalid format', async () => {
      const result = await handleExportModel({ code: WORKING_MODEL, format: 'pdf' as any });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on empty input', async () => {
      const result = await handleExportModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing code', async () => {
      const result = await handleExportModel({ format: 'sbml' });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleExportModel({ code: GARBAGE_CODE, format: 'sbml' });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // compose_model
  // =========================================================================
  describe('compose_model', () => {
    it('should compose from valid statements', async () => {
      const result = await handleComposeModel({
        statements: ['A binds B with rate kon'],
      });
      assertStructuredResponse(result);
      expect(result.structuredContent.code).toBeDefined();
    });

    it('should not crash on empty statements array', async () => {
      const result = await handleComposeModel({ statements: [] });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleComposeModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage statements', async () => {
      const result = await handleComposeModel({
        statements: ['xyzzy plugh 12345 @#$'],
      });
      assertStructuredResponse(result);
    });

    it('should not crash on numeric statements', async () => {
      const result = await handleComposeModel({ statements: [12345 as any] });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // edit_model
  // =========================================================================
  describe('edit_model', () => {
    it('should apply valid operations', async () => {
      const result = await handleEditModel({
        code: WORKING_MODEL,
        operations: [{ action: 'set_parameter', name: 'kf', value: 0.5 }],
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty operations', async () => {
      const result = await handleEditModel({ code: WORKING_MODEL, operations: [] });
      assertStructuredResponse(result);
    });

    it('should not crash on missing operations field', async () => {
      const result = await handleEditModel({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on empty input', async () => {
      const result = await handleEditModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on invalid operation action', async () => {
      const result = await handleEditModel({
        code: WORKING_MODEL,
        operations: [{ action: 'nonexistent_action', name: 'x' }],
      });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage code', async () => {
      const result = await handleEditModel({
        code: GARBAGE_CODE,
        operations: [{ action: 'set_parameter', name: 'k', value: 1 }],
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // diagnose_model
  // =========================================================================
  describe('diagnose_model', () => {
    it('should diagnose a valid model', async () => {
      const result = await handleDiagnoseModel({
        code: WORKING_MODEL,
        t_end: 1,
        n_steps: 5,
        n_samples: 8,
        n_bootstrap: 10,
        max_parameters: 2,
      });
      assertStructuredResponse(result);
      expect(result.structuredContent.structure).toBeDefined();
    });

    it('should not crash on empty code', async () => {
      const result = await handleDiagnoseModel({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleDiagnoseModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleDiagnoseModel({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });

    it('should accept mode quick', async () => {
      const result = await handleDiagnoseModel({ code: WORKING_MODEL, mode: 'quick' });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // explain_model
  // =========================================================================
  describe('explain_model', () => {
    it('should explain a valid model', async () => {
      const result = await handleExplainModel({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.summary).toBeDefined();
    });

    it('should not crash on empty code', async () => {
      const result = await handleExplainModel({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleExplainModel({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleExplainModel({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });

    it('should accept include_crux flag', async () => {
      const result = await handleExplainModel({ code: WORKING_MODEL, include_crux: true });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // optimal_experiment
  // =========================================================================
  describe('optimal_experiment', () => {
    it('should not crash on valid model', async () => {
      const result = await handleOptimalExperiment({ code: WORKING_MODEL, t_end: 1 });
      assertStructuredResponse(result);
    });

    it('should not crash on empty code', async () => {
      const result = await handleOptimalExperiment({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleOptimalExperiment({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleOptimalExperiment({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });

    it('should accept candidate_times', async () => {
      const result = await handleOptimalExperiment({
        code: WORKING_MODEL,
        candidate_times: [0.5, 1.0, 2.0],
        t_end: 2,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // verify_model
  // =========================================================================
  describe('verify_model', () => {
    it('should verify reachability on valid model', async () => {
      const result = await handleVerifyModel({
        code: WORKING_MODEL,
        query: 'reachable? A(s~P)',
      });
      assertStructuredResponse(result);
    });

    it('should not crash on invalid query string', async () => {
      const result = await handleVerifyModel({
        code: WORKING_MODEL,
        query: 'nonsense query !!!',
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleVerifyModel({});
      assertStructuredResponse(result);
    });

    it('should not crash on missing query', async () => {
      const result = await handleVerifyModel({ code: WORKING_MODEL });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage code', async () => {
      const result = await handleVerifyModel({ code: GARBAGE_CODE, query: 'reachable? X' });
      assertStructuredResponse(result);
    });

    it('should handle deadlock query', async () => {
      const result = await handleVerifyModel({ code: WORKING_MODEL, query: 'deadlock?' });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // bifurcation_analysis
  // =========================================================================
  describe('bifurcation_analysis', () => {
    it('should analyze valid model', async () => {
      const result = await handleBifurcationAnalysis({
        code: WORKING_MODEL,
        parameter: 'kf',
        start_value: 0.01,
        end_value: 1.0,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on nonexistent parameter', async () => {
      const result = await handleBifurcationAnalysis({
        code: WORKING_MODEL,
        parameter: 'nonexistent',
        start_value: 0,
        end_value: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleBifurcationAnalysis({});
      assertStructuredResponse(result);
    });

    it('should not crash on missing parameter', async () => {
      const result = await handleBifurcationAnalysis({
        code: WORKING_MODEL,
        start_value: 0,
        end_value: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage code', async () => {
      const result = await handleBifurcationAnalysis({
        code: GARBAGE_CODE,
        parameter: 'k',
        start_value: 0,
        end_value: 1,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // temporal_analysis
  // =========================================================================
  describe('temporal_analysis', () => {
    it('should analyze valid model', async () => {
      const result = await handleTemporalAnalysis({
        code: WORKING_MODEL,
        t_end: 1,
        n_steps: 10,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty code', async () => {
      const result = await handleTemporalAnalysis({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleTemporalAnalysis({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleTemporalAnalysis({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // symbolic_steady_state
  // =========================================================================
  describe('symbolic_steady_state', () => {
    it('should compute steady state for a small model', async () => {
      const result = await handleSymbolicSteadyState({ code: MINIMAL_MODEL });
      assertStructuredResponse(result);
    });

    it('should not crash on valid larger model', async () => {
      const result = await handleSymbolicSteadyState({ code: WORKING_MODEL });
      assertStructuredResponse(result);
    });

    it('should not crash on empty code', async () => {
      const result = await handleSymbolicSteadyState({ code: '' });
      assertStructuredResponse(result);
    });

    it('should not crash on missing code', async () => {
      const result = await handleSymbolicSteadyState({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleSymbolicSteadyState({ code: GARBAGE_CODE });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // compare_models
  // =========================================================================
  describe('compare_models', () => {
    it('should compare two valid variants', async () => {
      const result = await handleCompareModels({
        variants: [
          { name: 'fast', code: WORKING_MODEL.replace('kf 0.1', 'kf 1.0') },
          { name: 'slow', code: WORKING_MODEL.replace('kf 0.1', 'kf 0.001') },
        ],
        t_end: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on single variant', async () => {
      const result = await handleCompareModels({
        variants: [{ name: 'only', code: WORKING_MODEL }],
        t_end: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty variants array', async () => {
      const result = await handleCompareModels({ variants: [] });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleCompareModels({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code in variants', async () => {
      const result = await handleCompareModels({
        variants: [
          { name: 'bad1', code: GARBAGE_CODE },
          { name: 'bad2', code: 'also garbage' },
        ],
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // search_structure
  // =========================================================================
  describe('search_structure', () => {
    it('should not crash on valid input', async () => {
      const result = await handleSearchStructure({
        code: WORKING_MODEL,
        experimental_data: SAMPLE_DATA,
        n_particles: 2,
        n_generations: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handleSearchStructure({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing experimental_data', async () => {
      const result = await handleSearchStructure({ code: WORKING_MODEL });
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on garbage code', async () => {
      const result = await handleSearchStructure({
        code: GARBAGE_CODE,
        experimental_data: [{ time: 0, observables: { x: 0 } }],
        n_particles: 2,
        n_generations: 1,
      });
      assertStructuredResponse(result);
    });

    it('should not crash on empty experimental_data', async () => {
      const result = await handleSearchStructure({
        code: WORKING_MODEL,
        experimental_data: [],
        n_particles: 2,
        n_generations: 1,
      });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // pkpd
  // =========================================================================
  describe('pkpd', () => {
    it('should generate a PK model', async () => {
      const result = await handlePKPD({
        action: 'generate_model',
        model_type: '1cmt',
        drug_name: 'DrugA',
        route: 'iv',
      });
      assertStructuredResponse(result);
    });

    it('should not crash on invalid action', async () => {
      const result = await handlePKPD({ action: 'nonexistent_action' as any });
      assertStructuredResponse(result);
    });

    it('should not crash on empty input', async () => {
      const result = await handlePKPD({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on compute_metrics without required fields', async () => {
      const result = await handlePKPD({ action: 'compute_metrics' });
      assertStructuredResponse(result);
    });

    it('should not crash on simulate_dosing without model', async () => {
      const result = await handlePKPD({ action: 'simulate_dosing', dose: 100 });
      assertStructuredResponse(result);
    });

    it('should not crash on population_simulation without code', async () => {
      const result = await handlePKPD({ action: 'population_simulation', n_patients: 5 });
      assertStructuredResponse(result);
    });
  });

  // =========================================================================
  // multiscale_simulation (input validation only)
  // =========================================================================
  describe('multiscale_simulation', () => {
    it('should not crash on empty input', async () => {
      const result = await handleMultiscaleSimulation({});
      assertStructuredResponse(result);
      expect(result.structuredContent.error).toBeDefined();
    });

    it('should not crash on missing definition', async () => {
      const result = await handleMultiscaleSimulation({ max_cells: 10 });
      assertStructuredResponse(result);
    });

    it('should not crash on empty definition object', async () => {
      const result = await handleMultiscaleSimulation({ definition: {} });
      assertStructuredResponse(result);
    });

    it('should not crash on garbage definition', async () => {
      const result = await handleMultiscaleSimulation({
        definition: { garbage: true, cells: 'not_valid' },
      });
      assertStructuredResponse(result);
    });

    it('should not crash on numeric definition', async () => {
      const result = await handleMultiscaleSimulation({ definition: 12345 as any });
      assertStructuredResponse(result);
    });
  });
});
