import type { BNGLModel } from '../../types';

import { getExpressionDependencies } from '../../src/parser/ExpressionDependencies';

export enum ValidationErrorType {
  TOTAL_RATE_MODIFIER = 'TOTAL_RATE_MODIFIER',
  OBSERVABLE_DEPENDENT_RATE = 'OBSERVABLE_DEPENDENT_RATE',
  UNSUPPORTED_FUNCTION = 'UNSUPPORTED_FUNCTION',
  MISSING_REQUIREMENTS = 'MISSING_REQUIREMENTS'
}

export interface ValidationIssue {
  type: ValidationErrorType;
  message: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface ValidationRecommendation {
  type: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  parameters?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  recommendations: ValidationRecommendation[];
}

export class NFsimValidator {
  static validateForNFsim(model: BNGLModel): ValidationResult {
    return getValidator().validateForNFsim(model);
  }

  validateForNFsim(model: BNGLModel): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    const recommendations: ValidationRecommendation[] = [];

    if (!model.species || model.species.length === 0) {
      errors.push({
        type: ValidationErrorType.MISSING_REQUIREMENTS,
        message: 'Model must include at least one species for NFsim simulation.'
      });
    }

    if (!model.moleculeTypes || model.moleculeTypes.length === 0) {
      errors.push({
        type: ValidationErrorType.MISSING_REQUIREMENTS,
        message: 'Model must include at least one molecule type.'
      });
    }

    if (!model.reactionRules || model.reactionRules.length === 0) {
      errors.push({
        type: ValidationErrorType.MISSING_REQUIREMENTS,
        message: 'Model must include at least one reaction rule.'
      });
    }

    if (!model.observables || model.observables.length === 0) {
      errors.push({
        type: ValidationErrorType.MISSING_REQUIREMENTS,
        message: 'Model must include at least one observable.'
      });
    }

    // cache observable names for fast lookup
    const observableNames = new Set((model.observables || []).map(o => o.name));

    const rules = model.reactionRules || [];
    for (const rule of rules) {
      const rate = String(rule.rate ?? '');
      
      // Check for TotalRate using standard token check or property
      if (rate.toLowerCase().includes('totalrate') || rule.totalRate) {
        errors.push({
          type: ValidationErrorType.TOTAL_RATE_MODIFIER,
          message: 'TotalRate modifiers are not supported by NFsim.'
        });
      }

      // Use ANTLR parser to check for observable dependencies
      // This is robust against substring matches (e.g., parameter "ka" vs observable "a")
      if (observableNames.size > 0 && rate) {
        try {
          const dependencies = getExpressionDependencies(rate);
          for (const dep of dependencies) {
            if (observableNames.has(dep)) {
              errors.push({
                type: ValidationErrorType.OBSERVABLE_DEPENDENT_RATE,
                message: `Observable-dependent rate detected: ${dep}`
              });
              break;
            }
          }
        } catch (e) {
          // If parser fails, it might be a complex unsupported expression, but for safety we don't block UNLESS we are sure.
          // However, a parse error on a rate usually means it's invalid anyway.
          console.warn(`[NFsimValidator] Failed to parse rate expression "${rate}":`, e);
        }
      }
    }

    // Functions are generally not supported in NFsim (except simple ones which might be inlined, but to be safe we flag them)
    if (model.functions && model.functions.length > 0) {
      errors.push({
        type: ValidationErrorType.UNSUPPORTED_FUNCTION,
        message: 'Model contains functions; NFsim compatibility is not guaranteed.'
      });
    }

    // Heuristic for complex models to suggest optimizations
    if (rules.length > 5 || (model.species && model.species.length > 5)) {
        recommendations.push({
            type: 'PERFORMANCE_OPTIMIZATION',
            message: 'Complex model detected. Consider adjusting simulation parameters like utl.',
            priority: 'medium',
            parameters: { utl: 100000 }
        });
    }

    return { valid: errors.length === 0, errors, warnings, recommendations };
  }
}

let cachedValidator: NFsimValidator | null = null;

export function getValidator(): NFsimValidator {
  if (!cachedValidator) cachedValidator = new NFsimValidator();
  return cachedValidator;
}

export function resetValidator(): void {
  cachedValidator = null;
}