/**
 * SedMLWriter.ts — SED-ML L1V4 export for simulation experiments.
 *
 * Generates SED-ML XML describing a BNGL simulation experiment
 * including model reference, simulation algorithm (KISAO), and outputs.
 */

import type { BNGLModel } from '../../types';
import { escapeXml } from '../../utils/xmlUtils';

// ── Types ────────────────────────────────────────────────────────────

export interface SedMLExportOptions {
  /** Model name */
  modelName?: string;
  /** Relative path or URI to the BNGL file */
  modelSource?: string;
  /** Simulation method */
  method: 'ode' | 'ssa' | 'nf';
  /** Time range */
  t_start?: number;
  t_end: number;
  n_steps: number;
  /** Observable names to include (default: all) */
  observables?: string[];
  /** Solver-specific settings */
  atol?: number;
  rtol?: number;
}

// ── KISAO Mappings ───────────────────────────────────────────────────

const KISAO_MAP: Record<string, string> = {
  ode: 'KISAO:0000019',  // CVODE
  ssa: 'KISAO:0000029',  // Gillespie direct
  nf:  'KISAO:0000263',  // NFsim (network-free)
};

// ── XML Helpers ──────────────────────────────────────────────────────

function xmlId(name: string): string {
  // Make a valid XML ID from an observable name
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

// ── Main ─────────────────────────────────────────────────────────────

export function generateSedML(model: BNGLModel, options: SedMLExportOptions): string {
  const {
    modelName = model.name || 'model',
    modelSource = 'model.bngl',
    method,
    t_start = 0,
    t_end,
    n_steps,
    observables: requestedObs,
    atol,
    rtol,
  } = options;

  const kisaoId = KISAO_MAP[method] ?? KISAO_MAP.ode;

  // Determine observables
  const obsNames = requestedObs ?? model.observables.map((o) => o.name);

  // Algorithm parameters
  let algorithmParams = '';
  if (atol !== undefined) {
    algorithmParams += `\n        <algorithmParameter kisaoID="KISAO:0000211" value="${atol}"/>`;
  }
  if (rtol !== undefined) {
    algorithmParams += `\n        <algorithmParameter kisaoID="KISAO:0000209" value="${rtol}"/>`;
  }
  const algorithmBlock = algorithmParams
    ? `<algorithm kisaoID="${kisaoId}">\n        <listOfAlgorithmParameters>${algorithmParams}\n        </listOfAlgorithmParameters>\n      </algorithm>`
    : `<algorithm kisaoID="${kisaoId}"/>`;

  // Data generators
  const dataGenerators = obsNames.map((obs) => {
    const id = xmlId(obs);
    return `    <dataGenerator id="dg_${id}" name="${escapeXml(obs)}">
      <math xmlns="http://www.w3.org/1998/Math/MathML"><ci>var_${id}</ci></math>
      <listOfVariables>
        <variable id="var_${id}" taskReference="task1" target="#${escapeXml(obs)}"/>
      </listOfVariables>
    </dataGenerator>`;
  }).join('\n');

  // Curves for plot
  const curves = obsNames.map((obs) => {
    const id = xmlId(obs);
    return `      <curve id="curve_${id}" logX="false" logY="false" xDataReference="dg_time" yDataReference="dg_${id}"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sedML xmlns="http://sed-ml.org/sed-ml/level1/version4"
       level="1" version="4">
  <listOfModels>
    <model id="model1" name="${escapeXml(modelName)}" language="urn:sedml:language:bngl" source="${escapeXml(modelSource)}"/>
  </listOfModels>
  <listOfSimulations>
    <uniformTimeCourse id="sim1"
      initialTime="${t_start}" outputStartTime="${t_start}"
      outputEndTime="${t_end}" numberOfPoints="${n_steps}">
      ${algorithmBlock}
    </uniformTimeCourse>
  </listOfSimulations>
  <listOfTasks>
    <task id="task1" modelReference="model1" simulationReference="sim1"/>
  </listOfTasks>
  <listOfDataGenerators>
    <dataGenerator id="dg_time" name="Time">
      <math xmlns="http://www.w3.org/1998/Math/MathML"><ci>t</ci></math>
      <listOfVariables>
        <variable id="t" taskReference="task1" symbol="urn:sedml:symbol:time"/>
      </listOfVariables>
    </dataGenerator>
${dataGenerators}
  </listOfDataGenerators>
  <listOfOutputs>
    <plot2D id="plot1" name="Time Course">
${curves}
    </plot2D>
  </listOfOutputs>
</sedML>`;
}
