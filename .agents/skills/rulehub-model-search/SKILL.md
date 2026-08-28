---
name: rulehub-model-search
description: Use when finding existing BioNetGen/BNGL model precedent, a published or tutorial model, or an unfamiliar BNGL mechanism. RuleHub is the canonical model source. Do not use for trivial edits to a model already supplied by the user.
---

# RuleHub model search

Use `search_models` for RuleWorld/RuleHub discovery. Search when precedent reduces invention risk or the user asks for an existing model. Read the exact `rulehub://model/{id}` resource before adapting a result; names and descriptions are not evidence of implementation details.

Preserve the model ID, exact RuleHub path, citation, compatibility metadata, and configured ref/revision whenever a returned model materially informs an answer. Apply hard filters first: origin, tags, simulation method, required features, BNG2/NFsim compatibility, and exclusion status. `visible` or `playground.visible` is a display flag, not a quality claim.

Do not copy a whole model unless requested. Reuse the relevant modeling pattern, then validate the resulting BNGL directly. If the user supplies a complete model and asks only for a local edit or simulation, this skill is unnecessary.
