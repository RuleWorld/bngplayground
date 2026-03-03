// services/safeExpressionEvaluator.ts -- re-export shim
// Implementation lives in @bngplayground/engine

import { compile, evaluateConstant, isSafe, getReferencedVariables, SafeExpressionEvaluator } from '../packages/engine/src/utils/safeExpressionEvaluator';

export { compile, evaluateConstant, isSafe, getReferencedVariables, SafeExpressionEvaluator };

