#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TARGET=ROOT/'published-models'/'PyBNG'
FAILED=TARGET/'failed_items.txt'
missing=[]
if FAILED.exists():
    for l in FAILED.read_text(encoding='utf-8').splitlines():
        if not l.strip():
            continue
        name=l.split('\t')[0]
        found=False
        for p in TARGET.rglob('*.bngl'):
            if p.name.lower()==name.lower():
                found=True
                break
        if not found:
            missing.append(name)
print('remaining missing:', len(missing))
for m in missing:
    print('-', m)
