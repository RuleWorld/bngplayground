import type { BNGLModel } from '../../types';
import { BNGLParser } from '../graph/core/BNGLParser';
import { validateModelForNFsim } from '../simulation/nfsim/NFsimRunner';
import { findUnreachableRules } from '../analysis/UnreachableRules';
import { MassBalance } from '../analysis/MassBalance';

export type ValidationMessage = {
    source: 'parse' | 'model' | 'observable' | 'nfsim';
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    relatedElement?: string;
};

export type ValidateModelResult = {
    valid: boolean;
    parseSuccess: boolean;
    parseErrors: Array<{ line: number; column: number; message: string }>;
    errors: ValidationMessage[];
    warnings: ValidationMessage[];
    info: ValidationMessage[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
    };
    nfsim: ReturnType<typeof validateModelForNFsim> | null;
};

/**
 * Performs a comprehensive validation check on a parsed BioNetGen model.
 *
 * This function aggregates error, warning, and informational feedback from multiple
 * model verification engines:
 *  1. **Observables Check**: Ensures the model has at least one observable pattern.
 *  2. **Parameters Check**: Validates that all parameters are finite numbers and warns
 *     about unusual parameter magnitudes (extremely large or small nonzero values).
 *  3. **Reachable Rules**: Checks for reaction rules that may never fire due to reactant
 *     unreachability from seed species (`findUnreachableRules`).
 *  4. **Observable Patterns**: Validates the syntax of all defined observables using `BNGLParser.validatePattern`.
 *  5. **NFsim Compatibility**: If requested, validates grammar and features for NFsim
 *     compatibility (`validateModelForNFsim`).
 *  6. **Mass Balance**: Verifies atom/mass conservation across reaction rules (`MassBalance.checkMassBalance`).
 *
 * @param model - The parsed `BNGLModel` to validate.
 * @param includeNFsim - A flag to enable or disable extra NFsim-specific validation checks.
 * @returns A structured `ValidateModelResult` describing all issues found.
 */
export function validateModel(model: BNGLModel, includeNFsim: boolean): ValidateModelResult {
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const info: ValidationMessage[] = [];

    if (model.observables.length === 0) {
        errors.push({
            source: 'model',
            code: 'MISSING_OBSERVABLES',
            severity: 'error',
            message: 'No observables defined. Add at least one observable to inspect simulation output.',
            relatedElement: 'observables',
        });
    }

    Object.entries(model.parameters).forEach(([name, value]) => {
        if (!Number.isFinite(value)) {
            errors.push({
                source: 'model',
                code: 'NON_FINITE_PARAMETER',
                severity: 'error',
                message: `Parameter ${name} is not a finite number.`,
                relatedElement: name,
            });
            return;
        }

        if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) <= 1e-6)) {
            warnings.push({
                source: 'model',
                code: 'UNUSUAL_PARAMETER_MAGNITUDE',
                severity: 'warning',
                message: `Parameter ${name} has an unusual magnitude (${value}).`,
                relatedElement: name,
            });
        }
    });

    const unreachableRules = findUnreachableRules(model);
    if (unreachableRules.length > 0) {
        warnings.push({
            source: 'model',
            code: 'UNREACHABLE_RULES',
            severity: 'warning',
            message: `${unreachableRules.length} rule(s) may never trigger because their reactants are not reachable from seed species.`,
            relatedElement: unreachableRules.join(', '),
        });
    }

    model.observables.forEach((observable) => {
        const patternIssue = BNGLParser.validatePattern(observable.pattern);
        if (patternIssue) {
            errors.push({
                source: 'observable',
                code: 'INVALID_OBSERVABLE_PATTERN',
                severity: 'error',
                message: `Observable ${observable.name} has an invalid pattern: ${patternIssue}`,
                relatedElement: observable.name,
            });
        }
    });

    const nfsim = includeNFsim ? validateModelForNFsim(model) : null;
    if (nfsim) {
        nfsim.errors.forEach((issue: any) => {
            errors.push({
                source: 'nfsim',
                code: issue.type,
                severity: issue.severity ?? 'error',
                message: issue.message,
            });
        });
        nfsim.warnings.forEach((issue: any) => {
            warnings.push({
                source: 'nfsim',
                code: issue.type,
                severity: issue.severity ?? 'warning',
                message: issue.message,
            });
        });
        nfsim.recommendations.forEach((recommendation: any) => {
            info.push({
                source: 'nfsim',
                code: recommendation.type,
                severity: 'info',
                message: recommendation.message,
            });
        });
    }

    const massBalanceIssues = MassBalance.checkMassBalance(model);
    massBalanceIssues.forEach((issue: { ruleName: string; issue: string; severity: 'error' | 'warning' }) => {
        warnings.push({
            source: 'model',
            code: 'MASS_BALANCE_IMBALANCE',
            severity: issue.severity,
            message: `Rule "${issue.ruleName}": ${issue.issue}`,
        });
    });

    return {
        valid: errors.length === 0,
        parseSuccess: true,
        parseErrors: [],
        errors,
        warnings,
        info,
        summary: {
            errors: errors.length,
            warnings: warnings.length,
            info: info.length,
        },
        nfsim: nfsim as any,
    };
}
