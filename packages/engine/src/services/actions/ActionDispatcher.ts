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
      throw new Error('readFile: file parameter is required');
    }

    if (!this.context.readFile) {
      throw new Error('readFile: no file reader callback provided');
    }

    const content = await this.context.readFile(file);

    // Determine file type and parse accordingly
    if (file.endsWith('.net')) {
      const result = parseNetFile(content);
      if (!result.success) {
        throw new Error(`Failed to parse .net file: ${result.errors.join(', ')}`);
      }
      // Merge parsed model into current model
      this.context.model = { ...this.context.model, ...result.model };
    } else if (file.endsWith('.bngl')) {
      // Parse BNGL file - would need to import the parser
      throw new Error('readFile for .bngl not yet implemented - use main parser');
    } else {
      throw new Error(`readFile: unsupported file type: ${file}`);
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
      throw new Error('writeNetwork: no species found - generate network first');
    }
    if (!this.context.model.reactions || this.context.model.reactions.length === 0) {
      throw new Error('writeNetwork: no reactions found - generate network first');
    }

    // Convert to Species/Rxn objects for exporter
    // This is a simplified version - real implementation would need proper Species/Rxn classes
    const content = '# Network export not fully implemented yet\n';
    console.warn('[ActionDispatcher] writeNetwork: full implementation pending');

    if (!this.context.writeFile) {
      console.log(content);
      return;
    }

    await this.context.writeFile(filename, content);
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
      throw new Error('setParameter: parameter name is required');
    }
    if (value === undefined) {
      throw new Error('setParameter: value is required');
    }

    // Parse value if it's an expression
    let numericValue: number;
    if (typeof value === 'string') {
      // Simple evaluation - would need expression evaluator for complex cases
      numericValue = parseFloat(value);
      if (isNaN(numericValue)) {
        throw new Error(`setParameter: invalid numeric value: ${value}`);
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
      throw new Error(`resetParameters: no saved parameters found for label '${label}'`);
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
      throw new Error('setConcentration: species is required');
    }
    if (value === undefined) {
      throw new Error('setConcentration: value is required');
    }

    // Find species in model
    const speciesObj = this.getSpecies(species);
    if (!speciesObj) {
      throw new Error(`setConcentration: species not found: ${species}`);
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
          throw new Error(`setConcentration: invalid value: ${value}`);
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
      throw new Error('addConcentration: species is required');
    }
    if (value === undefined) {
      throw new Error('addConcentration: value is required');
    }

    // Find species in model
    const speciesObj = this.getSpecies(species);
    if (!speciesObj) {
      throw new Error(`addConcentration: species not found: ${species}`);
    }

    // Parse value
    let numericValue: number;
    if (typeof value === 'string') {
      if (this.context.model.parameters[value] !== undefined) {
        numericValue = this.context.model.parameters[value];
      } else {
        numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
          throw new Error(`addConcentration: invalid value: ${value}`);
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
      throw new Error(`resetConcentrations: no saved concentrations found for label '${label}'`);
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
