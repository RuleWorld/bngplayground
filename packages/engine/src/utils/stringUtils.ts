/**
 * stringUtils.ts — small shared string helpers.
 *
 * `normalizeWhitespace` and `collapseWhitespace` are kept as two distinct
 * functions on purpose: the former uses the `\s` regex class (which also
 * matches Unicode whitespace) while the latter collapses only the ASCII
 * whitespace characters. They historically backed different subsystems
 * (code processing / hashing vs model versioning), so they are consolidated
 * per-behaviour rather than merged into one.
 */

/** Collapse runs of any whitespace (incl. Unicode) to single spaces and trim. */
export function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * Collapse runs of ASCII whitespace (space, tab, CR, LF, FF, VT) to single
 * spaces, trimming leading/trailing whitespace. Character-exact and
 * Unicode-agnostic, so it is stable for hashing/versioning of model text.
 */
export function collapseWhitespace(text: string): string {
    let result = '';
    let pendingSpace = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const isWhitespace =
            ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
        if (isWhitespace) {
            pendingSpace = result.length > 0;
            continue;
        }
        if (pendingSpace) {
            result += ' ';
            pendingSpace = false;
        }
        result += ch;
    }

    return result;
}

/** Escape a string for literal use inside a RegExp. */
export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip a trailing `# ...` inline comment from a line and trim the result. */
export function stripInlineComment(line: string): string {
    const commentIdx = line.indexOf('#');
    return (commentIdx === -1 ? line : line.slice(0, commentIdx)).trim();
}

/** True if `ch` is a BNGL identifier character (alphanumeric, `_`, or `$`). */
export function isIdentifierChar(ch: string | undefined): boolean {
    if (!ch) return false;
    const code = ch.charCodeAt(0);
    return (
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        ch === '_' ||
        ch === '$'
    );
}
