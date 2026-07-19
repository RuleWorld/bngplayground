/**
 * ruleIdentity.ts — consistent identifiers and display labels for reaction rules.
 *
 * Several tabs and services independently derived a rule's id/label from its
 * optional name with an index fallback. Sharing them keeps the same rule
 * showing the same id and label everywhere (cross-tab selection/highlighting
 * relies on the id being stable).
 *
 * Note: the Rules tab intentionally uses a specialised label (stripping
 * parser-generated `_R<n>` names and numbering unnamed rules), so it keeps its
 * own `getRuleLabel` and only shares `getRuleId`.
 */

/** Stable id for a rule: its name, or a 1-based `rule_<n>` fallback. */
export function getRuleId(rule: { name?: string }, index: number): string {
    return rule.name ?? `rule_${index + 1}`;
}

/** Human-readable label for a rule: its name, or a 1-based `Rule <n>` fallback. */
export function getRuleLabel(rule: { name?: string }, index: number): string {
    return rule.name ?? `Rule ${index + 1}`;
}
