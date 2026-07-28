import { describe, it, expect } from 'vitest';
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

const seedExpressionModel = `
begin parameters
    A0 10
end parameters
begin molecule types
    A()
end molecule types
begin seed species
    A() A0
end seed species
begin observables
    Molecules A_obs A()
end observables
begin reaction rules
end reaction rules
`;

describe('MCP Server Tools Functional Validation', () => {
    it('should parse BNGL code (parse_bngl)', async () => {
        const result = await handleParseBngl({ code: simpleModel });
        expect((result.structuredContent as any).success).toBe(true);
        expect((result.structuredContent as any).model).toBeDefined();
        expect((result.structuredContent as any).model?.species.length).toBe(2);
    });

    it('should generate reaction network (generate_network)', async () => {
        const result = await handleGenerateNetwork({ code: simpleModel });
        expect((result.structuredContent as any).species).toBeDefined();
        expect((result.structuredContent as any).reactions).toBeDefined();
        // A + B -> complex (3 species total: A, B, Complex)
        expect((result.structuredContent as any).species.length).toBe(3);
    });

    it('should simulate model (simulate ODE)', async () => {
        const result = await handleSimulate({
            code: simpleModel,
            method: 'ode',
            t_end: 1,
            n_steps: 10
        });
        expect((result.structuredContent as any).data).toBeDefined();
        expect((result.structuredContent as any).data.length).toBe(11); // 0 to 10 steps
        expect((result.structuredContent as any).data[0].A_free).toBeCloseTo(100);
    });

    it('should simulate model (simulate SSA)', async () => {
        const result = await handleSimulate({
            code: simpleModel,
            method: 'ssa',
            t_end: 1,
            n_steps: 5
        });
        expect((result.structuredContent as any).data).toBeDefined();
        expect((result.structuredContent as any).data.length).toBe(6);
        // SSA results should be integers
        expect(Number.isInteger((result.structuredContent as any).data[0].A_free)).toBe(true);
    });

    it('should support observables_only output mode for token-efficient clients', async () => {
        const result = await handleSimulate({
            code: simpleModel,
            method: 'ode',
            t_end: 1,
            n_steps: 1,
            output_mode: 'observables_only',
        });

        expect((result.structuredContent as any).data).toBeDefined();
        expect((result.structuredContent as any).expandedReactions).toBeUndefined();
        expect((result.structuredContent as any).expandedSpecies).toBeUndefined();
        expect((result.structuredContent as any).speciesData).toBeUndefined();
        expect((result.structuredContent as any).speciesDataBySuffix).toBeUndefined();
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
        expect((result.structuredContent as any).mode).toBe('1d');
        expect((result.structuredContent as any).xValues.length).toBe(3);
        expect((result.structuredContent as any).observables.Complex).toBeDefined();
        expect((result.structuredContent as any).observables.Complex.length).toBe(3);
    });

    it('should re-evaluate seed species expressions during parameter_scan', async () => {
        const result = await handleParameterScan({
            code: seedExpressionModel,
            parameter: 'A0',
            start: 10,
            end: 30,
            steps: 3,
            t_end: 1,
            n_steps: 1,
        });

        expect((result.structuredContent as any).mode).toBe('1d');
        expect((result.structuredContent as any).observables.A_obs.length).toBe(3);
        expect((result.structuredContent as any).observables.A_obs[0]).toBeCloseTo(10, 6);
        expect((result.structuredContent as any).observables.A_obs[2]).toBeCloseTo(30, 6);
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
        expect((result.structuredContent as any).mode).toBe('2d');
        expect((result.structuredContent as any).xValues.length).toBe(2);
        expect((result.structuredContent as any).yValues.length).toBe(2);
        expect((result.structuredContent as any).observables.Complex).toBeDefined();
        // 2D result is number[][]
        expect(Array.isArray((result.structuredContent as any).observables.Complex[0])).toBe(true);
    });

    it('should validate model (validate_model)', async () => {
        const result = await handleValidateModel({ code: simpleModel });
        expect((result.structuredContent as any).valid).toBe(true);
        expect((result.structuredContent as any).summary.errors).toBe(0);
    });

    it('should get contact map (get_contact_map)', async () => {
        const result = await handleGetContactMap({ code: simpleModel });
        expect((result.structuredContent as any).nodes.length).toBeGreaterThan(0);
        expect((result.structuredContent as any).edges.length).toBeGreaterThan(0);
        // Nodes: A, B, A.b, B.a
        const molNames = ((result.structuredContent as any).nodes as Array<{ type?: string; label?: string }>).filter((n) => n.type === 'molecule').map((n) => n.label);
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
        expect((result.structuredContent as any).params).toBeDefined();
        expect((result.structuredContent as any).paramNames).toContain('k1');
    });

    it('should diagnose model (diagnose)', async () => {
        const result = await handleDiagnose({ code: simpleModel });
        expect((result.structuredContent as any).stiffness).toBeDefined();
        expect((result.structuredContent as any).estimation).toBeDefined();
        expect((result.structuredContent as any).estimation.rules).toBe(2);
    });

    it('should compose model from natural language statements (compose_model)', async () => {
        const result = await handleComposeModel({
            statements: ['A binds B with rate k_bind']
        });
        expect((result.structuredContent as any).code).toContain('begin reaction rules');
        expect((result.structuredContent as any).rules.length).toBeGreaterThan(0);
        expect((result.structuredContent as any).analysis.recognizedCount).toBe(1);
        expect((result.structuredContent as any).molecules.length).toBeGreaterThan(0);
        expect((result.structuredContent as any).confirmation).toContain('Parsed 1/1 statements');
    });

    it('should compose model using grammar synonyms (compose_model associates)', async () => {
        const result = await handleComposeModel({
            statements: ['EGF associates with EGFR with rate kon']
        });
        expect((result.structuredContent as any).analysis.recognizedCount).toBe(1);
        expect((result.structuredContent as any).rules.length).toBeGreaterThan(0);
    });

    it('should edit model with structured operations (edit_model)', async () => {
        const result = await handleEditModel({
            code: simpleModel,
            operations: [
                { action: 'set_parameter', name: 'k1', value: 0.2 },
                { action: 'add_observable', name: 'A_total', type: 'Molecules', pattern: 'A(b)' }
            ]
        });
        expect((result.structuredContent as any).code).toContain('k1 0.2');
        expect((result.structuredContent as any).validation.valid).toBe(true);
        expect((result.structuredContent as any).summary.length).toBe(2);
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
        expect((result.structuredContent as any).structure).toBeDefined();
        expect((result.structuredContent as any).stiffness).toBeDefined();
        expect((result.structuredContent as any).dynamics).toBeDefined();
        expect((result.structuredContent as any).sobol).toBeDefined();
        expect((result.structuredContent as any).fim).toBeDefined();
        expect((result.structuredContent as any).convergenceAssessment).toBeDefined();
        expect(typeof (result.structuredContent as any).convergenceAssessment.insightSaturated).toBe('boolean');
        expect(['continue_analysis', 'collect_more_data', 'done']).toContain((result.structuredContent as any).convergenceAssessment.recommendation);
        expect(Array.isArray((result.structuredContent as any).ruleAttribution)).toBe(true);
        expect((result.structuredContent as any).parameterSelection).toBeDefined();
        expect((result.structuredContent as any).parameterSelection.analyzed).toBeLessThanOrEqual(2);
        expect(Array.isArray((result.structuredContent as any).surprises)).toBe(true);
        const firstTrace = (result.structuredContent as any).ruleAttribution[0];
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
        expect((result.structuredContent as any).profileLikelihood).toBeDefined();
        expect((result.structuredContent as any).profileLikelihood.profiles).toBeDefined();
        expect((result.structuredContent as any).profileLikelihood.baselineSSR).toBeGreaterThanOrEqual(0);
        const paramNames = Object.keys((result.structuredContent as any).profileLikelihood.profiles);
        expect(paramNames.length).toBeGreaterThan(0);
        for (const name of paramNames) {
            const profile = (result.structuredContent as any).profileLikelihood.profiles[name];
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

    it('should include contact map path in rule attribution', async () => {
        const result = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1, n_steps: 10,
            n_samples: 8, n_bootstrap: 10, max_parameters: 2,
        });
        const trace = (result.structuredContent as any).ruleAttribution;
        expect(trace).toBeDefined();
        expect(trace.length).toBeGreaterThan(0);
        // At least one trace entry should have contactMapPath or narrative
        const hasContactPath = (trace as Array<{ contactMapPath?: string[] }>).some((t) => t.contactMapPath && t.contactMapPath.length > 0);
        const hasNarrative = (trace as Array<{ narrative?: string }>).some((t) => t.narrative && t.narrative.length > 0);
        expect(hasContactPath || hasNarrative).toBe(true);
    });

    it('should return three-register summary', async () => {
        const result = await handleDiagnoseModel({
            code: simpleModel,
            t_end: 1, n_steps: 10,
            n_samples: 8, n_bootstrap: 10, max_parameters: 2,
        });
        expect((result.structuredContent as any).summary).toBeDefined();
        expect(typeof (result.structuredContent as any).summary.technical).toBe('string');
        expect(typeof (result.structuredContent as any).summary.biological).toBe('string');
        expect(typeof (result.structuredContent as any).summary.strategic).toBe('string');
        expect((result.structuredContent as any).summary.technical.length).toBeGreaterThan(0);
    });

    it('should explain model in narrative form (explain_model)', async () => {
        const result = await handleExplainModel({ code: simpleModel });
        expect((result.structuredContent as any).summary).toContain('Model contains');
        expect(Array.isArray((result.structuredContent as any).sections)).toBe(true);
        expect((result.structuredContent as any).sections.length).toBeGreaterThan(0);
    });

    it('should suggest fixes and optional autocorrected code (suggest_fix)', async () => {
        const modelWithoutObservables = simpleModel.replace(/begin observables[\s\S]*?end observables/m, 'begin observables\nend observables');
        const result = await handleSuggestFix({
            code: modelWithoutObservables,
            include_auto_corrected_code: true,
        });
        expect((result.structuredContent as any).fixes.length).toBeGreaterThan(0);
        expect((result.structuredContent as any).auto_corrected_code).toContain('begin observables');
    });

    describe('unreachable rules analysis', () => {
        it('should detect unreachable rules in a model with dead rules', async () => {
            // A model where Rule2 requires a phosphorylated species that
            // no seed species provides and no other rule creates
            const bnglWithDeadRule = `
begin model
begin parameters
    kf 1.0
    kr 0.5
end parameters
begin molecule types
    A(b,p~u~p)
    B(a)
    C(a)
end molecule types
begin seed species
    A(b,p~u) 100
    B(a) 100
end seed species
begin observables
    Molecules Atot A()
end observables
begin reaction rules
    # Rule 1: A binds B (reachable — both seeds exist)
    Rule1: A(b,p~u) + B(a) <-> A(b!1,p~u).B(a!1) kf, kr
    # Rule 2: C unbinds (UNREACHABLE — no seed species for C)
    Rule2: C(a) -> B(a) kr
end reaction rules
end model
`;
            const result = await handleDiagnoseModel({
                code: bnglWithDeadRule,
                t_end: 1,
                n_steps: 2,
                n_samples: 2,
                n_bootstrap: 2,
                max_parameters: 1,
            });

            expect((result.structuredContent as any).unreachableAnalysis).toBeDefined();
            expect((result.structuredContent as any).unreachableAnalysis!.unreachableRules.length).toBeGreaterThan(0);
            expect((result.structuredContent as any).unreachableAnalysis!.unreachableRules).toContain('Rule2');
        });

        it('should report all rules reachable for a well-formed model', async () => {
            // Use a known-good model where all rules are reachable
            const goodModel = `
begin model
begin parameters
    kf 1.0
    kr 0.5
end parameters
begin molecule types
    A(b)
    B(a)
end molecule types
begin seed species
    A(b) 100
    B(a) 100
end seed species
begin observables
    Molecules AB A(b!1).B(a!1)
end observables
begin reaction rules
    A(b) + B(a) <-> A(b!1).B(a!1) kf, kr
end reaction rules
end model
`;
            const result = await handleDiagnoseModel({
                code: goodModel,
                t_end: 1,
                n_steps: 2,
                n_samples: 2,
                n_bootstrap: 2,
                max_parameters: 1,
            });

            expect((result.structuredContent as any).unreachableAnalysis).toBeDefined();
            expect((result.structuredContent as any).unreachableAnalysis!.unreachableRules).toEqual([]);
            expect((result.structuredContent as any).unreachableAnalysis!.totalRules).toBe(1);  // 1 reversible rule
        });
    });
});
