/**
 * Formats a BioNetGen Language (BNGL) source code string by normalising whitespaces,
 * indenting elements within sections, collapsing multiple consecutive blank lines,
 * and reordering top-level blocks into a canonical sequence.
 *
 * The canonical order used for reordering blocks is:
 * 1. begin model
 * 2. molecule types / begin molecule types
 * 3. parameters
 * 4. seed species
 * 5. observables
 * 6. reaction rules / begin reaction rules
 * 7. actions
 * 8. end model
 *
 * Any remaining or unrecognized blocks are preserved and appended outside of this
 * canonical order (with un-nested root statements prepended).
 *
 * @param code - The raw BNGL source code string to format.
 * @returns The formatted, canonically ordered BNGL source code string with a single trailing newline.
 *
 * @invariant This utility is completely self-contained and free of any browser-specific or
 * framework-specific APIs (such as DOM, Web Worker, or window APIs), making it perfectly
 * safe to execute in server-side, headless Node.js, and MCP environments.
 */
export function formatBNGL(code: string): string {
  if (!code) return '';
  // Normalize newlines and trim whitespace
  const lines = code.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/g, ''));

  // Collapse multiple blank lines to a single one
  const cleaned: string[] = [];
  let wasBlank = false;
  for (const ln of lines) {
    const isBlank = ln.trim().length === 0;
    if (isBlank) {
      if (!wasBlank) {
        cleaned.push('');
      }
      wasBlank = true;
      continue;
    }
    wasBlank = false;

    // Add section indentation for common keywords
    const beginMatch = ln.match(/^\s*begin\b/i);
    const endMatch = ln.match(/^\s*end\b/i);
    if (beginMatch) {
      cleaned.push(ln.trim());
      continue;
    }
    if (endMatch) {
      cleaned.push(ln.trim());
      continue;
    }

    // For lines inside a section, ensure two-space indentation
    const trimmed = ln.trim();
    if (!/^\s*(#|!)/.test(trimmed) && !/\b(->|<-|<->|=>)\b/.test(trimmed)) {
      cleaned.push('  ' + trimmed);
    } else {
      cleaned.push(trimmed);
    }
  }

  // Reorder common sections in a canonical order if present
  const canonicalOrder = [
    'begin model',
    'molecule types',
    'begin molecule types',
    'parameters',
    'seed species',
    'observables',
    'reaction rules',
    'begin reaction rules',
    'actions',
    'end model',
  ];

  // This is conservative: only reorder the top-level blocks with 'begin'/'end' pairs.
  const blocks: Record<string, string[]> = {};
  let currentKey = '__root__';
  blocks[currentKey] = [];
  // eslint-disable-next-line no-useless-assignment
  let inBeginName: string | null = null;
  for (const ln of cleaned) {
    const m = ln.match(/^begin\s+(.*)$/i);
    const me = ln.match(/^end\s+(.*)$/i);
    if (m) {
      inBeginName = m[1].toLowerCase();
      currentKey = inBeginName;
      blocks[currentKey] = blocks[currentKey] ?? [];
      blocks[currentKey].push(ln);
      continue;
    }
    if (me) {
      blocks[currentKey].push(ln);
      // eslint-disable-next-line no-useless-assignment
      inBeginName = null;
      currentKey = '__root__';
      continue;
    }
    blocks[currentKey].push(ln);
  }

  // Build result in canonical order
  const resultLines: string[] = [];
  for (const key of canonicalOrder) {
    if (blocks[key]) {
      resultLines.push(...blocks[key]);
      delete blocks[key];
    }
  }

  // Append any remaining blocks
  Object.keys(blocks).forEach((k) => {
    if (k === '__root__') {
      resultLines.unshift(...blocks[k]);
    } else {
      resultLines.push(...blocks[k]);
    }
  });

  // Ensure single trailing newline
  return resultLines.join('\n').trimEnd() + '\n';
}

export default formatBNGL;
