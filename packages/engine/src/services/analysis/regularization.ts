/**
 * packages/engine/src/services/analysis/regularization.ts
 *
 * L1/L2/elastic-net regularization for parameter fitting,
 * with automatic model reduction (rule pruning).
 */

export type RegularizationType = 'none' | 'l1' | 'l2' | 'elastic-net';

export interface RegularizationConfig {
  type: RegularizationType;
  lambda: number;
  alpha?: number;
  targetParameters?: string[];
  pruneThreshold?: number;
}

export interface RegularizationPenalty {
  penalty: number;
  perParameter: Map<string, number>;
}

export interface ModelReductionResult {
  reducedCode: string;
  prunedParameters: string[];
  prunedRules: string[];
  keptRules: string[];
  reductionRatio: number;
  summary: string;
}

export function computeRegularizationPenalty(
  paramValues: number[],
  paramNames: string[],
  nominalValues: number[],
  config: RegularizationConfig,
): RegularizationPenalty {
  if (config.type === 'none' || config.lambda === 0) {
    return { penalty: 0, perParameter: new Map() };
  }

  const targets = config.targetParameters ? new Set(config.targetParameters) : null;
  const lambda = config.lambda;
  const alpha = config.alpha ?? (config.type === 'l1' ? 1 : config.type === 'l2' ? 0 : 0.5);

  let totalPenalty = 0;
  const perParameter = new Map<string, number>();

  for (let i = 0; i < paramValues.length; i++) {
    const name = paramNames[i];
    if (targets && !targets.has(name)) {
      perParameter.set(name, 0);
      continue;
    }

    const nominal = Math.abs(nominalValues[i]) || 1;
    const normalized = paramValues[i] / nominal;

    const l1 = alpha * Math.abs(normalized);
    const l2 = (1 - alpha) * normalized * normalized;

    const paramPenalty = lambda * (l1 + l2);
    perParameter.set(name, paramPenalty);
    totalPenalty += paramPenalty;
  }

  return { penalty: totalPenalty, perParameter };
}

export function pruneModel(
  bnglCode: string,
  fittedParams: number[],
  paramNames: string[],
  nominalValues: number[],
  config: RegularizationConfig,
): ModelReductionResult {
  const threshold = config.pruneThreshold ?? 0.01;

  const prunedParameters: string[] = [];
  const prunedParamSet = new Set<string>();

  for (let i = 0; i < fittedParams.length; i++) {
    const nominal = Math.abs(nominalValues[i]) || 1;
    const relativeValue = Math.abs(fittedParams[i]) / nominal;
    if (relativeValue < threshold) {
      prunedParameters.push(paramNames[i]);
      prunedParamSet.add(paramNames[i]);
    }
  }

  const lines = bnglCode.split('\n');
  const prunedRules: string[] = [];
  const keptRules: string[] = [];
  const outputLines: string[] = [];

  let inRulesBlock = false;
  let inParametersBlock = false;
  let totalRules = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'begin reaction rules') {
      inRulesBlock = true;
      outputLines.push(line);
      continue;
    }
    if (lower === 'end reaction rules') {
      inRulesBlock = false;
      outputLines.push(line);
      continue;
    }
    if (lower === 'begin parameters') {
      inParametersBlock = true;
      outputLines.push(line);
      continue;
    }
    if (lower === 'end parameters') {
      inParametersBlock = false;
      outputLines.push(line);
      continue;
    }

    if (inParametersBlock) {
      const firstSpace = trimmed.search(/\s/);
      if (firstSpace > 0) {
        const pName = trimmed.slice(0, firstSpace);
        if (prunedParamSet.has(pName)) {
          outputLines.push(`# PRUNED: ${line.trim()}`);
          continue;
        }
        const fitIdx = paramNames.indexOf(pName);
        if (fitIdx >= 0) {
          outputLines.push(`  ${pName}  ${fittedParams[fitIdx]}  # fitted`);
          continue;
        }
      }
      outputLines.push(line);
      continue;
    }

    if (inRulesBlock) {
      if (trimmed === '' || trimmed.startsWith('#')) {
        outputLines.push(line);
        continue;
      }

      totalRules++;
      const ruleName = extractRuleName(trimmed);

      let shouldPrune = false;
      for (const prunedParam of prunedParameters) {
        if (ruleUsesParameterAsRate(trimmed, prunedParam)) {
          shouldPrune = true;
          break;
        }
      }

      if (shouldPrune) {
        prunedRules.push(ruleName || `rule_${totalRules}`);
        outputLines.push(`# PRUNED (rate -> 0): ${line.trim()}`);
      } else {
        keptRules.push(ruleName || `rule_${totalRules}`);
        outputLines.push(line);
      }
      continue;
    }

    outputLines.push(line);
  }

  const reducedCode = outputLines.join('\n');
  const reductionRatio = totalRules > 0 ? (totalRules - prunedRules.length) / totalRules : 1;

  const summary = prunedRules.length > 0
    ? `Model reduced from ${totalRules} to ${totalRules - prunedRules.length} rules (${((1 - reductionRatio) * 100).toFixed(0)}% reduction). Pruned parameters: ${prunedParameters.join(', ')}. Pruned rules: ${prunedRules.join(', ')}.`
    : `No rules pruned - all parameters remain above the ${(threshold * 100).toFixed(0)}% threshold.`;

  return {
    reducedCode,
    prunedParameters,
    prunedRules,
    keptRules,
    reductionRatio,
    summary,
  };
}

function extractRuleName(ruleLine: string): string {
  const match = ruleLine.match(/^(\w+)\s*:/);
  return match ? match[1] : '';
}

function ruleUsesParameterAsRate(ruleLine: string, paramName: string): boolean {
  const afterName = ruleLine.replace(/^\w+\s*:\s*/, '');
  const arrowMatch = afterName.match(/(->|<->)/);
  if (!arrowMatch) return false;

  const afterArrow = afterName.substring(afterName.indexOf(arrowMatch[0]) + arrowMatch[0].length);
  const regex = new RegExp(`\\b${escapeRegex(paramName)}\\b`);
  return regex.test(afterArrow);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
