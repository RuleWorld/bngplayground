---
name: bngplayground-mcp-development
description: Use when adding, changing, registering, documenting, testing, or debugging BNG Playground MCP tools, resources, transports, profiles, or MCP Apps. Enforces engine/MCP separation and protocol 2026-07-28. Do not use for ordinary BNGL model authoring.
---

# BNG Playground MCP development

Scientific algorithms belong in `@bngplayground/engine`; MCP handlers validate, adapt, and serialize. Stable tools represent distinct user intents, use bounded strict schemas, expose useful structured content and output schemas, and keep human-readable content useful when an App is not rendered.

Use one declarative registry for registration, profiles, tests, and inventory. Stable descriptions must say what question they answer and which close neighbor they are not for. Apps are supplemental. RuleHub content comes from the shared RuleHub client/resource, never a copied corpus.

Serve the explicit 2026-07-28 revision through the official v2 factory entrypoints. Keep stdio protocol output on stdout and diagnostics on stderr. Test error codes/diagnostics, resources, structured output, and the five existing App resources. New stable tools must pass the admission checklist in `references/tool-admission.md`.
