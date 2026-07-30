import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel } from '../services/engine.js';
import { simulate, loadEvaluator, findConservationLaws } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const checkPhaseHandoffArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameter: z.string().describe('Parameter to change for phase transition'),
    initial_value: z.number().describe('Initial parameter value'),
    final_value: z.number().describe('Final parameter value after transition'),
    transition_time: z.number().positive().describe('Time for phase 1 (equilibration)'),
    observable: z.string().optional().describe('Observable to track (default: first)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time for each phase (default: transition_time)'),
}).strict();

type CheckPhaseHandoffArgs = z.infer<typeof checkPhaseHandoffArgsSchema>;

export async function handleCheckPhaseHandoff(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('check_phase_handoff', checkPhaseHandoffArgsSchema, args) as CheckPhaseHandoffArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);
        
        if (!(parsedArgs.parameter in model.parameters)) {
            throw new Error(`Unknown parameter '${parsedArgs.parameter}'. Available parameters: ${Object.keys(model.parameters).join(', ') || '(none)'}`);
        }
        if (parsedArgs.observable && !model.observables.some((o) => o.name === parsedArgs.observable)) {
            throw new Error(`Unknown observable '${parsedArgs.observable}'. Available observables: ${model.observables.map((o) => o.name).join(', ') || '(none)'}`);
        }

        const tEnd = parsedArgs.t_end ?? parsedArgs.transition_time;
        
        await loadEvaluator();
        
        const obsName = parsedArgs.observable ?? model.observables[0]?.name ?? '';
        
        // Phase 1: Equilibrate at initial parameter value
        const phase1Model = cloneExpandedModel(expandedModel);
        phase1Model.parameters[parsedArgs.parameter] = parsedArgs.initial_value;
        
        const phase1Result = await simulate(0, phase1Model, {
            method: parsedArgs.method ?? 'ode',
            t_end: parsedArgs.transition_time,
            n_steps: 100,
        }, {
            checkCancelled: () => {},
            postMessage: () => {},
        });
        
        // Get endpoint state from Phase 1
        const phase1Endpoint = phase1Result.data[phase1Result.data.length - 1];
        const phase1State: Record<string, number> = {};
        for (const key of Object.keys(phase1Endpoint)) {
            if (key !== 'time') {
                phase1State[key] = Number(phase1Endpoint[key]);
            }
        }
        
        // Compute conservation laws at end of Phase 1
        const speciesNames = expandedModel.species.map(s => s.name);
        const y0 = new Float64Array(speciesNames.length);
        for (let i = 0; i < speciesNames.length; i++) {
            y0[i] = phase1State[speciesNames[i]] ?? 0;
        }
        
        // Need reactions for conservation law analysis - use the expanded model's reactions
        const reactions = (expandedModel as any).reactions ?? [];
        let conservationAnalysis: any = null;
        try {
            conservationAnalysis = findConservationLaws(reactions, speciesNames.length, y0, speciesNames);
        } catch (e) {
            // Conservation analysis may fail for some models
        }
        
        // Phase 2: Start from Phase 1 endpoint, change parameter abruptly
        const phase2Model = cloneExpandedModel(expandedModel);
        phase2Model.parameters[parsedArgs.parameter] = parsedArgs.final_value;
        
        // Set initial concentrations to Phase 1 endpoint
        for (const sp of phase2Model.species) {
            if (phase1State[sp.name] !== undefined) {
                sp.initialConcentration = phase1State[sp.name];
            }
        }
        
        const phase2Result = await simulate(0, phase2Model, {
            method: parsedArgs.method ?? 'ode',
            t_end: tEnd,
            n_steps: 100,
        }, {
            checkCancelled: () => {},
            postMessage: () => {},
        });
        
        // Get Phase 2 endpoint
        const phase2Endpoint = phase2Result.data[phase2Result.data.length - 1];
        
        // Validate conservation laws across phase boundary
        const conservationViolations: Array<{
            law: string;
            phase1Total: number;
            phase2Total: number;
            discontinuity: number;
            severity: 'low' | 'medium' | 'high';
        }> = [];
        
        if (conservationAnalysis?.laws && conservationAnalysis.laws.length > 0) {
            for (const law of conservationAnalysis.laws) {
                // Compute total at Phase 1 endpoint using coefficients array
                let phase1Total = 0;
                for (let i = 0; i < law.coefficients.length; i++) {
                    if (Math.abs(law.coefficients[i]) > 1e-12) {
                        phase1Total += law.coefficients[i] * (phase1State[speciesNames[i]] ?? 0);
                    }
                }
                
                // Compute total at Phase 2 endpoint
                let phase2Total = 0;
                for (let i = 0; i < law.coefficients.length; i++) {
                    if (Math.abs(law.coefficients[i]) > 1e-12) {
                        phase2Total += law.coefficients[i] * (Number(phase2Endpoint[speciesNames[i]] ?? 0));
                    }
                }
                
                const discontinuity = Math.abs(phase1Total - phase2Total);
                const scale = Math.max(1e-9, Math.abs(phase1Total), Math.abs(phase2Total));
                const normalizedDiscontinuity = discontinuity / scale;
                
                if (normalizedDiscontinuity > 0.01) {
                    const severity: 'low' | 'medium' | 'high' = 
                        normalizedDiscontinuity > 0.5 ? 'high' :
                        normalizedDiscontinuity > 0.1 ? 'medium' : 'low';
                    
                    conservationViolations.push({
                        law: law.description ?? `Conservation law involving ${law.coefficients.filter((c: number) => Math.abs(c) > 1e-12).length} species`,
                        phase1Total,
                        phase2Total,
                        discontinuity,
                        severity,
                    });
                }
            }
        }
        
        // Dynamic response analysis
        const phase1Values = phase1Result.data.map(d => Number(d[obsName] ?? 0));
        const phase2Values = phase2Result.data.map(d => Number(d[obsName] ?? 0));
        
        const phase1Final = phase1Values[phase1Values.length - 1];
        const phase2Final = phase2Values[phase2Values.length - 1];
        
        // Check for overshoot in Phase 2 response
        const maxPhase2 = Math.max(...phase2Values);
        const overshoot = phase2Final !== phase1Final 
            ? Math.max(0, (maxPhase2 - phase2Final) / Math.abs(phase2Final - phase1Final))
            : 0;
        
        // Check for slow settling
        const settlingWindow = phase2Values.slice(-20);
        const avgSettling = settlingWindow.reduce((a, b) => a + b, 0) / settlingWindow.length;
        const isSettled = settlingWindow.every(v => Math.abs(v - avgSettling) / (Math.abs(avgSettling) || 1) < 0.02);
        
        const hasViolations = conservationViolations.length > 0;
        const hasOvershoot = overshoot > 0.1;
        
        return createToolResult({
            phases: {
                phase1: {
                    parameter_value: parsedArgs.initial_value,
                    duration: parsedArgs.transition_time,
                    endpoint_value: phase1Final,
                },
                phase2: {
                    parameter_value: parsedArgs.final_value,
                    duration: tEnd,
                    endpoint_value: phase2Final,
                },
            },
            conservation_analysis: {
                laws_found: conservationAnalysis?.laws?.length ?? 0,
                violations: conservationViolations,
                has_violations: hasViolations,
            },
            dynamic_response: {
                overshoot,
                is_settled: isSettled,
                change_magnitude: Math.abs(phase2Final - phase1Final),
            },
            interpretation: hasViolations 
                ? `CRITICAL: Conservation law violations detected at phase boundary. ${conservationViolations.filter(v => v.severity === 'high').length} severe discontinuities. This indicates mass is not conserved when parameter changes.`
                : hasOvershoot
                ? `No conservation violations, but Phase 2 shows overshoot (${(overshoot * 100).toFixed(1)}%). Consider adjusting rate constants.`
                : 'Phase handoff appears smooth - conservation laws maintained and dynamics stable.',
            severity: hasViolations ? 'high' : hasOvershoot ? 'medium' : 'none',
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
