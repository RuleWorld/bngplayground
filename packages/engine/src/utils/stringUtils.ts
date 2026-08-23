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

/**
 * Collapses runs of any whitespace (including Unicode whitespace characters)
 * to a single space character, and trims any leading or trailing whitespace.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param value - The input string whose whitespace runs should be normalized.
 * @returns A new string with whitespace normalized and trimmed.
 */
export function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * Collapses runs of ASCII whitespace characters (space, tab, CR, LF, FF, VT)
 * to single spaces, and trims leading and trailing whitespace.
 *
 * Unlike {@link normalizeWhitespace}, this function is character-exact and
 * Unicode-agnostic, which makes it highly stable for hashing and versioning
 * of model definition files.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param text - The input model or definition text to collapse.
 * @returns A new string with ASCII whitespace collapsed and trimmed.
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

/**
 * Escapes characters with special meaning in regular expressions so the
 * resulting string can be safely embedded as a literal value inside a RegExp.
 *
 * Characters escaped include: `.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `(`, `)`,
 * `|`, `[`, `]`, and `\`.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param value - The input string containing literal characters to escape.
 * @returns An escaped version of the input string safe for regex constructors.
 */
export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips a trailing inline comment (indicated by `#`) from a BNGL line and trims
 * any remaining trailing/leading whitespace.
 *
 * If no comment character `#` is present, the function simply trims the line.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param line - A single raw line of BNGL code.
 * @returns The line of code with the `# ...` comment stripped and whitespace trimmed.
 */
export function stripInlineComment(line: string): string {
    const commentIdx = line.indexOf('#');
    return (commentIdx === -1 ? line : line.slice(0, commentIdx)).trim();
}

/**
 * Determines whether a given character is a valid BioNetGen language (BNGL)
 * identifier character (i.e. alphanumeric, underscore `_`, or dollar sign `$`).
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param ch - The single-character string to check.
 * @returns True if the character is an alphanumeric character, `_`, or `$`; false otherwise.
 */
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
