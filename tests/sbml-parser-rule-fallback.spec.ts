import { describe, it, expect } from 'vitest';
import { SBMLParser } from '../src/lib/atomizer/parser/sbmlParser';

const PIECEWISE_RULE_SBML = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2/version4" level="2" version="4">
  <model id="piecewise_rule_fallback">
    <listOfCompartments>
      <compartment id="c" size="1" constant="true"/>
    </listOfCompartments>
    <listOfParameters>
      <parameter id="E1" value="0" constant="false"/>
      <parameter id="ton" value="1" constant="true"/>
      <parameter id="toff" value="2" constant="true"/>
      <parameter id="stim" value="3" constant="true"/>
    </listOfParameters>
    <listOfRules>
      <assignmentRule variable="E1">
        <math xmlns="http://www.w3.org/1998/Math/MathML">
          <piecewise>
            <piece>
              <cn>0</cn>
              <condition>
                <apply>
                  <leq/>
                  <ci>time</ci>
                  <ci>ton</ci>
                </apply>
              </condition>
            </piece>
            <otherwise>
              <apply>
                <ci>piecewise</ci>
                <ci>stim</ci>
                <apply>
                  <leq/>
                  <ci>time</ci>
                  <ci>toff</ci>
                </apply>
                <cn>0</cn>
              </apply>
            </otherwise>
          </piecewise>
        </math>
      </assignmentRule>
    </listOfRules>
  </model>
</sbml>`;

describe('SBMLParser rule fallback', () => {
  it(
    'extracts assignment-rule math from MathML when libSBML formula extraction is empty',
    async () => {
      const parser = new SBMLParser();
      await parser.initialize();
      const model = await parser.parse(PIECEWISE_RULE_SBML);
      const rule = model.rules.find((entry) => entry.type === 'assignment' && entry.variable === 'E1');
      expect(rule).toBeTruthy();
      expect(rule?.math).toContain('piecewise(');
      expect(rule?.math).toContain('time');
      expect(rule?.math).not.toBe('');
    },
    30000
  );
});

