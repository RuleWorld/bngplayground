// Narrow browser-safe bridge for website components reused by the MCP App.
// Keep this list explicit so the App does not bundle the full simulation engine.
export { getExpressionDependencies } from '../../../engine/src/parser/ExpressionDependencies';
export { BNGLParser } from '../../../engine/src/services/graph/core/BNGLParser';
export { SpeciesGraph } from '../../../engine/src/services/graph/core/SpeciesGraph';
export { escapeXml } from '../../../engine/src/utils/xmlUtils';
