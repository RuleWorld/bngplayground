/**
 * QueryParser.ts
 * Parse BVL (BNGL Verification Language) queries into structured VerificationQuery objects.
 */

export type VerificationQuery =
  | { kind: 'reachable'; pattern: string }
  | { kind: 'never'; pattern: string }
  | { kind: 'fires'; ruleName: string }
  | { kind: 'deadlock' }
  | { kind: 'countReachable'; moleculeType: string }
  | { kind: 'always_eventually'; premise: string; conclusion: string };

export interface VerificationResult {
  query: VerificationQuery;
  answer: boolean | number | 'unknown';
  confidence: 'exact' | 'over_approximate' | 'bounded';
  bound?: number;
  witness?: string[];
  counterexample?: string[];
  explanation: string;
  layerUsed: 1 | 2 | 3;
}

/**
 * Find the index of the matching closing parenthesis for an opening one.
 * Returns -1 if not found.
 */
function findMatchingParen(input: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    if (input[i] === '(') {
      depth++;
    } else if (input[i] === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Extract the content inside the outermost parentheses starting at `openIndex`.
 * Throws if no matching close is found.
 */
function extractParenContent(input: string, openIndex: number, requireEnd = false): string {
  const closeIndex = findMatchingParen(input, openIndex);
  if (closeIndex === -1) {
    throw new Error(`Unmatched parenthesis at position ${openIndex} in query: "${input}"`);
  }
  // Warn if there's trailing content after the closing paren
  if (requireEnd) {
    const trailing = input.substring(closeIndex + 1).trim();
    if (trailing.length > 0) {
      throw new Error(`Unexpected content after closing parenthesis: "${trailing}"`);
    }
  }
  return input.substring(openIndex + 1, closeIndex);
}

/**
 * Parse a BVL query string into a VerificationQuery.
 *
 * Supported forms:
 *   reachable?(pattern)
 *   never(pattern)
 *   fires?(ruleName)
 *   deadlock?
 *   count_reachable(moleculeType)
 *   always(premise => eventually(conclusion))
 */
export function parseQuery(input: string): VerificationQuery {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new Error('Empty verification query');
  }

  // deadlock? — no parentheses needed
  if (/^deadlock\??$/i.test(trimmed)) {
    return { kind: 'deadlock' };
  }

  // reachable?(pattern)
  const reachableMatch = trimmed.match(/^reachable\?\s*\(/);
  if (reachableMatch) {
    const openIndex = trimmed.indexOf('(');
    const pattern = extractParenContent(trimmed, openIndex, true).trim();
    if (pattern.length === 0) {
      throw new Error('reachable? query requires a non-empty pattern');
    }
    return { kind: 'reachable', pattern };
  }

  // never(pattern)
  const neverMatch = trimmed.match(/^never\s*\(/);
  if (neverMatch) {
    const openIndex = trimmed.indexOf('(');
    const pattern = extractParenContent(trimmed, openIndex, true).trim();
    if (pattern.length === 0) {
      throw new Error('never query requires a non-empty pattern');
    }
    return { kind: 'never', pattern };
  }

  // fires?(ruleName)
  const firesMatch = trimmed.match(/^fires\?\s*\(/);
  if (firesMatch) {
    const openIndex = trimmed.indexOf('(');
    const ruleName = extractParenContent(trimmed, openIndex, true).trim();
    if (ruleName.length === 0) {
      throw new Error('fires? query requires a non-empty rule name');
    }
    return { kind: 'fires', ruleName };
  }

  // count_reachable(moleculeType)
  const countReachableMatch = trimmed.match(/^count_reachable\s*\(/);
  if (countReachableMatch) {
    const openIndex = trimmed.indexOf('(');
    const moleculeType = extractParenContent(trimmed, openIndex, true).trim();
    if (moleculeType.length === 0) {
      throw new Error('count_reachable query requires a non-empty molecule type');
    }
    return { kind: 'countReachable', moleculeType };
  }

  // always(premise => eventually(conclusion))
  const alwaysMatch = trimmed.match(/^always\s*\(/);
  if (alwaysMatch) {
    const outerOpenIndex = trimmed.indexOf('(');
    const innerContent = extractParenContent(trimmed, outerOpenIndex, true).trim();

    // Find the '=>' separator. We need to be careful about nested parens.
    // Scan for '=>' at depth 0.
    let arrowIndex = -1;
    let depth = 0;
    for (let i = 0; i < innerContent.length - 1; i++) {
      if (innerContent[i] === '(') depth++;
      else if (innerContent[i] === ')') depth--;
      else if (depth === 0 && innerContent[i] === '=' && innerContent[i + 1] === '>') {
        arrowIndex = i;
        break;
      }
    }

    if (arrowIndex === -1) {
      throw new Error(
        'always query requires "=>" separator: always(premise => eventually(conclusion))'
      );
    }

    const premise = innerContent.substring(0, arrowIndex).trim();
    const rest = innerContent.substring(arrowIndex + 2).trim();

    // rest should be eventually(conclusion)
    const eventuallyMatch = rest.match(/^eventually\s*\(/);
    if (!eventuallyMatch) {
      throw new Error(
        'always query requires "eventually(...)": always(premise => eventually(conclusion))'
      );
    }

    const evOpenIndex = rest.indexOf('(');
    const conclusion = extractParenContent(rest, evOpenIndex).trim();

    if (premise.length === 0 || conclusion.length === 0) {
      throw new Error('always query requires non-empty premise and conclusion');
    }

    return { kind: 'always_eventually', premise, conclusion };
  }

  throw new Error(`Unrecognized verification query: "${trimmed}"`);
}
