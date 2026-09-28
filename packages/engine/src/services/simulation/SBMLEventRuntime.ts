import jsep from 'jsep';
import type { BNGLEvent, BNGLEventAssignment, BNGLFunction } from '../../types';
import { evaluateFunctionalRate } from './ExpressionEvaluator';

type ExpressionNode = {
  type: string;
  name?: string;
  value?: unknown;
  operator?: string;
  left?: ExpressionNode;
  right?: ExpressionNode;
  argument?: ExpressionNode;
  callee?: ExpressionNode;
  arguments?: ExpressionNode[];
  test?: ExpressionNode;
  consequent?: ExpressionNode;
  alternate?: ExpressionNode;
};

type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

interface ComparisonRoot {
  id: number;
  eventIndex: number;
  node: ExpressionNode;
  operator: ComparisonOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

interface EventRecord {
  event: BNGLEvent;
  expression: string;
  ast: ExpressionNode | null;
  roots: ComparisonRoot[];
  armed: boolean;
  pending: PendingEvent[];
}

interface EventSnapshot {
  context: Record<string, number>;
  state: Float64Array;
}

interface PendingEvent {
  eventIndex: number;
  dueTime: number;
  scheduledAt: number;
  priority: number;
  snapshot?: EventSnapshot;
}

interface HistorySample {
  time: number;
  state: Float64Array;
  context: Record<string, number>;
}

export interface SBMLEventAssignmentTarget {
  kind: 'species' | 'parameter' | 'compartment';
  index?: number;
  name: string;
  valueType?: 'amount' | 'concentration';
}

export interface SBMLEventRuntimeOptions {
  events: BNGLEvent[];
  parameters: Record<string, number>;
  functions?: BNGLFunction[];
  buildContext: (state: Float64Array, time: number) => Record<string, number>;
  resolveAssignment: (assignment: BNGLEventAssignment) => SBMLEventAssignmentTarget | undefined;
  applyAssignment: (target: SBMLEventAssignmentTarget, value: number, state: Float64Array) => void;
  applyAssignments?: (assignments: Array<{ target: SBMLEventAssignmentTarget; value: number }>, state: Float64Array) => void;
  onParameterChange?: () => void;
  evaluateRateOf?: (symbol: string, state: Float64Array, time: number) => number;
  strict?: boolean;
}

export interface SBMLEventProcessResult {
  changed: boolean;
  stateChanged: boolean;
  parametersChanged: boolean;
  fired: string[];
  diagnostics: string[];
}

const COMPARISON_OPERATORS = new Set<ComparisonOperator>(['==', '!=', '<', '<=', '>', '>=']);
const RELATION_FUNCTIONS: Record<string, ComparisonOperator> = {
  eq: '==',
  neq: '!=',
  lt: '<',
  leq: '<=',
  gt: '>',
  geq: '>=',
  equal: '==',
  notequal: '!=',
  lessthan: '<',
  greaterthan: '>',
};

function asExpressionNode(node: unknown): ExpressionNode {
  return node as ExpressionNode;
}

function parseExpression(expression: string): ExpressionNode | null {
  try {
    return asExpressionNode(jsep(expression));
  } catch {
    return null;
  }
}

function isComparisonNode(node: ExpressionNode): boolean {
  return node.type === 'BinaryExpression' && typeof node.operator === 'string' && COMPARISON_OPERATORS.has(node.operator as ComparisonOperator);
}

function comparisonChain(node: ExpressionNode): { operands: ExpressionNode[]; operators: ComparisonOperator[] } | undefined {
  if (!isComparisonNode(node) || !node.left || !node.right) return undefined;
  if (isComparisonNode(node.left)) {
    const prefix = comparisonChain(node.left);
    if (prefix) {
      return {
        operands: [...prefix.operands, node.right],
        operators: [...prefix.operators, node.operator as ComparisonOperator],
      };
    }
  }
  return { operands: [node.left, node.right], operators: [node.operator as ComparisonOperator] };
}

function isRelationCall(node: ExpressionNode): boolean {
  return node.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && typeof node.callee.name === 'string'
    && Object.prototype.hasOwnProperty.call(RELATION_FUNCTIONS, node.callee.name.toLowerCase())
    && (node.arguments?.length ?? 0) === 2;
}

function collectComparisonRoots(node: ExpressionNode, eventIndex: number, roots: ComparisonRoot[], nextId: { value: number }): void {
  if (isComparisonNode(node) && node.left && node.right) {
    roots.push({
      id: nextId.value++,
      eventIndex,
      node,
      operator: node.operator as ComparisonOperator,
      left: node.left,
      right: node.right,
    });
    return;
  }
  if (isRelationCall(node) && node.arguments) {
    roots.push({
      id: nextId.value++,
      eventIndex,
      node,
      operator: RELATION_FUNCTIONS[node.callee!.name!.toLowerCase()],
      left: node.arguments[0],
      right: node.arguments[1],
    });
    return;
  }
  if (node.left) collectComparisonRoots(node.left, eventIndex, roots, nextId);
  if (node.right) collectComparisonRoots(node.right, eventIndex, roots, nextId);
  if (node.argument) collectComparisonRoots(node.argument, eventIndex, roots, nextId);
  if (node.arguments) {
    for (const argument of node.arguments) collectComparisonRoots(argument, eventIndex, roots, nextId);
  }
  if (node.test) collectComparisonRoots(node.test, eventIndex, roots, nextId);
  if (node.consequent) collectComparisonRoots(node.consequent, eventIndex, roots, nextId);
  if (node.alternate) collectComparisonRoots(node.alternate, eventIndex, roots, nextId);
}

function quoteString(value: string): string {
  return JSON.stringify(value);
}

function nodeToExpression(node: ExpressionNode): string {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? quoteString(node.value) : String(node.value);
    case 'Identifier':
      return node.name || '';
    case 'UnaryExpression':
      return `${node.operator || ''}(${node.argument ? nodeToExpression(node.argument) : '0'})`;
    case 'BinaryExpression':
    case 'LogicalExpression':
      return `(${node.left ? nodeToExpression(node.left) : '0'} ${node.operator || '+'} ${node.right ? nodeToExpression(node.right) : '0'})`;
    case 'ConditionalExpression':
      return `(${node.test ? nodeToExpression(node.test) : '0'} ? ${node.consequent ? nodeToExpression(node.consequent) : '0'} : ${node.alternate ? nodeToExpression(node.alternate) : '0'})`;
    case 'CallExpression': {
      const name = node.callee?.name || '';
      return `${name}(${(node.arguments || []).map(nodeToExpression).join(', ')})`;
    }
    default:
      return '';
  }
}

function isTruthy(value: number): boolean {
  return Number.isFinite(value) && value !== 0;
}

function compare(left: number, right: number, operator: ComparisonOperator, tolerance = 0): boolean {
  const epsilon = tolerance * Math.max(1, Math.abs(left), Math.abs(right));
  switch (operator) {
    case '==': return Math.abs(left - right) <= epsilon;
    case '!=': return Math.abs(left - right) > epsilon;
    case '<': return left < right + epsilon;
    case '<=': return left <= right + epsilon;
    case '>': return left > right - epsilon;
    case '>=': return left >= right - epsilon;
  }
}

function relationName(node: ExpressionNode): string | undefined {
  if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return undefined;
  return node.callee.name?.toLowerCase();
}

interface TimeThreshold {
  value: number;
  operator: ComparisonOperator;
}

interface AffineTimeExpression {
  coefficient: number;
  constant: number;
}

function affineTimeExpression(node: ExpressionNode, context: Record<string, number>): AffineTimeExpression | undefined {
  if (node.type === 'Identifier') {
    if (node.name === 'time' || node.name === 't') return { coefficient: 1, constant: 0 };
    const value = node.name ? context[node.name] : Number.NaN;
    return Number.isFinite(value) ? { coefficient: 0, constant: value } : undefined;
  }
  if (node.type === 'Literal') {
    const value = Number(node.value);
    return Number.isFinite(value) ? { coefficient: 0, constant: value } : undefined;
  }
  if (node.type === 'UnaryExpression' && node.argument) {
    const argument = affineTimeExpression(node.argument, context);
    if (!argument) return undefined;
    if (node.operator === '-') return { coefficient: -argument.coefficient, constant: -argument.constant };
    if (node.operator === '+') return argument;
    return undefined;
  }
  if ((node.type === 'BinaryExpression' || node.type === 'LogicalExpression') && node.left && node.right) {
    const left = affineTimeExpression(node.left, context);
    const right = affineTimeExpression(node.right, context);
    if (!left || !right) return undefined;
    switch (node.operator) {
      case '+': return { coefficient: left.coefficient + right.coefficient, constant: left.constant + right.constant };
      case '-': return { coefficient: left.coefficient - right.coefficient, constant: left.constant - right.constant };
      case '*':
        if (left.coefficient !== 0 && right.coefficient !== 0) return undefined;
        if (left.coefficient !== 0) return { coefficient: left.coefficient * right.constant, constant: left.constant * right.constant };
        if (right.coefficient !== 0) return { coefficient: right.coefficient * left.constant, constant: right.constant * left.constant };
        return { coefficient: 0, constant: left.constant * right.constant };
      case '/':
        if (right.coefficient !== 0 || right.constant === 0) return undefined;
        return { coefficient: left.coefficient / right.constant, constant: left.constant / right.constant };
      default: return undefined;
    }
  }
  return undefined;
}

function collectTimeThresholds(node: ExpressionNode, context: Record<string, number>, thresholds: TimeThreshold[]): void {
  const relation = isComparisonNode(node)
    ? { operator: node.operator as ComparisonOperator, left: node.left, right: node.right }
    : (isRelationCall(node) ? { operator: RELATION_FUNCTIONS[relationName(node)!], left: node.arguments?.[0], right: node.arguments?.[1] } : undefined);
  if (relation?.left && relation.right) {
    const left = affineTimeExpression(relation.left, context);
    const right = affineTimeExpression(relation.right, context);
    if (left && right) {
      const coefficient = left.coefficient - right.coefficient;
      const constant = left.constant - right.constant;
      if (coefficient !== 0 && Number.isFinite(constant)) {
        const enteringOperator = coefficient > 0 ? relation.operator : ({
          '==': '==', '!=': '!=', '<': '>', '<=': '>=', '>': '<', '>=': '<=',
        } as Record<ComparisonOperator, ComparisonOperator>)[relation.operator];
        const value = -constant / coefficient;
        if (Number.isFinite(value)) thresholds.push({ value, operator: enteringOperator });
      }
    }
  }
  if (node.left) collectTimeThresholds(node.left, context, thresholds);
  if (node.right) collectTimeThresholds(node.right, context, thresholds);
  if (node.arguments) {
    for (const argument of node.arguments) collectTimeThresholds(argument, context, thresholds);
  }
}

function isAnalyticTimeRoot(root: ComparisonRoot, context: Record<string, number>): boolean {
  // A comparison whose two sides are affine in time (parameters and assigned
  // variables are constants between events) can be scheduled exactly by
  // nextWakeTime(). Keeping it out of CVODE's root vector avoids one solver
  // restart per tiny periodic event, while state-dependent roots still use the
  // numerical root callback.
  if (root.operator === '!=') return false;
  const left = affineTimeExpression(root.left, context);
  const right = affineTimeExpression(root.right, context);
  return left !== undefined && right !== undefined && left.coefficient !== right.coefficient;
}

/**
 * Executes SBML event semantics for the deterministic and stochastic engines.
 *
 * Roots are extracted from relational trigger AST nodes. The full Boolean trigger is still
 * evaluated before scheduling, so compound triggers do not fire merely because one operand crossed
 * zero. Delayed events are held as a priority queue and assignment right-hand sides are evaluated
 * from one immutable trigger snapshot when useValuesFromTriggerTime is true.
 */
export class SBMLEventRuntime {
  private readonly records: EventRecord[];
  private readonly roots: ComparisonRoot[];
  private readonly options: SBMLEventRuntimeOptions;
  private initialized = false;
  private lastRootTime = Number.NaN;
  private readonly rootSigns = new Map<number, number>();
  private evaluationState: Float64Array = new Float64Array(0);
  private evaluationTime = 0;
  private initializationTime = Number.NaN;
  private readonly firedEventIds: string[] = [];
  private readonly lastTieEventByKey = new Map<string, number>();
  private readonly history: HistorySample[] = [];
  private initialZeroRootCount = 0;
  private buildingHistoricalContext = false;

  constructor(options: SBMLEventRuntimeOptions) {
    this.options = options;
    let nextRootId = 0;
    this.records = options.events.map((event, eventIndex) => {
      const expression = (event.bnglTrigger || event.trigger || '').trim();
      const ast = expression ? parseExpression(expression) : null;
      const eventRoots: ComparisonRoot[] = [];
      if (ast) collectComparisonRoots(ast, eventIndex, eventRoots, { value: nextRootId });
      nextRootId += eventRoots.length;
      return { event, expression, ast, roots: eventRoots, armed: false, pending: [] };
    });
    this.roots = this.records.flatMap(record => record.roots);
  }

  get rootCount(): number {
    return this.roots.length;
  }

  get firedEvents(): string[] {
    return [...this.firedEventIds];
  }

  get hasInitialZeroRoot(): boolean {
    return this.initialZeroRootCount > 0;
  }

  get diagnostics(): string[] {
    const diagnostics: string[] = [];
    for (const record of this.records) {
      if (!record.expression) diagnostics.push(`event ${record.event.id || record.event.name || '<unnamed>'}: empty trigger`);
      else if (!record.ast) diagnostics.push(`event ${record.event.id || record.event.name || '<unnamed>'}: trigger expression could not be parsed`);
      for (const assignment of record.event.assignments) {
        if (!this.options.resolveAssignment(assignment)) {
          diagnostics.push(`event ${record.event.id || record.event.name || '<unnamed>'}: assignment target ${assignment.variable} is not executable`);
        }
      }
    }
    return diagnostics;
  }

  /** Expand SBML delay() calls against the runtime history for assignment/rate rules. */
  expandDelayExpression(expression: string, context: Record<string, number>, state: Float64Array): string {
    const parsed = parseExpression(expression);
    return parsed ? this.expandDelayCalls(parsed, context, state) : expression;
  }

  rootFunction = (time: number, state: Float64Array, values: Float64Array): void => {
    this.evaluationState = state;
    this.evaluationTime = time;
    const context = this.options.buildContext(state, time);
    this.recordHistory(time, state, context);
    for (let i = 0; i < this.roots.length; i++) {
      const root = this.roots[i];
      const value = this.evaluateNumericPair(root.left, root.right, context);
      const atInitializationTime = Number.isFinite(this.initializationTime)
        && Math.abs(time - this.initializationTime) <= 1e-12 * Math.max(1, Math.abs(time));
      if (atInitializationTime && Math.abs(value) <= 1e-12) {
        // A comparison that starts exactly at its threshold is a valid SBML
        // state, but returning an exact zero makes CVODE/RK45 report the same
        // initial root forever. Return the side implied by the strictness of
        // the relation so the first integration step can leave t=0.
        const activeSign = root.operator === '<' || root.operator === '<=' ? -1 : 1;
        const isActiveAtEquality = root.operator === '<=' || root.operator === '>=';
        // Keep this comfortably outside CVODE's root roundoff band. It only
        // changes the synthetic root function at the exact initial instant;
        // the state and SBML trigger value remain untouched.
        values[i] = (isActiveAtEquality ? activeSign : -activeSign) * 1e-7;
        continue;
      }
      const record = this.records[root.eventIndex];
      if (isAnalyticTimeRoot(root, context)) {
        values[i] = 1;
        continue;
      }
      const triggerStillActive = !record.armed
        && this.evaluateTrigger(record, context, undefined, 1e-10);
      if (triggerStillActive && Math.abs(value) <= 1e-12) {
        // Keep a fired/pending persistent trigger on its active side while a
        // restarted solver is initialized exactly on the event surface. This
        // avoids a CVODE zero-root loop when the post-event derivative leaves
        // the state on the surface; a later genuine crossing still changes the
        // raw value away from this synthetic offset.
        const activeSign = root.operator === '<' || root.operator === '<=' ? -1 : 1;
        values[i] = this.rootSigns.get(root.id) || activeSign * 1e-7;
        continue;
      }
        const suppressAtSameTime = Number.isFinite(this.lastRootTime)
        && Math.abs(time - this.lastRootTime) <= 1e-12 * Math.max(1, Math.abs(time));
      if (suppressAtSameTime && Math.abs(value) <= 1e-12) {
        values[i] = this.rootSigns.get(root.id) || 1e-10;
      } else {
        values[i] = value;
      }
    }
  };

  initialize(time: number, state: Float64Array): SBMLEventProcessResult {
    this.evaluationState = state;
    this.evaluationTime = time;
    this.initializationTime = time;
    this.initialized = true;
    const result = this.emptyResult();
    this.initialZeroRootCount = 0;
    for (const record of this.records) {
      const context = this.options.buildContext(state, time);
      this.recordHistory(time, state, context);
      const actual = this.evaluateTrigger(record, context);
      for (const root of record.roots) {
        if (Math.abs(this.evaluateNumericPair(root.left, root.right, context)) <= 1e-12) {
          this.initialZeroRootCount++;
        }
      }
      const initialValue = record.event.triggerInitialValue ?? true;
      if (actual) {
        // SBML initialValue=false means a true trigger at t0 is an event
        // transition and must be scheduled exactly once. Keep the record
        // disarmed until the trigger becomes false again.
        record.armed = false;
        if (!initialValue) this.schedule(record, time, context, state, result);
      } else {
        record.armed = true;
      }
    }
    this.appendDiagnostics(result);
    return result;
  }

  nextWakeTime(now: number, end: number, state: Float64Array): number | undefined {
    let next = Number.POSITIVE_INFINITY;
    for (const record of this.records) {
      for (const pending of record.pending) {
        if (pending.dueTime >= now - 1e-12 && pending.dueTime <= end + 1e-12) next = Math.min(next, pending.dueTime);
      }
      if (record.armed && record.ast) {
        const context = this.options.buildContext(state, now);
        this.recordHistory(now, state, context);
        const thresholds: TimeThreshold[] = [];
        collectTimeThresholds(record.ast, context, thresholds);
        for (const threshold of thresholds) {
          // A threshold at the current time was already evaluated by process().
          // Returning it again can trap the SSA loop at the same timestamp when
          // a compound time trigger is false on its other branch.
          if (threshold.operator !== '!=' && threshold.value > now + 1e-12 && threshold.value <= end + 1e-12) {
            next = Math.min(next, threshold.value);
          }
        }
      }
    }
    return Number.isFinite(next) ? Math.max(now, next) : undefined;
  }

  process(time: number, state: Float64Array, rootsFound?: number[]): SBMLEventProcessResult {
    this.evaluationState = state;
    this.evaluationTime = time;
    if (!this.initialized) {
      const initial = this.initialize(time, state);
      const due = this.applyDue(time, state);
      return this.combine(initial, due);
    }
    const result = this.emptyResult();
    const atInitializationTime = Number.isFinite(this.initializationTime)
      && Math.abs(time - this.initializationTime) <= 1e-12 * Math.max(1, Math.abs(time));
    this.recordHistory(time, state, this.options.buildContext(state, time));
    const forced = new Map<number, boolean>();
    if (rootsFound && !atInitializationTime) {
      const rootContext = this.options.buildContext(state, time);
      for (let rootIndex = 0; rootIndex < rootsFound.length; rootIndex++) {
        const direction = rootsFound[rootIndex];
        if (!direction) continue;
        const root = this.roots[rootIndex];
        // A solver root direction belongs to the state that produced the root.
        // Event assignments can change that state before the next process call;
        // never apply the stale direction to a root that is no longer near its
        // comparison surface, or a non-persistent periodic event can fire again
        // at the same timestamp after assigning its reset variable.
        const rawValue = this.evaluateNumericPair(root.left, root.right, rootContext);
        const rootTolerance = 1e-7 * Math.max(1, Math.abs(this.evaluateNumeric(root.left, rootContext)), Math.abs(this.evaluateNumeric(root.right, rootContext)));
        if (!Number.isFinite(rawValue) || Math.abs(rawValue) > rootTolerance) continue;
        const entering = root.operator === '>=' || root.operator === '>' ? direction > 0
          : root.operator === '<=' || root.operator === '<' ? direction < 0
            : true;
        forced.set(root.id, entering);
        // Restarting CVODE at a root with the opposite sign causes an
        // immediate second root. Restart on the side of the inequality that
        // is active after the transition instead.
        const activeSign = root.operator === '<' || root.operator === '<=' ? -1e-10
          : root.operator === '>' || root.operator === '>=' ? 1e-10
            : 1e-10;
        this.rootSigns.set(root.id, entering ? activeSign : -activeSign);
        this.lastRootTime = time;
      }
    }
    for (const record of this.records) {
      const context = this.options.buildContext(state, time);
      // Do not turn an exact threshold at t=0 into a false-to-true transition merely because the
      // root callback uses a small numerical tolerance. SBML initialValue semantics were already
      // handled by initialize(); the first solver callback must observe the exact initial trigger.
      const forcedActual = this.evaluateTrigger(record, context, atInitializationTime ? undefined : forced, atInitializationTime ? 0 : 1e-10);
      // At a root the numerical state is exactly on the comparison surface. A
      // solver direction can say "leaving" even though the SBML trigger is
      // still true at the surface (for example S1 == 0.5 with S1 < 0.5 and a
      // post-event derivative of zero). Preserve the evaluated Boolean truth
      // in that case; otherwise the root-direction override re-arms a
      // persistent event and it fires once per solver restart.
      const actual = !atInitializationTime
        && forcedActual === false
        && this.evaluateTrigger(record, context, undefined, 1e-10)
        ? true
        : forcedActual;
      if (actual) {
        if (record.armed) {
          record.armed = false;
          this.schedule(record, time, context, state, result);
        }
      } else {
        record.armed = true;
        if (record.event.triggerPersistent === false) {
          // A non-persistent event is canceled if its trigger is false before
          // execution, including a due occurrence that another event changed
          // at this same timestamp.
          record.pending = record.pending.filter(pending => pending.dueTime > time + 1e-12);
        }
      }
    }
    const due = this.applyDue(time, state);
    const combined = this.combine(result, due);
    this.appendDiagnostics(combined);
    return combined;
  }

  private applyDue(time: number, state: Float64Array): SBMLEventProcessResult {
    const result = this.emptyResult();
    // Drain due events incrementally. SBML permits an event assignment to
    // change another trigger at the same timestamp; that transition can queue
    // another zero-delay event. Re-evaluating only after the whole due batch
    // loses those cascades (notably the priority/non-persistent test family).
    const due: Array<{ record: EventRecord; pending: PendingEvent }> = [];
    const drainDue = (): void => {
      for (const record of this.records) {
        const keep: PendingEvent[] = [];
        for (const pending of record.pending) {
          if (pending.dueTime <= time + 1e-12) due.push({ record, pending });
          else keep.push(pending);
        }
        record.pending = keep;
      }
      due.sort((a, b) => b.pending.priority - a.pending.priority);
    };
    drainDue();
    let zeroTimeEvents = 0;
    while (due.length > 0) {
      // SBML priorities are evaluated when the event is executed, not frozen
      // at trigger time. Recompute them after every assignment so a higher
      // priority can move ahead of the remaining simultaneous events.
      const liveContext = this.options.buildContext(state, time);
      const livePriorities = new Map<PendingEvent, number>();
      const tieKey = (record: EventRecord, priority: number): string =>
        `${record.expression}|${Math.round(priority * 1e12)}`;
      due.sort((left, right) => {
        const priority = (item: typeof left): number => {
          const expression = item.record.event.bnglPriority || item.record.event.priority;
          if (!expression) return item.pending.priority;
          const value = this.evaluateExpression(expression, liveContext, state);
          return Number.isFinite(value) ? value : item.pending.priority;
        };
        const rightPriority = priority(right);
        const leftPriority = priority(left);
        livePriorities.set(right.pending, rightPriority);
        livePriorities.set(left.pending, leftPriority);
        if (Math.abs(rightPriority - leftPriority) > 1e-12) return rightPriority - leftPriority;
        const rightKey = tieKey(right.record, rightPriority);
        const leftKey = tieKey(left.record, leftPriority);
        if (rightKey === leftKey) {
          const last = this.lastTieEventByKey.get(leftKey);
          const leftIndex = this.records.indexOf(left.record);
          const rightIndex = this.records.indexOf(right.record);
          if (last === leftIndex) return 1;
          if (last === rightIndex) return -1;
        }
        return this.records.indexOf(left.record) - this.records.indexOf(right.record);
      });
      const { record, pending } = due.shift()!;
      const executedPriority = livePriorities.get(pending) ?? pending.priority;
      if (record.event.triggerPersistent === false) {
        const context = this.options.buildContext(state, time);
        if (!this.evaluateTrigger(record, context, undefined, 1e-10)) continue;
      }
      const context = pending.snapshot?.context || this.options.buildContext(state, time);
      const assignmentValues: Array<{ target: SBMLEventAssignmentTarget; value: number }> = [];
      for (let i = 0; i < record.event.assignments.length; i++) {
        const assignment = record.event.assignments[i];
        const target = this.options.resolveAssignment(assignment);
        if (!target) {
          result.diagnostics.push(`event ${record.event.id || record.event.name || '<unnamed>'}: assignment target ${assignment.variable} is not executable`);
          continue;
        }
        const expression = assignment.bnglMath || assignment.math;
        // A malformed/empty SBML eventAssignment has no executable RHS. Keep
        // it losslessly in metadata, but treat it as a no-op rather than
        // silently assigning numeric zero.
        if (!expression || expression.trim().length === 0) continue;
        const value = this.evaluateExpression(expression, context, pending.snapshot?.state);
        if (!Number.isFinite(value)) {
          result.diagnostics.push(`event ${record.event.id || record.event.name || '<unnamed>'}: assignment ${assignment.variable} evaluated to ${value}`);
          continue;
        }
        assignmentValues.push({ target, value });
      }
      if (this.options.applyAssignments) {
        this.options.applyAssignments(assignmentValues, state);
      } else {
        for (const assignment of assignmentValues) {
          this.options.applyAssignment(assignment.target, assignment.value, state);
        }
      }
      for (const assignment of assignmentValues) {
        result.changed = true;
        if (assignment.target.kind === 'species' || assignment.target.kind === 'compartment') {
          result.stateChanged = true;
        }
        if (assignment.target.kind === 'parameter' || assignment.target.kind === 'compartment') result.parametersChanged = true;
      }
      result.fired.push(record.event.id || record.event.name || '<unnamed>');
      this.firedEventIds.push(record.event.id || record.event.name || '<unnamed>');
      this.lastTieEventByKey.set(tieKey(record, executedPriority), this.records.indexOf(record));
      zeroTimeEvents++;
      if (zeroTimeEvents > 10000) {
        throw new Error('SBML event runtime exceeded 10000 same-time event firings; possible event cycle');
      }

      // Apply simultaneous assignments for this event first, then expose the
      // new state to every trigger. Newly scheduled events are merged into the
      // same priority queue before the next event is selected.
      for (const candidate of this.records) {
        const contextAfterAssignment = this.options.buildContext(state, time);
        const actual = this.evaluateTrigger(candidate, contextAfterAssignment, undefined, 1e-10);
        if (!actual) {
          candidate.armed = true;
          if (candidate.event.triggerPersistent === false) {
            candidate.pending = candidate.pending.filter(pending => pending.dueTime > time + 1e-12);
            // The event may already have been drained into the local due
            // queue by an earlier same-time assignment. Remove those queued
            // instances too; otherwise a later false-to-true transition would
            // execute both the cancelled and the newly scheduled occurrence.
            for (let dueIndex = due.length - 1; dueIndex >= 0; dueIndex--) {
              if (due[dueIndex].record === candidate) due.splice(dueIndex, 1);
            }
          }
        } else if (candidate.armed) {
          candidate.armed = false;
          this.schedule(candidate, time, contextAfterAssignment, state, result);
        } else {
          candidate.armed = false;
        }
      }
      drainDue();
    }
    if (result.parametersChanged) this.options.onParameterChange?.();
    return result;
  }

  private schedule(record: EventRecord, time: number, context: Record<string, number>, state: Float64Array, result: SBMLEventProcessResult): void {
    const delayExpression = record.event.bnglDelay || record.event.delay;
    const delay = delayExpression ? this.evaluateExpression(delayExpression, context, state) : 0;
    if (!Number.isFinite(delay) || delay < 0) {
      result.diagnostics.push(`event ${record.event.id || record.event.name || '<unnamed>'}: delay is not a finite non-negative number`);
      return;
    }
    const priorityExpression = record.event.bnglPriority || record.event.priority;
    const priority = priorityExpression ? this.evaluateExpression(priorityExpression, context, state) : 0;
    const pending: PendingEvent = {
      eventIndex: this.records.indexOf(record),
      dueTime: time + delay,
      scheduledAt: time,
      priority: Number.isFinite(priority) ? priority : 0,
    };
    if (record.event.useValuesFromTriggerTime) {
      pending.snapshot = { context: { ...context }, state: new Float64Array(state) };
    }
    record.pending.push(pending);
  }

  private evaluateTrigger(record: EventRecord, context: Record<string, number>, forced?: Map<number, boolean>, tolerance = 0): boolean {
    if (!record.ast) return false;
    return this.evaluateBoolean(record.ast, context, record, forced, tolerance);
  }

  private evaluateBoolean(node: ExpressionNode, context: Record<string, number>, record: EventRecord, forced?: Map<number, boolean>, tolerance = 0): boolean {
    const root = record.roots.find(candidate => candidate.node === node);
    if (root && forced?.has(root.id)) return forced.get(root.id)!;
    if (isComparisonNode(node) && node.left && node.right) {
      if (isComparisonNode(node.left)) {
        const chain = comparisonChain(node);
        if (!chain) return false;
        for (let i = 0; i < chain.operators.length; i++) {
          if (!compare(
            this.evaluateNumeric(chain.operands[i], context),
            this.evaluateNumeric(chain.operands[i + 1], context),
            chain.operators[i],
            tolerance,
          )) return false;
        }
        return true;
      }
      return compare(this.evaluateNumeric(node.left, context), this.evaluateNumeric(node.right, context), node.operator as ComparisonOperator, tolerance);
    }
    if (isRelationCall(node) && node.arguments) {
      return compare(this.evaluateNumeric(node.arguments[0], context), this.evaluateNumeric(node.arguments[1], context), RELATION_FUNCTIONS[relationName(node)!], tolerance);
    }
    if ((node.type === 'LogicalExpression' || node.type === 'BinaryExpression') && node.left && node.right) {
      if (node.operator === '&&') return this.evaluateBoolean(node.left, context, record, forced, tolerance) && this.evaluateBoolean(node.right, context, record, forced, tolerance);
      if (node.operator === '||') return this.evaluateBoolean(node.left, context, record, forced, tolerance) || this.evaluateBoolean(node.right, context, record, forced, tolerance);
    }
    if (node.type === 'UnaryExpression' && node.operator === '!' && node.argument) return !this.evaluateBoolean(node.argument, context, record, forced, tolerance);
    const name = relationName(node);
    if (name === 'and' && node.arguments) return node.arguments.every(argument => this.evaluateBoolean(argument, context, record, forced, tolerance));
    if (name === 'or' && node.arguments) return node.arguments.some(argument => this.evaluateBoolean(argument, context, record, forced, tolerance));
    if (name === 'not' && node.arguments?.[0]) return !this.evaluateBoolean(node.arguments[0], context, record, forced, tolerance);
    return isTruthy(this.evaluateNumeric(node, context));
  }

  private evaluateNumeric(node: ExpressionNode, context: Record<string, number>): number {
    return this.evaluateExpression(nodeToExpression(node), context);
  }

  private evaluateNumericPair(left: ExpressionNode, right: ExpressionNode, context: Record<string, number>): number {
    return this.evaluateNumeric(left, context) - this.evaluateNumeric(right, context);
  }

  private evaluateExpression(expression: string, context: Record<string, number>, _snapshotState?: Float64Array): number {
    const state = _snapshotState || this.evaluationState;
    const time = Number(context.time ?? context.t ?? this.evaluationTime);
    const normalizedExpression = expression.replace(/\btime\s*\(\s*\)/g, 'time');
    const parsed = parseExpression(normalizedExpression);
    const expandedDelay = parsed ? this.expandDelayCalls(parsed, context, state) : normalizedExpression;
    const expandedRateOf = this.options.evaluateRateOf
      ? expandedDelay.replace(/\brateOf\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g, (_match, symbol: string) => String(this.options.evaluateRateOf!(symbol, state, time)))
      : expandedDelay;
    // Zero-argument BNGL functions are also used by Atomizer for SBML
    // initial assignments. Once the live context contains the same symbol,
    // the event runtime must read that live value rather than re-expanding the
    // stale zero-argument function body on every trigger evaluation.
    const functions = this.options.functions?.filter((fn) =>
      fn.args.length > 0 || !Object.prototype.hasOwnProperty.call(context, fn.name)
    );
    return evaluateFunctionalRate(expandedRateOf, this.options.parameters, context, functions, context, undefined, this.options.strict);
  }

  private expandDelayCalls(node: ExpressionNode, context: Record<string, number>, state: Float64Array): string {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
      const name = node.callee.name?.toLowerCase();
      if (name === 'delay' && (node.arguments?.length ?? 0) >= 2) {
        const lag = this.evaluateNumeric(node.arguments![1], context);
        if (!Number.isFinite(lag) || lag < 0) return 'NaN';
        const currentTime = Number(context.time ?? context.t ?? this.evaluationTime);
        const sample = this.historyAt(currentTime - lag, state, context);
        if (!sample) return 'NaN';
        const delayedValue = this.evaluateNumericWithState(node.arguments![0], sample.context, sample.state);
        return Number.isFinite(delayedValue) ? String(delayedValue) : 'NaN';
      }
      const nameText = node.callee.name || '';
      return `${nameText}(${(node.arguments || []).map(argument => this.expandDelayCalls(argument, context, state)).join(', ')})`;
    }
    if (node.type === 'Literal' || node.type === 'Identifier') return nodeToExpression(node);
    if (node.type === 'UnaryExpression') {
      return `${node.operator || ''}(${node.argument ? this.expandDelayCalls(node.argument, context, state) : '0'})`;
    }
    if ((node.type === 'BinaryExpression' || node.type === 'LogicalExpression') && node.left && node.right) {
      return `(${this.expandDelayCalls(node.left, context, state)} ${node.operator || '+'} ${this.expandDelayCalls(node.right, context, state)})`;
    }
    if (node.type === 'ConditionalExpression') {
      return `(${this.expandDelayCalls(node.test!, context, state)} ? ${this.expandDelayCalls(node.consequent!, context, state)} : ${this.expandDelayCalls(node.alternate!, context, state)})`;
    }
    return nodeToExpression(node);
  }

  private evaluateNumericWithState(node: ExpressionNode, context: Record<string, number>, state: Float64Array): number {
    return this.evaluateExpression(nodeToExpression(node), context, state);
  }

  private recordHistory(time: number, state: Float64Array, context: Record<string, number>): void {
    if (!Number.isFinite(time)) return;
    const snapshot: HistorySample = {
      time,
      state: new Float64Array(state),
      context: { ...context },
    };
    const existing = this.history.findIndex(sample => Math.abs(sample.time - time) <= 1e-12 * Math.max(1, Math.abs(time)));
    if (existing >= 0) {
      this.history[existing] = snapshot;
    } else {
      this.history.push(snapshot);
      this.history.sort((left, right) => left.time - right.time);
    }
    // Keep enough history for the longest delay encountered in normal runs while
    // preventing unbounded growth during long simulations.
    if (this.history.length > 20000) this.history.splice(0, this.history.length - 20000);
  }

  private historyAt(time: number, fallbackState: Float64Array, fallbackContext: Record<string, number>): HistorySample | undefined {
    const historicalContext = (state: Float64Array, baseContext: Record<string, number>): Record<string, number> => {
      // Assignment rules may depend on historical time. Re-evaluate them when
      // possible, but guard recursive delay() calls with the already available
      // context so delay(delay(...)) cannot recurse without a base sample.
      if (this.buildingHistoricalContext) return { ...baseContext, time, t: time };
      this.buildingHistoricalContext = true;
      try {
        return { ...this.options.buildContext(state, time), time, t: time };
      } catch {
        return { ...baseContext, time, t: time };
      } finally {
        this.buildingHistoricalContext = false;
      }
    };
    if (this.history.length === 0) {
      return {
        time,
        state: new Float64Array(fallbackState),
        context: historicalContext(fallbackState, fallbackContext),
      };
    }
    if (time <= this.history[0].time) {
      // SBML delay() is defined for times before the start of the simulation.
      // State variables use their initial state, while time-dependent assignment
      // rules must still be evaluated at the requested historical time (for
      // example delay(time, 1) at t=0 evaluates to -1, not 0).
      const first = this.history[0];
      return {
        time,
        state: new Float64Array(first.state),
        context: historicalContext(first.state, first.context),
      };
    }
    const last = this.history[this.history.length - 1];
    if (time >= last.time) return last;
    let upper = 1;
    while (upper < this.history.length && this.history[upper].time < time) upper++;
    const lowerSample = this.history[upper - 1];
    const upperSample = this.history[upper];
    const span = upperSample.time - lowerSample.time;
    const fraction = span > 0 ? (time - lowerSample.time) / span : 0;
    const state = new Float64Array(lowerSample.state.length);
    for (let i = 0; i < state.length; i++) {
      state[i] = lowerSample.state[i] + fraction * (upperSample.state[i] - lowerSample.state[i]);
    }
    const context: Record<string, number> = { ...lowerSample.context, time, t: time };
    for (const key of Object.keys(upperSample.context)) {
      const left = lowerSample.context[key];
      const right = upperSample.context[key];
      if (Number.isFinite(left) && Number.isFinite(right)) context[key] = left + fraction * (right - left);
    }
    return { time, state, context };
  }

  private emptyResult(): SBMLEventProcessResult {
    return { changed: false, stateChanged: false, parametersChanged: false, fired: [], diagnostics: [] };
  }

  private combine(left: SBMLEventProcessResult, right: SBMLEventProcessResult): SBMLEventProcessResult {
    return {
      changed: left.changed || right.changed,
      stateChanged: left.stateChanged || right.stateChanged,
      parametersChanged: left.parametersChanged || right.parametersChanged,
      fired: [...left.fired, ...right.fired],
      diagnostics: [...left.diagnostics, ...right.diagnostics],
    };
  }

  private appendDiagnostics(result: SBMLEventProcessResult): void {
    for (const diagnostic of this.diagnostics) {
      if (!result.diagnostics.includes(diagnostic)) result.diagnostics.push(diagnostic);
    }
  }
}
