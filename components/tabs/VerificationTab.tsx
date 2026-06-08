import React, { useState, useEffect, useCallback } from 'react';
import type { BNGLModel, SimulationResults } from '../../types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';

// Constraint operators
type ConstraintOperator = '<' | '<=' | '>' | '>=' | '==' | 'constant';

interface Constraint {
    id: string;
    observable: string;
    operator: ConstraintOperator;
    value: string; // Can be a number or reference like "Initial(X)"
    tolerance?: number; // For 'constant' and '==' operators
}

interface ConstraintResult {
    constraintId: string;
    passed: boolean;
    failedAt?: number; // Time point where it failed
    message: string;
}

interface VerificationTabProps {
    model: BNGLModel | null;
    results?: SimulationResults | null;
}

const OPERATORS: { value: ConstraintOperator; label: string }[] = [
    { value: '<', label: '< (Less than)' },
    { value: '<=', label: '≤ (Less or equal)' },
    { value: '>', label: '> (Greater than)' },
    { value: '>=', label: '≥ (Greater or equal)' },
    { value: '==', label: '= (Equal to)' },
    { value: 'constant', label: 'Constant (Mass Conservation)' },
];

export const VerificationTab: React.FC<VerificationTabProps> = ({ model, results }) => {
    const [constraints, setConstraints] = useState<Constraint[]>([]);
    const [verificationResults, setVerificationResults] = useState<ConstraintResult[]>([]);
    const [isVerifying, setIsVerifying] = useState(false);

    // Get observable names from model (empty if model is null)
    const observableNames = model?.observables.map(obs => obs.name) ?? [];

    // Add a new constraint
    const addConstraint = useCallback(() => {
        const newConstraint: Constraint = {
            id: `constraint_${Date.now()}`,
            observable: observableNames[0] || '',
            operator: '<',
            value: '100',
            tolerance: 0.01,
        };
        setConstraints(prev => [...prev, newConstraint]);
    }, [observableNames]);

    // Remove a constraint
    const removeConstraint = useCallback((id: string) => {
        setConstraints(prev => prev.filter(c => c.id !== id));
        setVerificationResults(prev => prev.filter(r => r.constraintId !== id));
    }, []);

    // Update a constraint
    const updateConstraint = useCallback((id: string, field: keyof Constraint, value: string | number) => {
        setConstraints(prev => prev.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        ));
    }, []);

    // Evaluate a single constraint against the simulation results
    const evaluateConstraint = useCallback((constraint: Constraint): ConstraintResult => {
        if (!results || !results.data || results.data.length === 0) {
            return {
                constraintId: constraint.id,
                passed: false,
                message: 'No simulation results available',
            };
        }

        // Check if observable exists in headers
        const obsName = constraint.observable;
        if (!results.headers.includes(obsName)) {
            return {
                constraintId: constraint.id,
                passed: false,
                message: `Observable "${obsName}" not found in results`,
            };
        }

        // Extract values for this observable from data
        const values = results.data.map(row => row[obsName]);
        const timeValues = results.data.map(row => row['time'] ?? row['Time'] ?? 0);

        // Parse the constraint value
        let targetValue: number;
        if (constraint.value.startsWith('Initial(')) {
            // Reference to initial value: Initial(X)
            targetValue = values[0];
        } else {
            targetValue = parseFloat(constraint.value);
            if (isNaN(targetValue)) {
                return {
                    constraintId: constraint.id,
                    passed: false,
                    message: `Invalid value: "${constraint.value}"`,
                };
            }
        }

        const tolerance = constraint.tolerance ?? 0.01;

        // Check constraint at each time point
        for (let i = 0; i < values.length; i++) {
            const currentValue = values[i];
            const timePoint = timeValues[i];
            let passes = false;

            switch (constraint.operator) {
                case '<':
                    passes = currentValue < targetValue;
                    break;
                case '<=':
                    passes = currentValue <= targetValue;
                    break;
                case '>':
                    passes = currentValue > targetValue;
                    break;
                case '>=':
                    passes = currentValue >= targetValue;
                    break;
                case '==':
                    passes = Math.abs(currentValue - targetValue) <= tolerance * Math.max(1, Math.abs(targetValue));
                    break;
                case 'constant':
                    // For constant, compare to initial value with tolerance
                    const initialValue = values[0];
                    passes = Math.abs(currentValue - initialValue) <= tolerance * Math.max(1, Math.abs(initialValue));
                    break;
            }

            if (!passes) {
                const expectedStr = constraint.operator === 'constant'
                    ? `constant (initial = ${values[0].toFixed(4)})`
                    : `${constraint.operator} ${targetValue}`;
                return {
                    constraintId: constraint.id,
                    passed: false,
                    failedAt: timePoint,
                    message: `Failed at t=${timePoint.toFixed(4)}: ${constraint.observable} = ${currentValue.toFixed(4)}, expected ${expectedStr}`,
                };
            }
        }

        return {
            constraintId: constraint.id,
            passed: true,
            message: 'Passed all time points',
        };
    }, [results]);

    // Run verification on all constraints
    const runVerification = useCallback(() => {
        setIsVerifying(true);

        const results: ConstraintResult[] = constraints.map(evaluateConstraint);
        setVerificationResults(results);

        setIsVerifying(false);
    }, [constraints, evaluateConstraint]);

    // Auto-run verification when results change
    useEffect(() => {
        if (results && constraints.length > 0) {
            runVerification();
        }
    }, [results, constraints.length, runVerification]);

    const passedCount = verificationResults.filter(r => r.passed).length;
    const failedCount = verificationResults.filter(r => !r.passed).length;

    return (
        <div className="flex flex-col h-full gap-4 p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                        Model Constraints
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Define constraints to verify model behavior (e.g., mass conservation).
                    </p>
                </div>
                <Button onClick={addConstraint} disabled={observableNames.length === 0}>
                    + Add Constraint
                </Button>
            </div>

            {observableNames.length === 0 && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        No observables defined in the model. Add observables to create constraints.
                    </p>
                </div>
            )}

            {/* Constraints Table */}
            {constraints.length > 0 && (
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800">
                                <th className="p-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b">Observable</th>
                                <th className="p-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b">Operator</th>
                                <th className="p-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b">Value</th>
                                <th className="p-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b">Tolerance</th>
                                <th className="p-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 border-b">Status</th>
                                <th className="p-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 border-b">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                // Optimization: Build a lookup map to avoid O(N^2) search inside the map loop
                                const resultsMap = new Map(verificationResults.map(r => [r.constraintId, r]));
                                return constraints.map((constraint) => {
                                    const result = resultsMap.get(constraint.id);
                                    return (
                                        <tr key={constraint.id} className="border-b border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50">
                                        <td className="p-2">
                                            <Select
                                                value={constraint.observable}
                                                onChange={(e) => updateConstraint(constraint.id, 'observable', e.target.value)}
                                            >
                                                {observableNames.map(name => (
                                                    <option key={name} value={name}>{name}</option>
                                                ))}
                                            </Select>
                                        </td>
                                        <td className="p-2">
                                            <Select
                                                value={constraint.operator}
                                                onChange={(e) => updateConstraint(constraint.id, 'operator', e.target.value as ConstraintOperator)}
                                            >
                                                {OPERATORS.map(op => (
                                                    <option key={op.value} value={op.value}>{op.label}</option>
                                                ))}
                                            </Select>
                                        </td>
                                        <td className="p-2">
                                            <Input
                                                type="text"
                                                value={constraint.value}
                                                onChange={(e) => updateConstraint(constraint.id, 'value', e.target.value)}
                                                placeholder="e.g., 100 or Initial(X)"
                                                className="w-32"
                                                disabled={constraint.operator === 'constant'}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <Input
                                                type="number"
                                                value={constraint.tolerance ?? 0.01}
                                                onChange={(e) => updateConstraint(constraint.id, 'tolerance', parseFloat(e.target.value))}
                                                step="0.001"
                                                min="0"
                                                className="w-20"
                                            />
                                        </td>
                                        <td className="p-2">
                                            {result ? (
                                                <div className={`flex items-center gap-2 text-xs ${result.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    <span className={`w-2 h-2 rounded-full ${result.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                                                    {result.passed ? 'Passed' : 'Failed'}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">Not verified</span>
                                            )}
                                        </td>
                                        <td className="p-2 text-center">
                                            <button
                                                onClick={() => removeConstraint(constraint.id)}
                                                className="text-red-500 hover:text-red-700 text-sm"
                                                title="Remove constraint"
                                                aria-label="Remove constraint"
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Results Summary */}
            {verificationResults.length > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 dark:border-slate-700">
                    <h4 className="font-semibold text-sm mb-2">Verification Summary</h4>
                    <div className="flex gap-4 mb-3">
                        <span className="text-green-600 dark:text-green-400 text-sm">
                            ✓ {passedCount} passed
                        </span>
                        <span className="text-red-600 dark:text-red-400 text-sm">
                            ✗ {failedCount} failed
                        </span>
                    </div>
                    {failedCount > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Failure Details:</p>
                            {verificationResults.filter(r => !r.passed).map(result => (
                                <p key={result.constraintId} className="text-xs text-red-600 dark:text-red-400">
                                    • {result.message}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {constraints.length === 0 && observableNames.length > 0 && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-slate-500 dark:text-slate-400">
                        <p className="text-lg mb-2">No constraints defined</p>
                        <p className="text-sm mb-4">Add constraints to verify model behavior, such as mass conservation.</p>
                        <Button onClick={addConstraint}>+ Add Your First Constraint</Button>
                    </div>
                </div>
            )}

            {/* Run Verification Button */}
            {constraints.length > 0 && (
                <div className="flex justify-end">
                    <Button
                        onClick={runVerification}
                        disabled={isVerifying || !results}
                    >
                        {isVerifying ? 'Verifying...' : 'Run Verification'}
                    </Button>
                </div>
            )}
        </div>
    );
};
