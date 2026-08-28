# Architecture

`buildServer()` creates a fresh SDK server and registers the selected profile. Transport modules own stdio/HTTP serving. Handlers call engine/shared services and return structured results. Resources are read-only adapters. Keep browser-only code out of engine and server-only code out of the shared RuleHub package.
