/**
 * ExpressionBytecodeCompiler.ts - Compile BNGL rate expressions to bytecode
 *
 * The single source of truth for turning a textual rate-law expression into
 * the compact bytecode consumed by the TS bytecode evaluator (see
 * `buildBytecodeEvaluator`) and by the WASM/CVODE bytecode interpreter. Both
 * consumers share this module so the two execution paths cannot drift apart.
 */

import { OpCode } from '../simulation/ExpressionCompiler';
import jsep from 'jsep';
import {
    OP_STOP,
    OP_PUSH_CONST,
    OP_PUSH_SPEC,
    OP_PUSH_OBS,
    OP_ADD,
    OP_SUB,
    OP_MUL,
    OP_DIV,
    OP_POW,
    OP_NEG,
    OP_EXP,
    OP_LOG,
    OP_SQRT,
    OP_ABS,
    OP_SIN,
    OP_COS,
    OP_CEIL,
    OP_FLOOR,
    OP_ROUND,
    OP_TAN,
    OP_ASIN,
    OP_ACOS,
    OP_ATAN,
    OP_MAX,
    OP_MIN,
    OP_IF_ELSE,
    OP_LT,
    OP_GT,
    OP_LE,
    OP_GE,
    OP_EQ,
    OP_NE,
    OP_AND,
    OP_OR,
    OP_NOT,
} from '../simulation/opcodeAliases';

const OP_LOG10 = OpCode.LOG10;

/**
 * Function definition used for zero-arg function expansion.
 */
export interface JITFunctionDefinition {
    name: string;
    args: string[];
    expression: string;
}

/**
 * Minimal structural view of the jsep AST.
 */
interface JsepNode {
    type: string;
    name?: string;
    value?: number | string | boolean | null;
    operator?: string;
    left?: JsepNode;
    right?: JsepNode;
    argument?: JsepNode;
    callee?: JsepNode;
    arguments?: JsepNode[];
    object?: JsepNode;
    property?: JsepNode;
}

/**
 * Expand zero-argument function references in an expression string.
 *
 * BNGL allows defining named zero-argument functions (e.g. `kf()` or bare
 * `kf`) whose body is an arbitrary expression.  This helper iteratively
 * substitutes every occurrence (with or without trailing `()`) with the
 * function body wrapped in parentheses, up to 10 passes to handle nested
 * references.
 */
export function expandZeroArgFunctions(expr: string, functions?: JITFunctionDefinition[]): string {
    if (!functions || functions.length === 0) return expr;

    let expanded = expr;
    for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        for (const func of functions) {
            if ((func.args?.length ?? 0) !== 0) continue;

            const withParens = new RegExp(`\\b${func.name}\\s*\\(\\s*\\)`, 'g');
            if (withParens.test(expanded)) {
                expanded = expanded.replace(withParens, `(${func.expression})`);
                changed = true;
            }

            const bareName = new RegExp(`\\b${func.name}\\b(?!\\s*\\()`, 'g');
            if (bareName.test(expanded)) {
                expanded = expanded.replace(bareName, `(${func.expression})`);
                changed = true;
            }
        }
        if (!changed) break;
    }

    return expanded;
}

/**
 * Number of arguments every compilable BNGL function accepts.
 *
 * `max`/`min` are variadic: `max(a, b, c)` is emitted as `a b c MAX MAX`, so
 * any arity >= 1 is legal and a single argument emits no opcode at all
 * (`max(x)` is just `x`). Every other function has a fixed arity — without
 * this table the compiler happily emitted a single unary opcode for a call
 * with any number of arguments, silently computing the wrong value (or
 * underflowing the stack) for e.g. `max(9, 5, 3)`.
 */
const FUNCTION_ARITY: Record<string, { min: number; max: number }> = {
    abs: { min: 1, max: 1 },
    acos: { min: 1, max: 1 },
    asin: { min: 1, max: 1 },
    atan: { min: 1, max: 1 },
    ceil: { min: 1, max: 1 },
    cos: { min: 1, max: 1 },
    exp: { min: 1, max: 1 },
    floor: { min: 1, max: 1 },
    if: { min: 3, max: 3 },
    ln: { min: 1, max: 1 },
    log: { min: 1, max: 1 },
    log10: { min: 1, max: 1 },
    max: { min: 1, max: Number.POSITIVE_INFINITY },
    min: { min: 1, max: Number.POSITIVE_INFINITY },
    not: { min: 1, max: 1 },
    pow: { min: 2, max: 2 },
    rint: { min: 1, max: 1 },
    round: { min: 1, max: 1 },
    sat: { min: 2, max: 2 },
    sin: { min: 1, max: 1 },
    sqrt: { min: 1, max: 1 },
    tan: { min: 1, max: 1 },
};

/**
 * Compile a textual rate-law expression into a bytecode program.
 *
 * The bytecode is a flat `Uint8Array` that can be evaluated by a stack-based
 * interpreter (see the bytecode evaluator in the simulation layer).
 *
 * @param expr             The raw expression string (e.g. `"k1 * A * B"`)
 * @param parameters       Map of parameter names to their current numeric values
 * @param speciesNames     Ordered list of species names (index = species id)
 * @param observableNames  Ordered list of observable names
 * @param functions        Optional zero-arg function definitions for expansion
 * @returns The compiled bytecode and a flag indicating whether it references
 *          parameters (which means the bytecode constants must be rebuilt when
 *          parameters change), or `null` if compilation fails.
 */
export function compileExpressionToBytecode(
    expr: string,
    parameters: Record<string, number>,
    speciesNames: string[],
    observableNames: string[],
    functions?: JITFunctionDefinition[]
): { bytecode: Uint8Array; usesParameters: boolean } | null {
    try {
        const expandedExpr = expandZeroArgFunctions(expr, functions)
            .replace(/\^/g, '**')
            .replace(/\bMath\./g, '');
        const ast = jsep(expandedExpr) as unknown as JsepNode;
        const bytes: number[] = [];
        let usesParameters = false;
        const speciesIndexByName = new Map<string, number>();
        speciesNames.forEach((name, index) => speciesIndexByName.set(name, index));

        const pushConst = (value: number): void => {
            bytes.push(OP_PUSH_CONST);
            const buf = new ArrayBuffer(8);
            new Float64Array(buf)[0] = value;
            bytes.push(...new Uint8Array(buf));
        };

        const pushSpec = (index: number): void => {
            bytes.push(OP_PUSH_SPEC);
            const buf = new ArrayBuffer(4);
            new Int32Array(buf)[0] = index;
            bytes.push(...new Uint8Array(buf));
        };

        const pushObs = (index: number): void => {
            bytes.push(OP_PUSH_OBS);
            const buf = new ArrayBuffer(4);
            new Int32Array(buf)[0] = index;
            bytes.push(...new Uint8Array(buf));
        };

        const walk = (node: JsepNode) => {
            if (node.type === 'Literal') {
                pushConst(typeof node.value === 'number' ? node.value : Number(node.value));
            } else if (node.type === 'Identifier') {
                if (!node.name) {
                    throw new Error('Identifier missing name');
                }
                // Support common global constants used in BNGL expressions
                if (node.name === 'NaN') {
                    pushConst(NaN);
                    return;
                }
                if (node.name === 'Infinity') {
                    pushConst(Infinity);
                    return;
                }

                const speciesIdx = speciesIndexByName.get(node.name);
                if (speciesIdx !== undefined) {
                    pushSpec(speciesIdx);
                    return;
                }
                const obsIdx = observableNames.indexOf(node.name);
                if (obsIdx >= 0) {
                    pushObs(obsIdx);
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(parameters, node.name)) {
                    pushConst(parameters[node.name]);
                    usesParameters = true;
                    return;
                }
                throw new Error(`Unknown identifier: ${node.name}`);
            } else if (node.type === 'MemberExpression') {
                if (node.object?.type === 'Identifier' && node.object.name === 'y' && node.property?.type === 'Literal') {
                    const index = Number(node.property.value);
                    if (!Number.isInteger(index) || index < 0 || index >= speciesNames.length) {
                        throw new Error(
                            `y[${String(node.property.value)}] is out of range: expected an integer index in [0, ${speciesNames.length})`
                        );
                    }
                    pushSpec(index);
                    return;
                }
                throw new Error(`Unsupported member expression in ${expandedExpr}`);
            } else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
                if (!node.left || !node.right) {
                    throw new Error('Malformed binary expression');
                }
                walk(node.left);
                walk(node.right);
                if (node.operator === '+') bytes.push(OP_ADD);
                else if (node.operator === '-') bytes.push(OP_SUB);
                else if (node.operator === '*') bytes.push(OP_MUL);
                else if (node.operator === '/') bytes.push(OP_DIV);
                else if (node.operator === '^' || node.operator === '**') bytes.push(OP_POW);
                else if (node.operator === '<') bytes.push(OP_LT);
                else if (node.operator === '>') bytes.push(OP_GT);
                else if (node.operator === '<=') bytes.push(OP_LE);
                else if (node.operator === '>=') bytes.push(OP_GE);
                else if (node.operator === '==') bytes.push(OP_EQ);
                else if (node.operator === '!=') bytes.push(OP_NE);
                else if (node.operator === '&&') bytes.push(OP_AND);
                else if (node.operator === '||') bytes.push(OP_OR);
                else throw new Error(`Unsupported binary operator: ${node.operator}`);
            } else if (node.type === 'UnaryExpression') {
                if (!node.argument) {
                    throw new Error('Malformed unary expression');
                }
                walk(node.argument);
                if (node.operator === '-') bytes.push(OP_NEG);
                else if (node.operator === '!') bytes.push(OP_NOT);
                else throw new Error(`Unsupported unary operator: ${node.operator}`);
            } else if (node.type === 'CallExpression') {
                const name = node.callee?.name?.toLowerCase();
                if (!name) {
                    throw new Error('Invalid function call');
                }
                const arity = FUNCTION_ARITY[name];
                if (!arity) {
                    throw new Error(`Unknown function: ${name}`);
                }
                const args = node.arguments ?? [];
                const nArgs = args.length;
                if (nArgs < arity.min || nArgs > arity.max) {
                    const expected = arity.max === Number.POSITIVE_INFINITY
                        ? `at least ${arity.min}`
                        : (arity.min === arity.max ? String(arity.min) : `${arity.min}-${arity.max}`);
                    throw new Error(`${name}() expects ${expected} argument(s), got ${nArgs}`);
                }

                if (name === 'sat') {
                    // sat(a,b) = a / (a + b)
                    walk(args[0]);
                    walk(args[0]);
                    walk(args[1]);
                    bytes.push(OP_ADD);
                    bytes.push(OP_DIV);
                    return;
                }

                args.forEach((arg: JsepNode) => walk(arg));

                if (name === 'max' || name === 'min') {
                    // Variadic fold: n arguments collapse to n - 1 binary ops.
                    // A single argument is already the result, so it emits nothing.
                    const op = name === 'max' ? OP_MAX : OP_MIN;
                    for (let i = 1; i < nArgs; i++) bytes.push(op);
                    return;
                }

                if (name === 'log' || name === 'ln') bytes.push(OP_LOG);
                else if (name === 'exp') bytes.push(OP_EXP);
                else if (name === 'log10') bytes.push(OP_LOG10);
                else if (name === 'sqrt') bytes.push(OP_SQRT);
                else if (name === 'abs') bytes.push(OP_ABS);
                else if (name === 'sin') bytes.push(OP_SIN);
                else if (name === 'cos') bytes.push(OP_COS);
                else if (name === 'ceil') bytes.push(OP_CEIL);
                else if (name === 'floor') bytes.push(OP_FLOOR);
                else if (name === 'rint' || name === 'round') bytes.push(OP_ROUND);
                else if (name === 'tan') bytes.push(OP_TAN);
                else if (name === 'asin') bytes.push(OP_ASIN);
                else if (name === 'acos') bytes.push(OP_ACOS);
                else if (name === 'atan') bytes.push(OP_ATAN);
                else if (name === 'if') bytes.push(OP_IF_ELSE);
                else if (name === 'not') bytes.push(OP_NOT);
                else if (name === 'pow') bytes.push(OP_POW);
                else throw new Error(`Unknown function: ${name}`);
            } else {
                throw new Error(`Unsupported AST node: ${node.type}`);
            }
        };

        walk(ast);
        bytes.push(OP_STOP);
        return { bytecode: new Uint8Array(bytes), usesParameters };
    } catch (e) {
        console.warn('[ExpressionBytecodeCompiler] Bytecode compilation failed:', e);
        return null;
    }
}