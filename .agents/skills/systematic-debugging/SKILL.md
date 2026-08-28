---
name: systematic-debugging
description: Use when a BNG Playground behavior is wrong, a test fails, a transport or worker diverges, or a performance regression needs investigation. Do not use as a substitute for a simple known edit.
---

# Systematic debugging

No fix without root-cause investigation. Reproduce the failure, locate the layer (UI, worker, engine, MCP adapter, RuleHub, or native BNG2/NFsim), compare with a working sibling/reference path, state one hypothesis, run a minimal discriminating test, then make the smallest fix and regression-test it. For performance, profiler evidence is part of the diagnosis; intuition alone is not.

Keep environmental outages and incomplete/hung runs separate from code failures.
