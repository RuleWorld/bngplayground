---
description: Create a git patch of all current changes against the last commit
---

# Create Patch Workflow

This workflow generates a diff of all staged and unstaged changes against the last commit (`HEAD`) and saves it to a file.

## Steps

1. (Optional) Mark new untracked files as intent-to-add so they appear in the diff:

```bash
git add -N .
```

2. Generate the patch (`*.patch` is gitignored):

```bash
git diff HEAD > latest_changes.patch
```

3. Verify the patch creation:

```bash
ls -lh latest_changes.patch
```
