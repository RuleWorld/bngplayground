
/**
 * ExpressionCompiler.ts - Compiles BNGL mathematical expressions into stack-based bytecode.
 * 
 * Supports standard operators (+, -, *, /, ^), math functions (exp, log, sin, etc.),
 * species concentrations, and observables.
 */

export enum OpCode {
    PUSH_CONST = 0,
    PUSH_SPEC = 1,
    PUSH_OBS = 2,
    ADD = 3,
    SUB = 4,
    MUL = 5,
    DIV = 6,
    POW = 7,
    NEG = 8,
    EXP = 9,
    LOG = 10,
    LOG10 = 11,
    SQRT = 12,
    ABS = 13,
    SIN = 14,
    COS = 15,
    CEIL = 16,
    FLOOR = 17,
    ROUND = 18,
    TAN = 19,
    ASIN = 20,
    ACOS = 21,
    ATAN = 22,
    MAX = 23,
    MIN = 24,
    IF_ELSE = 25,
    LT = 26,
    GT = 27,
    LE = 28,
    GE = 29,
    EQ = 30,
    NE = 31,
    AND = 32,
    OR = 33,
    NOT = 34
}

export class ExpressionCompiler {
    private speciesMap: Map<string, number>;
    private observableMap: Map<string, number>;
    private parameterMap: Map<string, number>;

    constructor(
        speciesMap: Map<string, number>,
        observableMap: Map<string, number>,
        parameterMap: Map<string, number>
    ) {
        this.speciesMap = speciesMap;
        this.observableMap = observableMap;
        this.parameterMap = parameterMap;
    }

    /**
     * Compile a BNGL expression into bytecode.
     * Returns a Uint8Array containing opcodes and data.
     */
    compile(expr: string): Uint8Array {
        if (!expr || expr.trim() === '') {
            return new Uint8Array(0);
        }

        const tokens = this.tokenize(expr);
        const rpn = this.shuntingYard(tokens);
        return this.serializeRPN(rpn);
    }

    private tokenize(expr: string): string[] {
        // Basic tokenizer for BNGL expressions
        // Handles numbers, names, operators, and parentheses
        const regex = /([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?|[a-zA-Z_][a-zA-Z0-9_]*|\*\*|==|!=|<=|>=|&&|\|\||[-+*/()^<>!&|])/g;
        return expr.match(regex) || [];
    }

    private shuntingYard(tokens: string[]): string[] {
        const outputQueue: string[] = [];
        const operatorStack: string[] = [];

        const precedence: Record<string, number> = {
            'not': 1,
            '^': 5, '**': 5,
            '*': 4, '/': 4,
            '+': 3, '-': 3,
            '<': 2, '>': 2, '<=': 2, '>=': 2, '==': 2, '!=': 2,
            '&&': 1, '||': 1
        };

        const isFunction = (t: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t) && !this.speciesMap.has(t) && !this.observableMap.has(t) && !this.parameterMap.has(t);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (/^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?$/.test(token)) {
                outputQueue.push(token);
            } else if (this.speciesMap.has(token) || this.observableMap.has(token) || this.parameterMap.has(token)) {
                outputQueue.push(token);
            } else if (isFunction(token)) {
                operatorStack.push(token);
            } else if (token === '(') {
                operatorStack.push(token);
            } else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop()!);
                }
                operatorStack.pop(); // pop '('
                if (operatorStack.length > 0 && isFunction(operatorStack[operatorStack.length - 1])) {
                    outputQueue.push(operatorStack.pop()!);
                }
            } else if (precedence[token]) {
                // Handle unary minus
                if (token === '-' && (i === 0 || tokens[i - 1] === '(' || tokens[i - 1] === ',' || precedence[tokens[i - 1]])) {
                    operatorStack.push('unary-');
                    continue;
                }

                while (
                    operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1] !== '(' &&
                    precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
                ) {
                    outputQueue.push(operatorStack.pop()!);
                }
                operatorStack.push(token);
            } else if (token === ',') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop()!);
                }
            }
        }

        while (operatorStack.length > 0) {
            outputQueue.push(operatorStack.pop()!);
        }

        return outputQueue;
    }

    private serializeRPN(rpn: string[]): Uint8Array {
        const buffer: number[] = [];
        const view = new DataView(new ArrayBuffer(8));

        for (const token of rpn) {
            if (/^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?$/.test(token)) {
                buffer.push(OpCode.PUSH_CONST);
                const val = parseFloat(token);
                view.setFloat64(0, val, true);
                for (let i = 0; i < 8; i++) buffer.push(view.getUint8(i));
            } else if (this.speciesMap.has(token)) {
                buffer.push(OpCode.PUSH_SPEC);
                const idx = this.speciesMap.get(token)!;
                view.setInt32(0, idx, true);
                for (let i = 0; i < 4; i++) buffer.push(view.getUint8(i));
            } else if (this.observableMap.has(token)) {
                buffer.push(OpCode.PUSH_OBS);
                const idx = this.observableMap.get(token)!;
                view.setInt32(0, idx, true);
                for (let i = 0; i < 4; i++) buffer.push(view.getUint8(i));
            } else if (this.parameterMap.has(token)) {
                // Parameters are baked in as constants for now
                buffer.push(OpCode.PUSH_CONST);
                const val = this.parameterMap.get(token)!;
                view.setFloat64(0, val, true);
                for (let i = 0; i < 8; i++) buffer.push(view.getUint8(i));
            } else {
                switch (token) {
                    case '+': buffer.push(OpCode.ADD); break;
                    case '-': buffer.push(OpCode.SUB); break;
                    case '*': buffer.push(OpCode.MUL); break;
                    case '/': buffer.push(OpCode.DIV); break;
                    case '^':
                    case '**': buffer.push(OpCode.POW); break;
                    case 'unary-': buffer.push(OpCode.NEG); break;
                    case 'exp': buffer.push(OpCode.EXP); break;
                    case 'ln':
                    case 'log': buffer.push(OpCode.LOG); break;
                    case 'log10': buffer.push(OpCode.LOG10); break;
                    case 'sqrt': buffer.push(OpCode.SQRT); break;
                    case 'abs': buffer.push(OpCode.ABS); break;
                    case 'sin': buffer.push(OpCode.SIN); break;
                    case 'cos': buffer.push(OpCode.COS); break;
                    case 'ceil': buffer.push(OpCode.CEIL); break;
                    case 'floor': buffer.push(OpCode.FLOOR); break;
                    case 'rint': buffer.push(OpCode.ROUND); break;
                    case 'tan': buffer.push(OpCode.TAN); break;
                    case 'asin': buffer.push(OpCode.ASIN); break;
                    case 'acos': buffer.push(OpCode.ACOS); break;
                    case 'atan': buffer.push(OpCode.ATAN); break;
                    case 'max': buffer.push(OpCode.MAX); break;
                    case 'min': buffer.push(OpCode.MIN); break;
                    case 'if': buffer.push(OpCode.IF_ELSE); break;
                    case '<': buffer.push(OpCode.LT); break;
                    case '>': buffer.push(OpCode.GT); break;
                    case '<=': buffer.push(OpCode.LE); break;
                    case '>=': buffer.push(OpCode.GE); break;
                    case '==': buffer.push(OpCode.EQ); break;
                    case '!=': buffer.push(OpCode.NE); break;
                    case '&&': buffer.push(OpCode.AND); break;
                    case '||': buffer.push(OpCode.OR); break;
                    case 'not': buffer.push(OpCode.NOT); break;
                    default:
                        console.warn(`[ExpressionCompiler] Unknown token: ${token}`);
                }
            }
        }

        buffer.push(0xFF); // STOP opcode

        return new Uint8Array(buffer);

        return new Uint8Array(buffer);
    }
}
