/**
 * ExpressionBytecodeCompiler.ts - Compile BNGL rate expressions to bytecode
 *
 * Extracted from JITCompiler.ts.  These two pure functions convert textual
 * rate-law expressions into the compact bytecode format consumed by the
 * bytecode interpreter / WASM runtime.
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
        const ast = jsep(expandedExpr);
        const bytes: number[] = [];
        let usesParameters = false;
        const speciesIndexByName = new Map<string, number>();
        speciesNames.forEach((name, index) => speciesIndexByName.set(name, index));

        const walk = (node: any) => {
            if (node.type === 'Literal') {
                bytes.push(OP_PUSH_CONST);
                const buf = new ArrayBuffer(8);
                new Float64Array(buf)[0] = node.value;
                bytes.push(...new Uint8Array(buf));
            } else if (node.type === 'Identifier') {
                // Support common global constants used in BNGL expressions
                if (node.name === 'NaN') {
                    bytes.push(OP_PUSH_CONST);
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = NaN;
                    bytes.push(...new Uint8Array(buf));
                    return;
                }
                if (node.name === 'Infinity') {
                    bytes.push(OP_PUSH_CONST);
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = Infinity;
                    bytes.push(...new Uint8Array(buf));
                    return;
                }

                const speciesIdx = speciesIndexByName.get(node.name);
                if (speciesIdx !== undefined) {
                    bytes.push(OP_PUSH_SPEC);
                    const buf = new ArrayBuffer(4);
                    new Int32Array(buf)[0] = speciesIdx;
                    bytes.push(...new Uint8Array(buf));
                    return;
                }
                const obsIdx = observableNames.indexOf(node.name);
                if (obsIdx >= 0) {
                    bytes.push(OP_PUSH_OBS);
                    const buf = new ArrayBuffer(4);
                    new Int32Array(buf)[0] = obsIdx;
                    bytes.push(...new Uint8Array(buf));
                    return;
                }
                if (Object.prototype.hasOwnProperty.call(parameters, node.name)) {
                    bytes.push(OP_PUSH_CONST);
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = parameters[node.name];
                    bytes.push(...new Uint8Array(buf));
                    usesParameters = true;
                    return;
                }
                throw new Error(`Unknown identifier: ${node.name}`);
            } else if (node.type === 'MemberExpression') {
                if (node.object?.type === 'Identifier' && node.object.name === 'y' && node.property?.type === 'Literal') {
                    bytes.push(OP_PUSH_SPEC);
                    const buf = new ArrayBuffer(4);
                    new Int32Array(buf)[0] = Number(node.property.value);
                    bytes.push(...new Uint8Array(buf));
                    return;
                }
                throw new Error(`Unsupported member expression in ${expandedExpr}`);
            } else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
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
                walk(node.argument);
                if (node.operator === '-') bytes.push(OP_NEG);
                else if (node.operator === '!') bytes.push(OP_NOT);
                else throw new Error(`Unsupported unary operator: ${node.operator}`);
            } else if (node.type === 'CallExpression') {
                const name = node.callee.name.toLowerCase();
                if (name === 'sat') {
                    if ((node.arguments?.length ?? 0) !== 2) {
                        throw new Error('sat() expects 2 arguments');
                    }
                    // sat(a,b) = a / (a + b)
                    walk(node.arguments[0]);
                    walk(node.arguments[0]);
                    walk(node.arguments[1]);
                    bytes.push(OP_ADD);
                    bytes.push(OP_DIV);
                    return;
                }
                node.arguments.forEach((arg: any) => walk(arg));
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
                else if (name === 'max') bytes.push(OP_MAX);
                else if (name === 'min') bytes.push(OP_MIN);
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
        console.warn('[JITCompiler] Bytecode compilation failed:', e);
        return null;
    }
}
