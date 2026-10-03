/**
 * Action-command pre-processing for the ANTLR front-end.
 *
 * BNG2.pl accepts loose action commands at top level around an actions block:
 *
 *     end model
 *     setParameter("c1", 0.02);
 *     begin actions
 *       simulate({method=>"ssa"})
 *     end actions
 *     generate_network({overwrite=>1})
 *     simulate({method=>"ode",t_end=>100})
 *
 * and executes them in file order. Our grammar's entry rule admits a single
 * trailing actions block and nothing else at depth 0, so such files fail with
 * "mismatched input 'generate_network' expecting {<EOF>, LB}".
 *
 * Rather than widen the grammar we fold those loose commands into the actions
 * block, keeping their relative file order. `generate_network` inside an
 * actions block remains a no-op for network generation, as in BNG2.
 *
 * Only self-contained action commands appearing after `end model` and outside
 * the actions block are moved, and only when an actions block exists; anything
 * else leaves the file untouched.
 */

const ACTION_COMMAND_NAME_RE =
  /^(?:generate_network|generate_hybrid_model|simulate|simulate_ode|simulate_ssa|simulate_pla|simulate_nf|simulate_rm|simulate_psa|parameter_scan|bifurcate|readFile|visualize|writeFile|writeModel|writeXML|writeNetwork|writeSBML|writeMDL|writeLatex|writeMfile|writeMexfile|setConcentration|addConcentration|saveConcentrations|resetConcentrations|setParameter|saveParameters|resetParameters|setVolume|setOption|quit)\s*\(/;

const BEGIN_ACTIONS_LINE_RE = /^[^\S\r\n]*begin\s+actions\s*$/i;
const END_ACTIONS_LINE_RE = /^[^\S\r\n]*end\s+actions\s*$/i;
const END_MODEL_LINE_RE = /^[^\S\r\n]*end\s+model\s*$/i;
const BEGIN_BLOCK_LINE_RE = /^[^\S\r\n]*begin\b/i;
const END_BLOCK_LINE_RE = /^[^\S\r\n]*end\b/i;

/** True when `(`/`)`/`{`/`}`/`[`/`]` balance out, ignoring text in quotes. */
function isBalanced(line: string): boolean {
  let round = 0;
  let curly = 0;
  let square = 0;
  let inString = false;
  for (const ch of line) {
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '(') round++;
    else if (ch === ')') round--;
    else if (ch === '{') curly++;
    else if (ch === '}') curly--;
    else if (ch === '[') square++;
    else if (ch === ']') square--;
  }
  return !inString && round === 0 && curly === 0 && square === 0;
}

/**
 * Moves top-level action commands that sit outside the model's actions block
 * into that block, preserving their file order.
 *
 * The original lines are blanked rather than spliced out, so the buffer keeps
 * its length and downstream line-based diagnostics stay aligned.
 */
export function foldLooseActionCommandsIntoActionsBlock(src: string): { normalized: string; folded: number } {
  const lines = src.split(/\r\n|\n/);

  // Locate the actions block and the end of the model block. Scanning from the
  // end means a `begin actions` mentioned in a trailing comment cannot mis-pair.
  let endModelIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#')) continue;
    if (END_MODEL_LINE_RE.test(lines[i])) {
      endModelIdx = i;
      break;
    }
  }
  if (endModelIdx === -1) {
    return { normalized: src, folded: 0 };
  }

  let actionsBegin = -1;
  let actionsEnd = -1;
  for (let i = lines.length - 1; i > endModelIdx; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#')) continue;
    if (actionsEnd === -1) {
      if (END_ACTIONS_LINE_RE.test(lines[i])) actionsEnd = i;
      continue;
    }
    if (BEGIN_ACTIONS_LINE_RE.test(lines[i])) {
      actionsBegin = i;
      break;
    }
  }
  // No actions block: BNG2 still runs these commands, in file order, after the
  // model. Collect them and wrap them in one so the grammar has a single place
  // to read action commands from.
  const hasActionsBlock = actionsBegin !== -1 && actionsEnd !== -1 && actionsEnd > actionsBegin;


  // Collect depth-0 action commands after `end model`, split around the block so
  // their original order can be rebuilt inside the body.
  const before: string[] = [];
  const after: string[] = [];
  let depth = 0;
  for (let i = endModelIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isComment = trimmed.startsWith('#');
    if (!isComment) {
      if (BEGIN_BLOCK_LINE_RE.test(lines[i])) depth++;
      else if (END_BLOCK_LINE_RE.test(lines[i])) depth--;
    }
    if (depth !== 0 || (hasActionsBlock && actionsBegin <= i && i <= actionsEnd)) continue;
    if (trimmed === '' || isComment) continue;
    if (!ACTION_COMMAND_NAME_RE.test(trimmed) || !isBalanced(trimmed)) continue;
    (i < actionsBegin ? before : after).push(lines[i]);
  }

  const moved = [...before, ...after];
  if (moved.length === 0) {
    return { normalized: src, folded: 0 };
  }

  const result = lines.slice();
  for (let i = endModelIdx + 1; i < lines.length; i++) {
    const trimmed = result[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if ((hasActionsBlock && actionsBegin <= i && i <= actionsEnd) || !ACTION_COMMAND_NAME_RE.test(trimmed) || !isBalanced(trimmed)) continue;
    result[i] = '';
  }

  if (hasActionsBlock) {
    result.splice(actionsEnd, 0, ...moved);
    return { normalized: result.join('\n'), folded: moved.length };
  }

  result.push('begin actions', ...moved, 'end actions');
  return { normalized: result.join('\n'), folded: moved.length };
}