#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'published-models' / 'PyBNG'
FAILED = TARGET / 'failed_items.txt'
FINAL_MISSING = TARGET / 'final_still_missing.txt'

if not FAILED.exists():
    print('No failed_items.txt found')
    exit(1)

# collect present files normalized
present = []
for p in TARGET.rglob('*.bngl'):
    rel = str(p.relative_to(TARGET)).replace('\\','/')
    norm = re.sub(r'[^a-z0-9]', '', rel.lower())
    present.append((rel, norm))

missing = []
for l in FAILED.read_text(encoding='utf-8').splitlines():
    if not l.strip():
        continue
    name = l.split('\t')[0]
    key = name.replace('\\','/').lower()
    key_noext = re.sub(r'[^a-z0-9]', '', Path(key).stem.lower())
    found = False
    for rel, norm in present:
        if key_noext and key_noext in norm:
            found = True
            break
    if not found:
        # special handling: ignore tokens like 'that' or 'generation.'
        if name in ('that', 'generation.'):
            continue
        missing.append(name)

with open(FINAL_MISSING, 'w', encoding='utf-8') as fh:
    for m in missing:
        fh.write(m + '\n')

print('Final still missing:', len(missing))
for m in missing:
    print('-', m)
print('\nWrote', FINAL_MISSING)
