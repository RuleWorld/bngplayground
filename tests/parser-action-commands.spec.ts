/**
 * Action commands BioNetGen accepts that the grammar must recognise.
 *
 * The lexer already defined `writeMDL` and `setOption` tokens, but no parser
 * rule referenced them, so models using them failed to parse while BNG2.pl read
 * them fine. Both now parse.
 */
import { describe, it, expect } from 'vitest';

import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';

const modelWithActions = (actions: string): string => `begin model
begin molecule types
  A()
end molecule types
begin species
  A() 100
end species
begin actions
${actions}
end actions
end model
`;

describe('action commands inside an actions block', () => {
  it('accepts writeMDL', () => {
    const r = parseBNGLWithANTLR(modelWithActions('  writeMDL("out.mdl")'));
    expect(r.errors).toEqual([]);
    expect(r.success).toBe(true);
  });

  it('accepts setOption with two quoted arguments', () => {
    const r = parseBNGLWithANTLR(modelWithActions('  setOption("SpeciesLabel","HNauty")'));
    expect(r.errors).toEqual([]);
    expect(r.success).toBe(true);
  });

  it('still accepts generate_network and simulate in the same block', () => {
    const r = parseBNGLWithANTLR(
      modelWithActions('  setOption("SpeciesLabel","HNauty")\n  writeMDL("out.mdl")\n  generate_network({overwrite=>1})\n  simulate({method=>"ode",t_end=>10,n_steps=>2})')
    );
    expect(r.errors).toEqual([]);
    expect(r.success).toBe(true);
  });

  it('does not swallow a genuinely malformed action', () => {
    const r = parseBNGLWithANTLR(modelWithActions('  generate_network({overwrite=>1,)\n'));
    expect(r.success).toBe(false);
  });
});