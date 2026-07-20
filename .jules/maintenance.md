# Maintenance Pass Report

## 1. Handlers Check
We checked all 44 handler files in `packages/mcp-server/src/handlers/`. All 44 files are imported, registered, and wired inside the MCP server implementation (`packages/mcp-server/src/index.ts`). There are no truly-orphaned handlers that are imported but completely unused in `index.ts`.

### Known Unwired Handlers
Per instructions, the following 11 known unwired handlers are kept intact and not deleted:
- `analyzeResiduals`
- `assessModelMaturity`
- `checkHysteresis`
- `checkPhaseHandoff`
- `computeFim`
- `diagnose`
- `exportOmex`
- `exportSbml`
- `exportSedml`
- `suggestAnnotations`
- `suggestFix`

## 2. Redundancy & Duplication Clean-up
- Cleaned up unused variables and catch variables (`catch (e)` to `catch`) in:
  - `packages/mcp-server/src/handlers/firstPassageTime.ts`
  - `packages/mcp-server/src/handlers/optimalExperiment.ts`
  - `packages/mcp-server/src/services/intelligence/diagnose.ts`
  - `packages/mcp-server/src/services/intelligence/explain.ts`
- Removed the `no-useless-assignment` ESLint error in `diagnose.ts` by scoping the declaration of `parameterEntries` directly inside the block where it's populated and conditionally setting `surprises` fallbacks.
- Corrected caught error preservation (`preserve-caught-error` lint errors) in:
  - `packages/mcp-server/src/services/indra/indraService.ts`
  - `packages/mcp-server/src/services/pathwayCommons/pathwayCommonsService.ts`

## 3. Browser APIs
- Verified that `packages/engine` has no imports or uses of browser/DOM/React specific APIs, preserving a clean separation of the engine workspace.
