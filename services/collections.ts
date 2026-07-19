/**
 * collections.ts — small immutable collection helpers for UI state updates.
 */

/**
 * Return a new Set with `item` toggled: removed if already present, added if
 * absent. Does not mutate the input, so it is safe to use directly in a React
 * state updater, e.g. `setSelected((prev) => toggleSetMember(prev, id))`.
 */
export function toggleSetMember<T>(set: ReadonlySet<T>, item: T): Set<T> {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
}

/**
 * Return a new array with `item` toggled: removed if present, appended if
 * absent. Order-preserving for existing items; appends new ones at the end.
 */
export function toggleArrayMember<T>(arr: readonly T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}
