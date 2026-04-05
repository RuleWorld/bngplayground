/**
 * ActionDispatcher.ts - Unified execution system for all BNG2 actions
 *
 * This module implements all BNGL action commands to match BNG2.pl functionality:
 * - File I/O: readFile, writeModel, writeNetwork, writeXML, writeSBML, writeMfile
 * - Parameters: setParameter, saveParameters, resetParameters
 * - Concentrations: setConcentration, addConcentration, saveConcentrations, resetConcentrations
 * - Network: generate_network
 * - Simulation: simulate, simulate_ode, simulate_ssa, simulate_nf, simulate_pla
 * - Analysis: parameter_scan, bifurcate, visualize
 *
 * Reference: BNG2/bng2/Perl2/BNGAction.pm, BNGModel.pm, BNGOutput.pm
 */

import type { BNGLModel, BNGLAction } from '../../types';
import { writeBNGL } from '../graph/BNGLWriter';
import { NetworkExporter } from '../graph/NetworkExporter';
import { BNGXMLWriter } from '../simulation/BNGXMLWriter';
import { SBMLWriter } from '../export/SBMLWriter';
import { MatlabWriter } from '../export/MatlabWriter';
import { parseNetFile } from '../graph/NetParser';

export interface ActionContext {
  model: BNGLModel;
  // State caches for save/reset operations
  parameterCaches: Map<string, Record<string, number>>;
  concentrationCaches: Map<string, Map<string, number>>;
  // Execution state
  outputPrefix?: string;
  outputDir?: string;
  speciesMap?: Map<string, BNGLModel['species'][0]>;
  // Callbacks
  readFile?: (filepath: string) => Promise<string>;
  writeFile?: (filepath: string, content: string) => Promise<void>;
}

export class ActionDispatcher {
  private context: ActionContext;

  constructor(model: BNGLModel, context?: Partial<ActionContext>) {
    this.context = {
      model,
      parameterCaches: new Map(),
      concentrationCaches: new Map(),
      ...context
    };
  }

  private getSpecies(name: string) {
    if (!this.context.speciesMap) {
      this.context.speciesMap = new Map();
      for (const s of this.context.model.species) {
        this.context.speciesMap.set(s.name, s);
      }
    }
    return this.context.speciesMap.get(name);
  }

  /**
   * Execute a single action
   */
  async executeAction(action: BNGLAction): Promise<void> {
    const { type, args } = action;

    switch (type) {
      // File I/O actions
      case 'readFile':
        return await this.readFile(args);
      case 'writeModel':
      case 'writeBNGL':
        return await this.writeModel(args);
      case 'writeNetwork':
        return await this.writeNetwork(args);
      case 'writeXML':
        return await this.writeXML(args);
      case 'writeSBML':
        return await this.writeSBML(args);
      case 'writeMfile':
      case 'writeMFile':
        return await this.writeMfile(args);

      // Parameter actions
      case 'setParameter':
        return this.setParameter(args);
      case 'saveParameters':
        return this.saveParameters(args);
      case 'resetParameters':
        return this.resetParameters(args);

      // Concentration actions
      case 'setConcentration':
        return this.setConcentration(args);
      case 'addConcentration':
        return this.addConcentration(args);
      case 'saveConcentrations':
        return this.saveConcentrations(args);
      case 'resetConcentrations':
        return this.resetConcentrations(args);

      // Network generation (already handled by main engine)
      case 'generate_network':
        console.log('[ActionDispatcher] generate_network handled by main engine');
        return;

      // Simulation (already handled by main engine)
      case 'simulate':
      case 'simulate_ode':
      case 'simulate_ssa':
      case 'simulate_nf':
      case 'simulate_pla':
      case 'simulate_psa':
        console.log(`[ActionDispatcher] ${type} handled by main engine`);
        return;

      default:
        console.warn(`[ActionDispatcher] Unknown action: ${type}`);
    }
  }

  /**
   * Execute all actions in sequence
   */
  async executeAll(actions: BNGLAction[]): Promise<void> {
    for (const action of actions) {
      await this.executeAction(action);
    }
  }

  // ========================================================================
  // FILE I/O ACTIONS
  // ========================================================================

  private async readFile(args: Record<string, any>): Promise<void> {
    const file = args.file;
    if (!file) {
      throw new Error(
        'readFile action requires a "file" parameter specifying the path to read. ' +
        'Example: readFile({file=>"model.net"})'
      );
    }

    if (!this.context.readFile) {
      throw new Error(
        'readFile action is not available in this environment (no file reader callback configured). ' +
        'File I/O is only supported when running with a backend that provides file access.'
      );
    }

    const content = await this.context.readFile(file);

    // Determine file type and parse accordingly
    if (file.endsWith('.net')) {
      const result = parseNetFile(content);
      if (!result.success) {
        throw new Error(
          `Failed to parse .net file "${file}": ${result.errors.join(', ')}. ` +
          'Ensure the file follows the BioNetGen .net format (species, reactions, groups blocks).'
        );
      }
      // Merge parsed model into current model
      this.context.model = { ...this.context.model, ...result.model };
    } else if (file.endsWith('.bngl')) {
      // Parse BNGL file - would need to import the parser
      throw new Error(
        'readFile for .bngl files is not yet supported inside action blocks. ' +
        'To load a BNGL model, provide it as the main input to the parser instead of using readFile().'
      );
    } else {
      throw new Error(
        `readFile does not support the file type of "${file}". ` +
        'Supported formats are .net (network files). ' +
        'For BNGL models, provide them as the main parser input.'
      );
    }
  }

  private async writeModel(args: Record<string, any>): Promise<void> {
    const format = args.format || 'bngl';
    const overwrite = args.overwrite ?? false;
    const prefix = args.prefix || this.context.outputPrefix || this.context.model.name || 'model';

    const filename = `${prefix}.${format}`;

    const content = writeBNGL(this.context.model, {
      includeComments: true,
      includeActions: false,
      overwriteAction: overwrite
    });

    if (!this.context.writeFile) {
      console.log('[ActionDispatcher] writeModel: no file writer callback, printing to console');
      console.log(content);
      return;
    }

    await this.context.writeFile(filename, content);
    console.log(`[ActionDispatcher] Wrote model to ${filename}`);
  }

  private async writeNetwork(args: Record<string, any>): Promise<void> {
    const prefix = args.prefix || this.context.outputPrefix || this.context.model.name || 'model';
    const suffix = args.suffix || 'net';
    const filename = `${prefix}.${suffix}`;

    // Check that network has been generated
    if (!this.context.model.species || this.context.model.species.length === 0) {
      throw new Error(
        'writeNetwork requires an expanded network, but no species were found. ' +
        'Call generate_network() before writeNetwork() to expand the rule-based model into a concrete reaction network.'
      );
    }
    if (!this.context.model.reactions || this.context.model.reactions.length === 0) {
      throw new Error(
        'writeNetwork requires an expanded network, but no reactions were found. ' +
        'Call generate_network() before writeNetwork() to expand the rule-based model into a concrete reaction network.'
      );
    }

    // Network export is not yet implemented. Throw an explicit error instead of writing a placeholder file.
    throw new Error(
      'writeNetwork is not yet implemented in this engine. ' +
      `Requested output file name would have been "${filename}". ` +
      'Please use generate_network() and other available export actions (e.g., writeXML or writeSBML) ' +
      'until full network export support is added.'
    );
  }

  private async writeXML(args: Record<string, any>): Promise<void> {
    const prefix = args.prefix || this.context.outputPrefix || this.context.model.name || 'model';
    const filename = `${prefix}.xml`;

    const content = BNGXMLWriter.write(this.context.model);

    if (!this.context.writeFile) {
      console.log('[ActionDispatcher] writeXML: no file writer callback, printing to console');
      console.log(content);
      return;
    }

    await this.context.writeFile(filename, content);
    console.log(`[ActionDispatcher] Wrote XML to ${filename}`);
  }

  private async writeSBML(args: Record<string, any>): Promise<void> {
    const prefix = args.prefix || this.context.outputPrefix || this.context.model.name || 'model';
    const filename = `${prefix}.xml`;

    const content = SBMLWriter.write(this.context.model);

    if (!this.context.writeFile) {
      console.log('[ActionDispatcher] writeSBML: no file writer callback, printing to console');
      console.log(content);
      return;
    }

    await this.context.writeFile(filename, content);
    console.log(`[ActionDispatcher] Wrote SBML to ${filename}`);
  }

  private async writeMfile(args: Record<string, any>): Promise<void> {
    const prefix = args.prefix || this.context.outputPrefix || this.context.model.name || 'model';
    const filename = `${prefix}.m`;

    const content = MatlabWriter.write(this.context.model, undefined, {
      tStart: args.t_start ?? 0,
      tEnd: args.t_end ?? 10,
      nSteps: args.n_steps ?? 100,
      atol: args.atol,
      rtol: args.rtol,
    });

    if (!this.context.writeFile) {
      console.log('[ActionDispatcher] writeMfile: no file writer callback, printing to console');
      console.log(content);
      return;
    }

    await this.context.writeFile(filename, content);
    console.log(`[ActionDispatcher] Wrote MATLAB file to ${filename}`);
  }

  // ========================================================================
  // PARAMETER ACTIONS
  // ========================================================================

  private setParameter(args: Record<string, any>): void {
    const parameter = args.parameter;
    const value = args.value;

    if (!parameter) {
      throw new Error(
        'setParameter action requires a "parameter" argument specifying which parameter to change. ' +
        'Example: setParameter("k1", 0.5)'
      );
    }
    if (value === undefined) {
      throw new Error(
        'setParameter action requires a "value" argument. ' +
        'Example: setParameter("k1", 0.5)'
      );
    }

    // Parse value if it's an expression
    let numericValue: number;
    if (typeof value === 'string') {
      // Simple evaluation - would need expression evaluator for complex cases
      numericValue = parseFloat(value);
      if (isNaN(numericValue)) {
        throw new Error(
          `setParameter: "${value}" is not a valid numeric value. ` +
          'Provide a number or a numeric string (e.g., "0.5", "1e-3").'
        );
      }
    } else {
      numericValue = value;
    }

    this.context.model.parameters[parameter] = numericValue;
    console.log(`[ActionDispatcher] Set ${parameter} = ${numericValue}`);
  }

  private saveParameters(args: Record<string, any>): void {
    const label = args.label || 'DEFAULT';

    // Save current parameters
    const snapshot = { ...this.context.model.parameters };
    this.context.parameterCaches.set(label, snapshot);
    console.log(`[ActionDispatcher] Saved parameters with label '${label}'`);
  }

  private resetParameters(args: Record<string, any>): void {
    const label = args.label || 'DEFAULT';

    const saved = this.context.parameterCaches.get(label);
    if (!saved) {
      throw new Error(
        `resetParameters: no saved parameter snapshot exists for label "${label}". ` +
        'Call saveParameters() with the same label before attempting to reset. ' +
        'Available labels can be set via saveParameters({label=>"myLabel"}).'
      );
    }

    // Restore parameters
    this.context.model.parameters = { ...saved };
    console.log(`[ActionDispatcher] Reset parameters from label '${label}'`);
  }

  // ========================================================================
  // CONCENTRATION ACTIONS
  // ========================================================================

  private setConcentration(args: Record<string, any>): void {
    const species = args.species;
    const value = args.value;

    if (!species) {
      throw new Error(
        'setConcentration action requires a "species" argument identifying which species to modify. ' +
        'Example: setConcentration("A(b)", 100)'
      );
    }
    if (value === undefined) {
      throw new Error(
        'setConcentration action requires a "value" argument specifying the new concentration. ' +
        'Example: setConcentration("A()", 100)'
      );
    }

    // Find species in model
    const speciesObj = this.getSpecies(species);
    if (!speciesObj) {
      throw new Error(
        `setConcentration: species "${species}" was not found in the model. ` +
        'Ensure the species name matches exactly (including components and states). ' +
        'If the network has not been generated yet, call generate_network() first.'
      );
    }

    // Parse value
    let numericValue: number;
    if (typeof value === 'string') {
      // Try to evaluate as parameter or expression
      if (this.context.model.parameters[value] !== undefined) {
        numericValue = this.context.model.parameters[value];
      } else {
        numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
          throw new Error(
            `setConcentration: "${value}" is not a valid numeric value and is not a known parameter name. ` +
            'Provide a number, numeric string, or the name of a defined parameter.'
          );
        }
      }
    } else {
      numericValue = value;
    }

    speciesObj.initialConcentration = numericValue;
    console.log(`[ActionDispatcher] Set concentration ${species} = ${numericValue}`);
  }

  private addConcentration(args: Record<string, any>): void {
    const species = args.species;
    const value = args.value;

    if (!species) {
      throw new Error(
        'addConcentration action requires a "species" argument identifying which species to modify. ' +
        'Example: addConcentration("A(b)", 50)'
      );
    }
    if (value === undefined) {
      throw new Error(
        'addConcentration action requires a "value" argument specifying the amount to add. ' +
        'Example: addConcentration("A()", 50)'
      );
    }

    // Find species in model
    const speciesObj = this.getSpecies(species);
    if (!speciesObj) {
      throw new Error(
        `addConcentration: species "${species}" was not found in the model. ` +
        'Ensure the species name matches exactly (including components and states). ' +
        'If the network has not been generated yet, call generate_network() first.'
      );
    }

    // Parse value
    let numericValue: number;
    if (typeof value === 'string') {
      if (this.context.model.parameters[value] !== undefined) {
        numericValue = this.context.model.parameters[value];
      } else {
        numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
          throw new Error(
            `addConcentration: "${value}" is not a valid numeric value and is not a known parameter name. ` +
            'Provide a number, numeric string, or the name of a defined parameter.'
          );
        }
      }
    } else {
      numericValue = value;
    }

    speciesObj.initialConcentration += numericValue;
    console.log(`[ActionDispatcher] Added ${numericValue} to ${species}, new value = ${speciesObj.initialConcentration}`);
  }

  private saveConcentrations(args: Record<string, any>): void {
    const label = args.label || 'DEFAULT';

    // Save current species concentrations
    const snapshot = new Map<string, number>();
    for (const species of this.context.model.species) {
      snapshot.set(species.name, species.initialConcentration);
    }

    this.context.concentrationCaches.set(label, snapshot);
    console.log(`[ActionDispatcher] Saved concentrations with label '${label}'`);
  }

  private resetConcentrations(args: Record<string, any>): void {
    const label = args.label || 'DEFAULT';

    const saved = this.context.concentrationCaches.get(label);
    if (!saved) {
      throw new Error(
        `resetConcentrations: no saved concentration snapshot exists for label "${label}". ` +
        'Call saveConcentrations() with the same label before attempting to reset. ' +
        'Available labels can be set via saveConcentrations({label=>"myLabel"}).'
      );
    }

    // Restore concentrations
    for (const species of this.context.model.species) {
      const savedValue = saved.get(species.name);
      if (savedValue !== undefined) {
        species.initialConcentration = savedValue;
      }
    }

    console.log(`[ActionDispatcher] Reset concentrations from label '${label}'`);
  }
}
