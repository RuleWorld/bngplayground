
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

