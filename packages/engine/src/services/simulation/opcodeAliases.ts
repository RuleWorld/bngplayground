/**
 * opcodeAliases.ts — short OP_* names for the expression bytecode opcodes.
 *
 * The JIT compiler, bytecode compiler, and evaluator all used the same local
 * aliases over the `OpCode` enum (plus the raw OP_STOP sentinel). Centralised
 * here so the sentinel and the alias set are defined once.
 */
import { OpCode } from './ExpressionCompiler';

export const OP_STOP = 0xFF;
export const OP_PUSH_CONST = OpCode.PUSH_CONST;
export const OP_PUSH_SPEC = OpCode.PUSH_SPEC;
export const OP_PUSH_OBS = OpCode.PUSH_OBS;
export const OP_ADD = OpCode.ADD;
export const OP_SUB = OpCode.SUB;
export const OP_MUL = OpCode.MUL;
export const OP_DIV = OpCode.DIV;
export const OP_POW = OpCode.POW;
export const OP_NEG = OpCode.NEG;
export const OP_EXP = OpCode.EXP;
export const OP_LOG = OpCode.LOG;
export const OP_LOG10 = OpCode.LOG10;
export const OP_SQRT = OpCode.SQRT;
export const OP_ABS = OpCode.ABS;
export const OP_SIN = OpCode.SIN;
export const OP_COS = OpCode.COS;
export const OP_CEIL = OpCode.CEIL;
export const OP_FLOOR = OpCode.FLOOR;
export const OP_ROUND = OpCode.ROUND;
export const OP_TAN = OpCode.TAN;
export const OP_ASIN = OpCode.ASIN;
export const OP_ACOS = OpCode.ACOS;
export const OP_ATAN = OpCode.ATAN;
export const OP_MAX = OpCode.MAX;
export const OP_MIN = OpCode.MIN;
export const OP_IF_ELSE = OpCode.IF_ELSE;
export const OP_LT = OpCode.LT;
export const OP_GT = OpCode.GT;
export const OP_LE = OpCode.LE;
export const OP_GE = OpCode.GE;
export const OP_EQ = OpCode.EQ;
export const OP_NE = OpCode.NE;
export const OP_AND = OpCode.AND;
export const OP_OR = OpCode.OR;
export const OP_NOT = OpCode.NOT;
