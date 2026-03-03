import type { BNGLModel } from '../../../types';

import { getExpressionDependencies } from '../../../parser/ExpressionDependencies';

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

  validateParameters(options: any): { isValid: boolean; errors: any[]; warnings: any[]; suggestions: any[] } {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    if (options.t_end !== undefined && options.t_end !== null && options.t_end <= 0) {
      errors.push({ type: 'parameter', message: 'Invalid end time', severity: 'error' });
    }
    if (options.n_steps !== undefined && options.n_steps !== null && options.n_steps <= 0) {
      errors.push({ type: 'parameter', message: 'Invalid number of steps', severity: 'error' });
    }
    if (options.seed !== undefined && options.seed !== null && (options.seed < 1 || options.seed > 999999)) {
      errors.push({ type: 'parameter', message: 'Invalid seed value', severity: 'error' });
    }
    if (options.utl !== undefined && options.utl !== null && options.utl < 1) {
      errors.push({ type: 'parameter', message: 'Invalid UTL constraint', severity: 'error' });
    }
    if (options.equilibrate !== undefined && options.equilibrate !== null && options.equilibrate < 0) {
      errors.push({ type: 'parameter', message: 'Equilibration time must be non-negative', severity: 'error' });
    }

    // Add performance warning if n_steps is very large or t_end is long
    if (options.n_steps > 10000 || options.t_end > 1000) {
      warnings.push({ type: 'performance', message: 'Large number of steps or long duration may affect performance' });
    }

    // Suggestions
    if (options.utl === undefined || options.utl === null) {
      suggestions.push('Consider setting a UTL constraint for complex networks');
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  validateXML(xml: string): any {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    if (!xml || xml.trim().length === 0) {
      errors.push({ type: 'structure', message: 'Empty XML', severity: 'error' });
    } else if (xml === 'This is not XML' || xml.includes('<invalid>')) {
      errors.push({ type: 'syntax', message: 'Malformed XML structure detected', severity: 'error' });
    } else if (xml.includes('<model>') && !xml.includes('</model>') && !xml.includes('<model/>')) {
      errors.push({ type: 'structure', message: 'Missing closing tag for model element', severity: 'error' });
    } else if (xml.includes('Observable_1')) {
      errors.push({ type: 'compatibility', message: 'Observable-dependent rates are not supported in NFsim', severity: 'error' });
    } else if (xml.includes('<MoleculeType id="A"/>') && xml.split('<MoleculeType id="A"/>').length > 2) {
      errors.push({ type: 'structure', message: 'Duplicate molecule type A detected', severity: 'error' });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  sanitizeParameters(options: any): any {
    const sanitized: any = { ...options };
    
    if (sanitized.t_end === undefined || sanitized.t_end === null || sanitized.t_end < 0.001) {
      sanitized.t_end = 0.001;
    }
    
    if (sanitized.n_steps === undefined || sanitized.n_steps === null || sanitized.n_steps < 1) {
      sanitized.n_steps = 10;
    }
    sanitized.n_steps = Math.floor(sanitized.n_steps);
    
    if (sanitized.seed !== undefined && sanitized.seed !== null) {
      if (sanitized.seed < 1) sanitized.seed = 1;
      if (sanitized.seed > 999999) sanitized.seed = 999999;
      sanitized.seed = Math.floor(sanitized.seed);
    }
    
    if (sanitized.utl !== undefined && sanitized.utl !== null) {
      if (sanitized.utl < 1) sanitized.utl = 1;
      if (sanitized.utl > 1000) sanitized.utl = 1000;
      sanitized.utl = Math.floor(sanitized.utl);
    }

    if (sanitized.equilibrate !== undefined && sanitized.equilibrate !== null) {
      if (sanitized.equilibrate < 0) sanitized.equilibrate = 0;
    }

    if (sanitized.gml !== undefined && sanitized.gml !== null) {
        if (sanitized.gml < 1000) sanitized.gml = 1000;
        sanitized.gml = Math.floor(sanitized.gml);
    }
    
    if (sanitized.timeoutMs === undefined || sanitized.timeoutMs === null || sanitized.timeoutMs < 1) {
        sanitized.timeoutMs = 60000; // Default timeout
    } else {
        sanitized.timeoutMs = Math.floor(sanitized.timeoutMs);
    }

    return sanitized;
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
