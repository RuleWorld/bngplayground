// ---------------------------------------------------------------------------
// MultiscaleSimulation.ts – Orchestrator: multirate intracellular ODE +
// cell decisions + extracellular PDE with cooperative cancellation
// ---------------------------------------------------------------------------

import {
  CellState,
  CellTypeDefinition,
  CellAction,
  SimpleRNG,
  createCell,
  evaluateCondition,
  divideCell,
  moveCell,
  applyCellBoundary,
} from './CellAgent';
import { ExtracellularGrid, ExtracellularGridConfig } from './ExtracellularGrid';
import { IntracellularEngine } from './IntracellularEngine';
import { isSafeObjectKey, setSafeNumberField } from '../../utils/safeObjectKey';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MultiscaleConfig {
  cellTypes: CellTypeDefinition[];
  initialCells: Array<{
    cellType: string;
    position: [number, number, number];
    count?: number;
  }>;
  extracellularSpecies: Array<{
    name: string;
    diffusionConstant: number;
    initialConcentration: number;
    degradationRate?: number;
  }>;
  domain: {
    dimensions: 2 | 3;
    size: [number, number, number];
    boundaryCondition: 'reflective' | 'periodic' | 'absorbing';
    resolution?: [number, number, number] | [number, number];
  };
  tEnd: number;
  dtIntracellular: number;
  dtExtracellular: number;
  dtDecision: number;
  nOutput: number;
  maxCells?: number;
  seed?: number;
}

export interface CompactCellSnapshot {
  id: number;
  cellType: string;
  position: [number, number, number];
  radius: number;
  phase: 'active' | 'dividing' | 'apoptotic' | 'dead';
  observables: Record<string, number>;
}

export interface MultiscaleSnapshot {
  time: number;
  cells: CompactCellSnapshot[];
  populationCounts: Record<string, number>;
  meanObservables: Record<string, Record<string, number>>;
}

export interface LineageRecord {
  cellId: number;
  parentId: number | null;
  cellType: string;
  birthTime: number;
  deathTime: number | null;
  divisionTimes: number[];
}

export interface MultiscaleResult {
  snapshots: MultiscaleSnapshot[];
  cellLineage: LineageRecord[];
  populationTimeSeries: {
    time: number[];
    counts: Record<string, number[]>;
  };
}

export interface MultiscaleSimulationOptions {
  isCancelled?: () => boolean;
}

function setSafeNumberArrayField(target: Record<string, number[]>, key: string, value: number[]): void {
  if (isSafeObjectKey(key)) {
    Reflect.set(target, key, value);
  }
}

// ---------------------------------------------------------------------------
// multiscaleSimulation – main entry point
// ---------------------------------------------------------------------------

export async function multiscaleSimulation(
  config: MultiscaleConfig,
  onProgress?: (fraction: number) => void,
  options?: MultiscaleSimulationOptions,
): Promise<MultiscaleResult> {
  // Input validation
  if (!config || typeof config !== 'object') {
    throw new Error('MultiscaleConfig must be a valid object');
  }
  if (config.tEnd <= 0 || !Number.isFinite(config.tEnd)) {
    throw new Error(`Invalid tEnd: ${config.tEnd}. Must be positive number.`);
  }
  if (config.dtIntracellular <= 0 || !Number.isFinite(config.dtIntracellular)) {
    throw new Error(`Invalid dtIntracellular: ${config.dtIntracellular}`);
  }
  if (config.dtExtracellular <= 0 || !Number.isFinite(config.dtExtracellular)) {
    throw new Error(`Invalid dtExtracellular: ${config.dtExtracellular}`);
  }
  if (config.dtDecision <= 0 || !Number.isFinite(config.dtDecision)) {
    throw new Error(`Invalid dtDecision: ${config.dtDecision}`);
  }

  const dims: 2 | 3 = config.domain.dimensions === 2 ? 2 : 3;
  const rng = new SimpleRNG(config.seed ?? 42);

  // ---- Build cell-type lookup ----
  const cellTypeDefs = new Map<string, CellTypeDefinition>();
  for (const ct of config.cellTypes) {
    cellTypeDefs.set(ct.name, ct);
  }

  // ---- Compile intracellular BNGL model per cell type (CVODE / stiff BDF) ----
  const engines = new Map<string, IntracellularEngine>();
  for (const ct of config.cellTypes) {
    const bnglText = ct.bnglModel?.trim();
    if (!bnglText) continue;
    try {
      const engine = await IntracellularEngine.create(ct.name, bnglText);
      engines.set(ct.name, engine);
    } catch (err) {
      console.warn(
        `[multiscale] no intracellular dynamics for cell type "${ct.name}": ` +
        (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  try {
    // ---- Extracellular grid ----
    let gridRes: [number, number, number];
    if (config.domain.resolution) {
      const r = config.domain.resolution;
      gridRes = dims === 2
        ? [r[0], r[1], 1]
        : [r[0], r[1], r[2] ?? 1];
    } else {
      gridRes = dims === 2 ? [20, 20, 1] : [20, 20, 20];
    }

    const gridConfig: ExtracellularGridConfig = {
      dimensions: dims,
      domainSize: [
        config.domain.size[0],
        config.domain.size[1],
        dims === 2 ? 1.0 : (config.domain.size[2] ?? 1.0),
      ],
      resolution: gridRes,
      species: config.extracellularSpecies.map((s) => ({
        name: s.name,
        diffusionConstant: s.diffusionConstant,
        degradationRate: s.degradationRate ?? 0,
        initialConcentration: s.initialConcentration,
      })),
      boundaryCondition:
        config.domain.boundaryCondition === 'periodic' ? 'periodic'
          : config.domain.boundaryCondition === 'absorbing' ? 'dirichlet'
          : 'neumann',
    };
    const grid = new ExtracellularGrid(gridConfig);

    // ---- Initialise cells and O(1) lineage bookkeeping ----
    let nextCellId = 0;
    let cells: CellState[] = [];
    const lineage: LineageRecord[] = [];
    const lineageByCellId = new Map<number, LineageRecord>();
    let activeCellCount = 0;

    for (const init of config.initialCells) {
      const typeDef = cellTypeDefs.get(init.cellType);
      if (!typeDef) continue;
      const count = init.count ?? 1;
      for (let c = 0; c < count; c++) {
        const pos: [number, number, number] = [
          init.position[0] + (rng.next() - 0.5) * 1e-3,
          init.position[1] + (rng.next() - 0.5) * 1e-3,
          dims === 2 ? 0 : init.position[2] + (rng.next() - 0.5) * 1e-3,
        ];
        const cell = createCell(nextCellId, typeDef, pos);
        applyCellBoundary(cell, config.domain.size, config.domain.boundaryCondition, dims);

        const engine = engines.get(typeDef.name);
        if (engine) {
          cell.intracellularState = engine.newState();
          engine.computeObservables(cell.intracellularState, cell.observables);
        }
        cells.push(cell);
        activeCellCount++;

        const linRec: LineageRecord = {
          cellId: nextCellId,
          parentId: null,
          cellType: typeDef.name,
          birthTime: 0,
          deathTime: null,
          divisionTimes: [],
        };
        lineage.push(linRec);
        lineageByCellId.set(nextCellId, linRec);
        nextCellId++;
      }
    }

    // Set initial sources and sinks on extracellular grid
    grid.clearSourcesSinks();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.phase === 'dead') continue;
      const typeDef = cellTypeDefs.get(cell.cellType);
      if (typeDef?.secretion) {
        for (const s of typeDef.secretion) {
          const obsVal = cell.observables[s.intracellularObservable] ?? 0;
          const rate = obsVal * s.scalingFactor;
          setSafeNumberField(cell.secretionRates, s.species, rate);
          if (rate > 0) grid.addSource(cell.position, s.species, rate);
        }
      }
      if (typeDef?.uptake) {
        for (const u of typeDef.uptake) {
          const conc = grid.getConcentration(cell.position, u.species);
          setSafeNumberField(cell.observables, u.intracellularParameter, conc * u.scalingFactor);
        }
      }
    }

    // ---- Output bookkeeping ----
    const snapshots: MultiscaleSnapshot[] = [];
    const outputInterval = config.tEnd / Math.max(1, config.nOutput);
    const popTs: MultiscaleResult['populationTimeSeries'] = {
      time: [],
      counts: Object.create(null) as Record<string, number[]>,
    };
    for (const ct of config.cellTypes) {
      setSafeNumberArrayField(popTs.counts, ct.name, []);
    }

    // Helper: take compact, immutable snapshot
    function takeSnapshot(time: number): void {
      const popCounts: Record<string, number> = Object.create(null) as Record<string, number>;
      const obsAccum: Record<string, Record<string, number>> = Object.create(null) as Record<string, Record<string, number>>;
      const obsCounts: Record<string, number> = Object.create(null) as Record<string, number>;

      for (const ct of config.cellTypes) {
        if (!isSafeObjectKey(ct.name)) continue;
        setSafeNumberField(popCounts, ct.name, 0);
        Reflect.set(obsAccum, ct.name, Object.create(null) as Record<string, number>);
        setSafeNumberField(obsCounts, ct.name, 0);
      }

      const compactCells: CompactCellSnapshot[] = [];

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.phase === 'dead') continue;
        if (!isSafeObjectKey(cell.cellType)) continue;

        setSafeNumberField(popCounts, cell.cellType, (popCounts[cell.cellType] ?? 0) + 1);
        setSafeNumberField(obsCounts, cell.cellType, (obsCounts[cell.cellType] ?? 0) + 1);

        if (!obsAccum[cell.cellType]) {
          obsAccum[cell.cellType] = Object.create(null) as Record<string, number>;
        }
        for (const [key, val] of Object.entries(cell.observables)) {
          if (!isSafeObjectKey(key)) continue;
          setSafeNumberField(obsAccum[cell.cellType], key, (obsAccum[cell.cellType][key] ?? 0) + val);
        }

        compactCells.push({
          id: cell.id,
          cellType: cell.cellType,
          position: [cell.position[0], cell.position[1], cell.position[2]],
          radius: cell.radius,
          phase: cell.phase,
          observables: { ...cell.observables },
        });
      }

      const meanObs: Record<string, Record<string, number>> = Object.create(null) as Record<string, Record<string, number>>;
      for (const [ct, accum] of Object.entries(obsAccum)) {
        meanObs[ct] = Object.create(null) as Record<string, number>;
        const n = obsCounts[ct] || 1;
        for (const [key, sum] of Object.entries(accum)) {
          setSafeNumberField(meanObs[ct], key, sum / n);
        }
      }

      snapshots.push({
        time,
        cells: compactCells,
        populationCounts: popCounts,
        meanObservables: meanObs,
      });

      popTs.time.push(time);
      for (const ct of config.cellTypes) {
        if (!isSafeObjectKey(ct.name)) continue;
        popTs.counts[ct.name].push(popCounts[ct.name] ?? 0);
      }
    }

    // Initial snapshot at t = 0
    takeSnapshot(0);

    // ---- Multirate Scheduler Clocks ----
    const maxCells = config.maxCells ?? 100000;
    const dtIntra = config.dtIntracellular;
    const dtExtra = config.dtExtracellular;
    const dtDecision = config.dtDecision;

    let stepIntra = 1;
    let stepExtra = 1;
    let stepDecision = 1;
    let stepOutput = 1;

    let tCurrent = 0;
    let tIntra = 0;
    let tExtra = 0;

    let maxCellsReachedLogged = false;
    let lastYieldTime = performance.now();

    // Check cancellation helper
    const checkCancelled = (): boolean => {
      return Boolean(options?.isCancelled?.());
    };

    while (tCurrent < config.tEnd - 1e-12) {
      if (checkCancelled()) {
        break;
      }

      const nextTargetIntra = Math.min(config.tEnd, stepIntra * dtIntra);
      const nextTargetExtra = Math.min(config.tEnd, stepExtra * dtExtra);
      const nextTargetDecision = Math.min(config.tEnd, stepDecision * dtDecision);
      const nextTargetOutput = Math.min(config.tEnd, stepOutput * outputInterval);

      const tNext = Math.min(nextTargetIntra, nextTargetExtra, nextTargetDecision, nextTargetOutput, config.tEnd);
      tCurrent = tNext;

      const isIntraTarget = Math.abs(tNext - nextTargetIntra) < 1e-11;
      const isExtraTarget = Math.abs(tNext - nextTargetExtra) < 1e-11;
      const isDecisionTarget = Math.abs(tNext - nextTargetDecision) < 1e-11;
      const isOutputTarget = Math.abs(tNext - nextTargetOutput) < 1e-11;

      // 1. INTRACELLULAR INTEGRATION up to tNext
      // If intracellular clock reached its target, or if a decision/output needs current states
      const needsIntra = isIntraTarget || isDecisionTarget || isOutputTarget || tNext === config.tEnd;
      if (needsIntra && tNext > tIntra + 1e-12) {
        const dtI = tNext - tIntra;
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (cell.phase === 'dead') continue;
          const engine = engines.get(cell.cellType);
          if (!engine || cell.intracellularState.length === 0) continue;
          engine.integrate(cell.intracellularState, tIntra, tNext);
          engine.computeObservables(cell.intracellularState, cell.observables);
          cell.age += dtI;
        }
        tIntra = tNext;
      }
      if (isIntraTarget) {
        stepIntra++;
      }

      // 2. EXTRACELLULAR DIFFUSION up to tNext
      const needsExtra = isExtraTarget || isDecisionTarget || isOutputTarget || tNext === config.tEnd;
      if (needsExtra && tNext > tExtra + 1e-12) {
        const dtE = tNext - tExtra;
        grid.step(dtE);
        tExtra = tNext;
      }
      if (isExtraTarget) {
        stepExtra++;
      }

      // 3. COUPLING between extracellular field and cell observables/rates
      if (needsIntra || needsExtra || isDecisionTarget) {
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (cell.phase === 'dead') continue;
          const typeDef = cellTypeDefs.get(cell.cellType);
          if (!typeDef) continue;

          // Uptake: extracellular concentration sets intracellular parameter
          if (typeDef.uptake) {
            for (const u of typeDef.uptake) {
              const conc = grid.getConcentration(cell.position, u.species);
              setSafeNumberField(cell.observables, u.intracellularParameter, conc * u.scalingFactor);
            }
          }

          // Secretion: intracellular observable sets extracellular secretion rate
          if (typeDef.secretion) {
            for (const s of typeDef.secretion) {
              const obsVal = cell.observables[s.intracellularObservable] ?? 0;
              setSafeNumberField(cell.secretionRates, s.species, obsVal * s.scalingFactor);
            }
          }
        }
      }

      // 4. DECISION EVALUATION & ACTION EXECUTION
      if (isDecisionTarget) {
        stepDecision++;

        const actions: Array<{ cell: CellState; action: CellAction }> = [];

        // Evaluate decision rules
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (cell.phase === 'dead') continue;
          const typeDef = cellTypeDefs.get(cell.cellType);
          if (!typeDef) continue;

          for (const rule of typeDef.decisionRules) {
            // Check refractory period
            if (rule.refractoryPeriod && rule.refractoryPeriod > 0) {
              const cd = cell.ruleCooldowns?.[rule.name];
              if (cd !== undefined && cd > tNext + 1e-12) {
                continue; // rule in refractory period
              }
            }

            if (evaluateCondition(cell, rule.condition)) {
              // Stochastic gating
              const prob = rule.probability ?? 1;
              if (rng.next() < prob) {
                // Set refractory cooldown
                if (rule.refractoryPeriod && rule.refractoryPeriod > 0) {
                  if (!cell.ruleCooldowns) cell.ruleCooldowns = Object.create(null) as Record<string, number>;
                  cell.ruleCooldowns[rule.name] = tNext + rule.refractoryPeriod;
                }
                actions.push({ cell, action: rule.action });
                break; // first matching rule fires
              }
            }
          }
        }

        // Execute actions with O(1) bookkeeping
        const newCells: CellState[] = [];
        for (const { cell, action } of actions) {
          switch (action.type) {
            case 'divide': {
              if (activeCellCount >= maxCells) {
                if (!maxCellsReachedLogged) {
                  maxCellsReachedLogged = true;
                  console.warn(`[MultiscaleSimulation] maxCells limit (${maxCells}) reached at t=${tNext.toFixed(2)}; suppressing further cell divisions.`);
                }
                break;
              }

              cell.phase = 'dividing';
              const daughter = divideCell(cell, nextCellId, rng, dims);
              cell.phase = 'active';
              daughter.phase = 'active';
              applyCellBoundary(cell, config.domain.size, config.domain.boundaryCondition, dims);
              applyCellBoundary(daughter, config.domain.size, config.domain.boundaryCondition, dims);

              newCells.push(daughter);
              activeCellCount++;

              // Lineage O(1)
              const linRec: LineageRecord = {
                cellId: nextCellId,
                parentId: cell.id,
                cellType: cell.cellType,
                birthTime: tNext,
                deathTime: null,
                divisionTimes: [],
              };
              lineage.push(linRec);
              lineageByCellId.set(nextCellId, linRec);

              const parentLin = lineageByCellId.get(cell.id);
              if (parentLin) {
                parentLin.divisionTimes.push(tNext);
              }
              nextCellId++;
              break;
            }

            case 'die': {
              if (cell.phase !== 'dead') {
                cell.phase = 'dead';
                activeCellCount--;
                const lin = lineageByCellId.get(cell.id);
                if (lin) lin.deathTime = tNext;
              }
              break;
            }

            case 'migrate': {
              const speed = action.speed * dtDecision;
              if (action.direction === 'chemotaxis' && action.chemotaxisTarget) {
                const grad = grid.getGradient(cell.position, action.chemotaxisTarget);
                moveCell(cell, 'chemotaxis', speed, grad, rng, dims);
              } else {
                moveCell(cell, 'random', speed, undefined, rng, dims);
              }
              applyCellBoundary(cell, config.domain.size, config.domain.boundaryCondition, dims);
              break;
            }

            case 'secrete': {
              setSafeNumberField(cell.secretionRates, action.species, action.rate);
              break;
            }

            case 'stop_secrete': {
              if (isSafeObjectKey(action.species)) {
                setSafeNumberField(cell.secretionRates, action.species, 0);
              }
              break;
            }

            case 'change_type': {
              cell.cellType = action.newType;
              const newEngine = engines.get(action.newType);
              if (newEngine) {
                cell.intracellularState = newEngine.newState();
                newEngine.computeObservables(cell.intracellularState, cell.observables);
              }
              break;
            }

            case 'set_parameter': {
              setSafeNumberField(cell.observables, action.parameter, action.value);
              break;
            }
          }
        }

        if (newCells.length > 0) {
          cells.push(...newCells);
        }

        // Apply default motility to all active cells
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (cell.phase === 'dead') continue;
          const typeDef = cellTypeDefs.get(cell.cellType);
          if (typeDef && typeDef.motility > 0) {
            moveCell(cell, 'random', typeDef.motility * dtDecision, undefined, rng, dims);
            applyCellBoundary(cell, config.domain.size, config.domain.boundaryCondition, dims);
          }
        }

        // Refresh grid sources and sinks
        grid.clearSourcesSinks();
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          if (cell.phase === 'dead') continue;
          for (const [species, rate] of Object.entries(cell.secretionRates)) {
            if (rate > 0) grid.addSource(cell.position, species, rate);
          }
          for (const [species, rate] of Object.entries(cell.uptakeRates)) {
            if (rate > 0) grid.addSink(cell.position, species, rate);
          }
        }

        // Prune dead cells periodically if they exceed 25% of population and > 50 dead cells
        if (cells.length - activeCellCount > Math.max(50, activeCellCount * 0.25)) {
          cells = cells.filter((c) => c.phase !== 'dead');
        }
      }

      // 5. OUTPUT RECORDING
      if (isOutputTarget) {
        stepOutput++;
        takeSnapshot(tNext);
      }

      // 6. COOPERATIVE YIELDING AND PROGRESS REPORTING
      const now = performance.now();
      if (now - lastYieldTime > 50) {
        lastYieldTime = now;
        if (onProgress) {
          onProgress(Math.min(1, Math.max(0, tNext / config.tEnd)));
        }
        // Yield execution to worker event loop so cancellation can be processed
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Ensure final snapshot at tEnd
    if (snapshots.length === 0 || snapshots[snapshots.length - 1].time < config.tEnd - 1e-6) {
      takeSnapshot(config.tEnd);
    }

    if (onProgress) {
      onProgress(1.0);
    }

    return {
      snapshots,
      cellLineage: lineage,
      populationTimeSeries: popTs,
    };
  } finally {
    // Guaranteed disposal of all CVODE solver resources on all exit paths
    for (const engine of engines.values()) {
      engine.dispose();
    }
  }
}
