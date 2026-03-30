import { describe, it, expect, vi } from 'vitest';
import { handleParseBngl } from '../src/handlers/parseBngl';
import { handleGenerateNetwork } from '../src/handlers/generateNetwork';
import { handleSimulate } from '../src/handlers/simulate';
import { handleParameterScan } from '../src/handlers/parameterScan';
import { handleValidateModel } from '../src/handlers/validateModel';
import { handleGetContactMap } from '../src/handlers/getContactMap';
import { handleFitParameters } from '../src/handlers/fitParameters';
import { handleDiagnose } from '../src/handlers/diagnose';
import { handleComposeModel } from '../src/handlers/composeModel';
import { handleEditModel } from '../src/handlers/editModel';
import { handleDiagnoseModel } from '../src/handlers/diagnoseModel';
import { handleExplainModel } from '../src/handlers/explainModel';
import { handleSuggestFix } from '../src/handlers/suggestFix';

const simpleModel = `
begin parameters
  k1 0.1
  k2 0.01
end parameters
begin molecule types
  A(b)
  B(a)
end molecule types
begin seed species
  A(b) 100
  B(a) 50
end seed species
begin observables
  Molecules A_free A(b)
  Molecules B_free B(a)
  Molecules Complex A(b!1).B(a!1)
end observables
begin reaction rules
  A(b) + B(a) -> A(b!1).B(a!1) k1
  A(b!1).B(a!1) -> A(b) + B(a) k2
end reaction rules
`;

describe('MCP Server Tools Functional Validation', () => {
    it('should parse BNGL code (parse_bngl)', async () => {
        const result = await handleParseBngl({ code: simpleModel });
        expect(result.structuredContent.success).toBe(true);
        expect(result.structuredContent.model).toBeDefined();
        expect(result.structuredContent.model?.species.length).toBe(2);
    });

    it('should generate reaction network (generate_network)', async () => {
        const result = await handleGenerateNetwork({ code: simpleModel });
        expect(result.structuredContent.species).toBeDefined();
        expect(result.structuredContent.reactions).toBeDefined();
        // A + B -> complex (3 species total: A, B, Complex)
        expect(result.structuredContent.species.length).toBe(3);
    });

    it('should simulate model (simulate ODE)', async () => {
        const result = await handleSimulate({
            code: simpleModel,
            method: 'ode',
            t_end: 1,
            n_steps: 10
        });
        expect(result.structuredContent.data).toBeDefined();
        expect(result.structuredContent.data.length).toBe(11); // 0 to 10 steps
        expect(result.structuredContent.data[0].A_free).toBeCloseTo(100);
    });

    it('should simulate model (simulate SSA)', async () => {
        const result = await handleSimulate({
            code: simpleModel,
            method: 'ssa',
            t_end: 1,
            n_steps: 5
        });
        expect(result.structuredContent.data).toBeDefined();
        expect(result.structuredContent.data.length).toBe(6);
        // SSA results should be integers
        expect(Number.isInteger(result.structuredContent.data[0].A_free)).toBe(true);
    });

    it('should run 1D parameter scan', async () => {
        const result = await handleParameterScan({
            code: simpleModel,
            parameter: 'k1',
            start: 0.1,
            end: 0.5,
            steps: 3,
            t_end: 1,
            n_steps: 2
        });
        expect(result.structuredContent.mode).toBe('1d');
        expect(result.structuredContent.xValues.length).toBe(3);
        expect(result.structuredContent.observables.Complex).toBeDefined();
        expect(result.structuredContent.observables.Complex.length).toBe(3);
    });

    it('should run 2D parameter scan', async () => {
        const result = await handleParameterScan({
            code: simpleModel,
            parameter: 'k1',
            start: 0.1,
            end: 0.5,
            steps: 2,
            parameter2: 'k2',
            start2: 0.01,
            end2: 0.1,
            steps2: 2,
            t_end: 1,
            n_steps: 2
        });
        expect(result.structuredContent.mode).toBe('2d');
        expect(result.structuredContent.xValues.length).toBe(2);
        expect(result.structuredContent.yValues.length).toBe(2);
        expect(result.structuredContent.observables.Complex).toBeDefined();
        // 2D result is number[][]
        expect(Array.isArray(result.structuredContent.observables.Complex[0])).toBe(true);
    });

    it('should validate model (validate_model)', async () => {
        const result = await handleValidateModel({ code: simpleModel });
        expect(result.structuredContent.valid).toBe(true);
        expect(result.structuredContent.summary.errors).toBe(0);
    });

    it('should get contact map (get_contact_map)', async () => {
        const result = await handleGetContactMap({ code: simpleModel });
        expect(result.structuredContent.nodes.length).toBeGreaterThan(0);
        expect(result.structuredContent.edges.length).toBeGreaterThan(0);
        // Nodes: A, B, A.b, B.a
        const molNames = result.structuredContent.nodes.filter(n => n.type === 'molecule').map(n => n.label);
        expect(molNames).toContain('A');
        expect(molNames).toContain('B');
    });

    it('should fit parameters (fit_parameters)', async () => {
        const result = await handleFitParameters({
            code: simpleModel,
            parameters: {
                k1: { min: 0.01, max: 1.0, initial: 0.1 }
            },
            data: [
                { time: 0, observables: { Complex: 0 } },
                { time: 1, observables: { Complex: 5 } }
            ],
            max_iterations: 5
        });
        expect(result.structuredContent.params).toBeDefined();
        expect(result.structuredContent.paramNames).toContain('k1');
    });

    it('should diagnose model (diagnose)', async () => {
        const result = await handleDiagnose({ code: simpleModel });
        expect(result.structuredContent.stiffness).toBeDefined();
        expect(result.structuredContent.estimation).toBeDefined();
        expect(result.structuredContent.estimation.rules).toBe(2);
    });

    it('should compose model from natural language statements (compose_model)', async () => {
        const result = await handleComposeModel({
            statements: ['A binds B with rate k_bind']
        });
        expect(result.structuredContent.code).toContain('begin reaction rules');
        expect(result.structuredContent.rules.length).toBeGreaterThan(0);
        expect(result.structuredContent.analysis.recognizedCount).toBe(1);
        expect(result.structuredContent.molecules.length).toBeGreaterThan(0);
        expect(result.structuredContent.confirmation).toContain('Parsed 1/1 statements');
    });

    it('should compose model using grammar synonyms (compose_model associates)', async () => {
        const result = await handleComposeModel({
            statements: ['EGF associates with EGFR with rate kon']
        });
        expect(result.structuredContent.analysis.recognizedCount).toBe(1);
        expect(result.structuredContent.rules.length).toBeGreaterThan(0);
    });

    it('should edit model with structured operations (edit_model)', async () => {
        const result = await handleEditModel({
            code: simpleModel,
            operations: [
                { action: 'set_parameter', name: 'k1', value: 0.2 },
                { action: 'add_observable', name: 'A_total', type: 'Molecules', pattern: 'A(b)' }
            ]
        });
        expect(result.structuredContent.code).toContain('k1 0.2');
        expect(result.structuredContent.validation.valid).toBe(true);
        expect(result.structuredContent.summary.length).toBe(2);
    });

    it('should run deep model diagnosis (diagnose_model)', async () => {
        const result = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1,
            n_steps: 10,
            n_samples: 8,
            n_bootstrap: 10,
            max_parameters: 2,
        });
        expect(result.structuredContent.structure).toBeDefined();
        expect(result.structuredContent.stiffness).toBeDefined();
        expect(result.structuredContent.dynamics).toBeDefined();
        expect(result.structuredContent.sobol).toBeDefined();
        expect(result.structuredContent.fim).toBeDefined();
        expect(result.structuredContent.convergenceAssessment).toBeDefined();
        expect(typeof result.structuredContent.convergenceAssessment.insightSaturated).toBe('boolean');
        expect(['continue_analysis', 'collect_more_data', 'done']).toContain(result.structuredContent.convergenceAssessment.recommendation);
        expect(Array.isArray(result.structuredContent.mechanisticCausalTrace)).toBe(true);
        expect(result.structuredContent.parameterSelection).toBeDefined();
        expect(result.structuredContent.parameterSelection.analyzed).toBeLessThanOrEqual(2);
        expect(Array.isArray(result.structuredContent.surprises)).toBe(true);
        const firstTrace = result.structuredContent.mechanisticCausalTrace[0];
        if (firstTrace) {
            expect(firstTrace.topologyPath || firstTrace.targetObservable).toBeDefined();
        }
    });

    it('should run profile likelihood when experimental data provided', async () => {
        const result = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1,
            n_steps: 10,
            n_samples: 8,
            n_bootstrap: 10,
            max_parameters: 2,
            experimental_data: [
                { time: 0, observables: { A_free: 100, Complex: 0 } },
                { time: 0.5, observables: { A_free: 80, Complex: 10 } },
                { time: 1, observables: { A_free: 70, Complex: 15 } },
            ],
        });
        expect(result.structuredContent.profileLikelihood).toBeDefined();
        expect(result.structuredContent.profileLikelihood.profiles).toBeDefined();
        expect(result.structuredContent.profileLikelihood.baselineSSR).toBeGreaterThanOrEqual(0);
        const paramNames = Object.keys(result.structuredContent.profileLikelihood.profiles);
        expect(paramNames.length).toBeGreaterThan(0);
        for (const name of paramNames) {
            const profile = result.structuredContent.profileLikelihood.profiles[name];
            expect(['identifiable', 'practically_unidentifiable', 'structurally_unidentifiable']).toContain(profile.identifiability);
        }
    });

    it('should pass experimental error weights into profile likelihood', async () => {
        const weighted = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1,
            n_steps: 10,
            n_samples: 8,
            n_bootstrap: 10,
            max_parameters: 2,
            experimental_data: [
                { time: 0, observables: { A_free: 100, Complex: 0 }, errors: { A_free: 1, Complex: 1 } },
                { time: 0.5, observables: { A_free: 80, Complex: 10 }, errors: { A_free: 0.5, Complex: 0.5 } },
                { time: 1, observables: { A_free: 70, Complex: 15 }, errors: { A_free: 0.25, Complex: 0.25 } },
            ],
        });
        const unweighted = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1,
            n_steps: 10,
            n_samples: 8,
            n_bootstrap: 10,
            max_parameters: 2,
            experimental_data: [
                { time: 0, observables: { A_free: 100, Complex: 0 } },
                { time: 0.5, observables: { A_free: 80, Complex: 10 } },
                { time: 1, observables: { A_free: 70, Complex: 15 } },
            ],
        });

        expect(weighted.structuredContent.profileLikelihood).toBeDefined();
        expect(unweighted.structuredContent.profileLikelihood).toBeDefined();
        expect(weighted.structuredContent.profileLikelihood.baselineSSR).not.toBe(unweighted.structuredContent.profileLikelihood.baselineSSR);
    });

    it('should include contact map path in causal trace', async () => {
        const result = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1, n_steps: 10,
            n_samples: 8, n_bootstrap: 10, max_parameters: 2,
        });
        const trace = result.structuredContent.mechanisticCausalTrace;
        expect(trace).toBeDefined();
        expect(trace.length).toBeGreaterThan(0);
        // At least one trace entry should have contactMapPath or narrative
        const hasContactPath = trace.some(t => t.contactMapPath && t.contactMapPath.length > 0);
        const hasNarrative = trace.some(t => t.narrative && t.narrative.length > 0);
        expect(hasContactPath || hasNarrative).toBe(true);
    });

    it('should return three-register summary', async () => {
        const result = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1, n_steps: 10,
            n_samples: 8, n_bootstrap: 10, max_parameters: 2,
        });
        expect(result.structuredContent.summary).toBeDefined();
        expect(typeof result.structuredContent.summary.technical).toBe('string');
        expect(typeof result.structuredContent.summary.biological).toBe('string');
        expect(typeof result.structuredContent.summary.strategic).toBe('string');
        expect(result.structuredContent.summary.technical.length).toBeGreaterThan(0);
    });

    it('should explain model in narrative form (explain_model)', async () => {
        const result = await handleExplainModel({ code: simpleModel });
        expect(result.structuredContent.summary).toContain('Model contains');
        expect(Array.isArray(result.structuredContent.sections)).toBe(true);
        expect(result.structuredContent.sections.length).toBeGreaterThan(0);
    });

    it('should suggest fixes and optional autocorrected code (suggest_fix)', async () => {
        const modelWithoutObservables = simpleModel.replace(/begin observables[\s\S]*?end observables/m, 'begin observables\nend observables');
        const result = await handleSuggestFix({
            code: modelWithoutObservables,
            include_auto_corrected_code: true,
        });
        expect(result.structuredContent.fixes.length).toBeGreaterThan(0);
        expect(result.structuredContent.auto_corrected_code).toContain('begin observables');
    });
});
