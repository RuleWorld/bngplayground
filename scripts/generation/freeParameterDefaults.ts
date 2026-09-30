/**
 * PyBNF/BNG2 `__FREE` parameter handling for reference generation.
 *
 * PyBNF fitting models declare parameters as `t0 t0__FREE`, where the second
 * token is a *reference* to a free parameter rather than a value. BNG2.pl
 * resolves parameter references while reading the model — before any action
 * runs — and aborts with
 *
 *   ABORT: Parameter 't0__FREE' is referenced but not defined
 *
 * A trailing `setParameter(...)` is therefore too late, even inside a
 * `begin actions` block; the parameter has to be *defined* in the parameters
 * block. The playground already resolves `X__FREE` to 0 (BNGLVisitor registers
 * it as a constant 0), so define it as 0 here and both engines simulate the
 * same model instead of the model being left with no reference at all.
 */

/** Returns the __FREE identifiers referenced anywhere in the model. */
export function findFreeParameters(code: string): string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*__FREE_*)\b/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

const PARAMETERS_BLOCK = /^[ \t]*begin\s+parameters\b[^\n]*\n([\s\S]*?)^[ \t]*end\s+parameters\b/im;

/**
 * Define every referenced `__FREE` parameter as 0 inside the model's
 * parameters block. Returns the code unchanged when there is nothing to do.
 */
export function injectFreeParameterDefaults(code: string): string {
  const freeNames = findFreeParameters(code);
  if (freeNames.length === 0) return code;

  const definition = (name: string) => `  ${name} 0`;
  const block = PARAMETERS_BLOCK.exec(code);

  if (!block) {
    // No parameters block to extend: create one immediately after `begin model`.
    const modelStart = /^begin\s+model\b[^\n]*\n/im.exec(code);
    if (!modelStart) return code;
    const insertAt = modelStart.index + modelStart[0].length;
    const created = `\nbegin parameters\n${freeNames.map(definition).join('\n')}\nend parameters\n`;
    return code.slice(0, insertAt) + created + code.slice(insertAt);
  }

  const body = block[1];
  // Leave names the model already defines itself alone.
  const missing = freeNames.filter((name) => !new RegExp(`^[ \\t]*${name}\\b`, 'm').test(body));
  if (missing.length === 0) return code;

  const comment = '# [auto-generated] PyBNF __FREE defaults, matching the playground\'s resolution to 0';
  const injected = `${body.replace(/\s*$/, '')}\n${comment}\n${missing.map(definition).join('\n')}\n`;
  const bodyStart = block.index + block[0].indexOf(block[1]);
  return code.slice(0, bodyStart) + injected + code.slice(bodyStart + block[1].length);
}
