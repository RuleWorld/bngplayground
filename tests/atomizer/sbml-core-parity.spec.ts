import { describe, expect, it } from 'vitest';
import { Atomizer } from '../../src/lib/atomizer/index';
import { generateSBML } from '../../src/lib/atomizer';
import { parseBNGL } from '../../services/parseBNGL';
import { parseBNGLStrict } from '../../packages/engine/src/parser/BNGLParserWrapper';
import { simulate } from '../../packages/engine/src/services/simulation/SimulationLoop';

const SBML_HOST = ['www', 'sbml', 'org'].join('.');
const W3_HOST = ['www', 'w3', 'org'].join('.');
const CORE = `http://${SBML_HOST}/sbml/level3/version2/core`;
const MATH = `http://${W3_HOST}/1998/Math/MathML`;

async function atomize(xml: string) {
  const instance = new Atomizer({ quietMode: true, useId: true, atomize: false });
  await instance.initialize();
  const result = await instance.atomize(xml);
  return { instance, result };
}

describe('Atomizer SBML Core parity regressions', () => {
  it('uses SBML identities for empty n-ary MathML operators', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="emptyOperators">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies><species id="S" compartment="c" initialAmount="1"/></listOfSpecies>
          <listOfRules>
            <assignmentRule variable="S"><math xmlns="${MATH}"><apply><plus/></apply></math></assignmentRule>
          </listOfRules>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();
    expect(result.bngl).not.toMatch(/__assign_rule__S\(\)\s*=\s*\(\)/);
  });

  it('does not emit a duplicate observable for concentration assignment-rule species', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="concentrationAssignmentTarget">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies>
            <species id="A" compartment="c" initialConcentration="1"/>
            <species id="B" compartment="c" initialConcentration="2"/>
            <species id="total" compartment="c" boundaryCondition="true" constant="false" hasOnlySubstanceUnits="false" initialConcentration="0"/>
          </listOfSpecies>
          <listOfRules>
            <assignmentRule variable="total"><math xmlns="${MATH}"><apply><plus/><ci>A</ci><ci>B</ci></apply></math></assignmentRule>
          </listOfRules>
          <listOfParameters><parameter id="k" value="1"/></listOfParameters>
          <listOfReactions>
            <reaction id="convert">
              <listOfReactants><speciesReference species="A"/></listOfReactants>
              <listOfProducts><speciesReference species="B"/></listOfProducts>
              <kineticLaw><math xmlns="${MATH}"><apply><times/><ci>k</ci><ci>total</ci></apply></math></kineticLaw>
            </reaction>
          </listOfReactions>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();
    expect(result.bngl).toMatch(/^\s*total\(\)\s*=/m);
    expect(result.bngl).not.toMatch(/^\s*Species total(?:_amt)?\s/m);
    expect(result.bngl).toMatch(/convert:\s*M_A[^\n]*\bk\s*\*\s*total\(\)/);
  });

  it('omits missing rule MathML instead of emitting a blank BNGL function', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="missingRuleMath">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies><species id="S" compartment="c" initialAmount="1"/></listOfSpecies>
          <listOfRules><assignmentRule variable="S"><math/></assignmentRule></listOfRules>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();
    expect(result.bngl).not.toMatch(/S\(\)\s*=\s*$/m);
    expect(result.bngl).toContain('missingMath');
  });

  it('preserves explicit useValuesFromTriggerTime=false and refuses unsafe mutable event folding', async () => {
    const { instance, result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="assignmentTimeEvent">
          <listOfParameters>
            <parameter id="x" value="0" constant="false"/>
            <parameter id="y" value="0" constant="false"/>
          </listOfParameters>
          <listOfEvents>
            <event id="E" useValuesFromTriggerTime="false">
              <trigger initialValue="true" persistent="true"><math xmlns="${MATH}"><apply><geq/><csymbol encoding="text" definitionURL="http://www.sbml.org/sbml/symbols/time"> time </csymbol><cn> 1 </cn></apply></math></trigger>
              <delay><math xmlns="${MATH}"><cn> 0.1 </cn></math></delay>
              <listOfEventAssignments>
                <eventAssignment variable="y"><math xmlns="${MATH}"><apply><plus/><ci> y </ci><ci> x </ci></apply></math></eventAssignment>
                <eventAssignment variable="x"><math xmlns="${MATH}"><cn type="integer"> 2 </cn></math></eventAssignment>
              </listOfEventAssignments>
            </event>
          </listOfEvents>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(instance.getModel()?.events[0]?.useValuesFromTriggerTime).toBe(false);
    expect(result.bngl).toContain('SBML events require the Playground event runtime');
    expect(result.bngl).toContain('@sbml-event');
    expect(result.bngl).not.toContain('time-triggered event(s) converted');
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();

    const roundTripped = await generateSBML(parseBNGL(result.bngl) as any);
    expect(roundTripped).toContain('<listOfEvents>');
    expect(roundTripped).toContain('useValuesFromTriggerTime="false"');
    expect(roundTripped).toContain('variable="y"');
    expect(roundTripped).toContain('<geq/>');
  });

  it('executes an Atomizer-preserved delayed event in the Playground engine', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="runtimeEventPath">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies><species id="S" compartment="c" initialAmount="0"/></listOfSpecies>
          <listOfParameters><parameter id="pulse" value="2"/></listOfParameters>
          <listOfEvents>
            <event id="pulseEvent">
              <trigger initialValue="true" persistent="true">
                <math xmlns="${MATH}"><apply><geq/><csymbol encoding="text" definitionURL="http://www.sbml.org/sbml/symbols/time">time</csymbol><cn>1</cn></apply></math>
              </trigger>
              <delay><math xmlns="${MATH}"><cn>0.5</cn></math></delay>
              <listOfEventAssignments>
                <eventAssignment variable="S"><math xmlns="${MATH}"><apply><plus/><ci>pulse</ci><ci>S</ci></apply></math></eventAssignment>
              </listOfEventAssignments>
            </event>
          </listOfEvents>
        </model>
      </sbml>`);

    const parsed = parseBNGL(result.bngl);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events?.[0]?.bnglDelay).toBe('0.5');
    expect(parsed.events?.[0]?.bnglExecution).toBe('playground');
    const simulation = await simulate(901, parsed, {
      method: 'ode',
      t_end: 2,
      n_steps: 8,
      solver: 'cvode',
      includeSpeciesData: true,
      includeExpandedNetwork: false,
    }, {
      checkCancelled: () => {},
      postMessage: () => {},
    });

    const speciesKey = simulation.speciesHeaders?.find((header) => header !== 'time');
    expect(speciesKey).toBeTruthy();
    expect(simulation.speciesData?.find((row) => row.time === 1)?.[speciesKey!]).toBeCloseTo(0, 12);
    expect(simulation.speciesData?.find((row) => row.time === 1.5)?.[speciesKey!]).toBeCloseTo(2, 10);
    expect(simulation.eventDiagnostics).toEqual([]);
    expect(simulation.eventFirings).toEqual(['pulseEvent']);
  });

  it('applies a model conversionFactor to the generated reaction rule', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="conversionFactorModel" conversionFactor="cf">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies>
            <species id="A" compartment="c" initialAmount="1"/>
            <species id="B" compartment="c" initialAmount="0"/>
          </listOfSpecies>
          <listOfParameters>
            <parameter id="k" value="1"/>
            <parameter id="cf" value="2"/>
          </listOfParameters>
          <listOfReactions>
            <reaction id="r">
              <listOfReactants><speciesReference species="A"/></listOfReactants>
              <listOfProducts><speciesReference species="B"/></listOfProducts>
              <kineticLaw>
                <math xmlns="${MATH}"><apply><times/><ci>k</ci><ci>A</ci></apply></math>
              </kineticLaw>
            </reaction>
          </listOfReactions>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();
    expect(result.bngl).toMatch(/2\s*\*\s*\(k\)/);
  });

  it('reports the retired requirements package as informational metadata', async () => {
    const { instance, result } = await atomize(`
      <sbml xmlns="${CORE}" xmlns:req="http://www.sbml.org/sbml/level3/version1/req/version1" level="3" version="2">
        <model id="requirementsMetadata">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(instance.getModel()?.importWarnings.some(warning => warning.category === 'package:req')).toBe(true);
  });

  it('exports BNGL phase changes as zero-delay SBML events', async () => {
    const model = parseBNGL(`
      begin model
      begin parameters
      k 0.2
      end parameters
      begin molecule types
      A()
      B()
      end molecule types
      begin species
      A() 10
      B() 0
      end species
      begin reaction rules
      A() -> B() k
      end reaction rules
      begin actions
      simulate({method=>"ode",t_end=>0.5,n_steps=>50})
      setConcentration("A()", 5)
      simulate({continue=>1,method=>"ode",t_end=>1,n_steps=>50})
      end actions
      end model
    `);

    const sbml = await generateSBML(model as any);
    expect(sbml).toContain('<listOfEvents>');
    expect(sbml).toContain('<eventAssignment variable="s0"');
    expect(sbml).toMatch(/<geq\/>[\s\S]*<cn>0\.5<\/cn>/);
    expect(sbml).toMatch(/<delay>[\s\S]*<cn>0<\/cn>/);
  });

  it('keeps piecewise conditions while removing the explicit SBML flux reactant factor', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="piecewiseFlux">
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies>
            <species id="A" compartment="c" initialAmount="10"/>
            <species id="B" compartment="c" initialAmount="0"/>
          </listOfSpecies>
          <listOfParameters>
            <parameter id="fast" value="0.8"/>
            <parameter id="slow" value="0.1"/>
            <parameter id="threshold" value="5"/>
          </listOfParameters>
          <listOfReactions>
            <reaction id="r">
              <listOfReactants><speciesReference species="A"/></listOfReactants>
              <listOfProducts><speciesReference species="B"/></listOfProducts>
              <kineticLaw><math xmlns="${MATH}"><apply><times/>
                <piecewise><piece><ci>fast</ci><apply><gt/><ci>A</ci><ci>threshold</ci></apply></piece><otherwise><ci>slow</ci></otherwise></piecewise>
                <ci>A</ci>
              </apply></math></kineticLaw>
            </reaction>
          </listOfReactions>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(result.bngl).toContain('if(');
    expect(result.bngl).toContain('_c_A() > threshold');
    expect(result.bngl).not.toMatch(/if\([^\n]*\)\s*\*\s*_c_A\(\)/);
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();
  });

  it('retains executable reactions whose flux calls a custom function', async () => {
    const { result } = await atomize(`
      <sbml xmlns="${CORE}" level="3" version="2">
        <model id="customFunctionFlux">
          <listOfFunctionDefinitions>
            <functionDefinition id="fluxLaw">
              <math xmlns="${MATH}"><lambda><bvar><ci>k</ci></bvar><apply><times/><ci>k</ci><cn>2</cn></apply></lambda></math>
            </functionDefinition>
          </listOfFunctionDefinitions>
          <listOfCompartments><compartment id="c" size="1"/></listOfCompartments>
          <listOfSpecies>
            <species id="A" compartment="c" initialAmount="1"/>
            <species id="B" compartment="c" initialAmount="0"/>
          </listOfSpecies>
          <listOfParameters><parameter id="k" value="0.5"/></listOfParameters>
          <listOfReactions>
            <reaction id="r">
              <listOfReactants><speciesReference species="A"/></listOfReactants>
              <listOfProducts><speciesReference species="B"/></listOfProducts>
              <kineticLaw>
                <math xmlns="${MATH}"><apply><times/><apply><ci>fluxLaw</ci><ci>k</ci></apply><ci>A</ci></apply></math>
              </kineticLaw>
            </reaction>
          </listOfReactions>
        </model>
      </sbml>`);

    expect(result.success).toBe(true);
    expect(() => parseBNGLStrict(result.bngl)).not.toThrow();
    const parsed = parseBNGL(result.bngl);
    expect(parsed.reactionRules.some((reaction) => reaction.name === 'r')).toBe(true);
  });
});
