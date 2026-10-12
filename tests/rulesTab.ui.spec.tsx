// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { RulesTab } from '../components/tabs/RulesTab';

const STATE_CHANGE_MODEL = `begin model
begin parameters
k 1.0
end parameters

begin molecule types
A(site~u~p)
end molecule types

begin seed species
A(site~u) 1
end seed species

begin reaction rules
A(site~u) -> A(site~p) k
end reaction rules
end model`;

describe('RulesTab UI', () => {
  it('labels unchanged rule atoms as context', () => {
    const model = parseBNGLStrict(STATE_CHANGE_MODEL);

    render(<RulesTab model={model} results={null} selectedRuleId="_R1" />);

    expect(screen.getByText('Context', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Modifies', { exact: true })).toBeNull();
  });
});
