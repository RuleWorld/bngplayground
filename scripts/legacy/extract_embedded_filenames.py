#!/usr/bin/env python3
"""
Scan the listing for '# Filename: <name>' markers embedded within FILE sections and
extract the surrounding FILE content into separate files with that filename in the
same examples subdirectory.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
LISTING = ROOT / 'lanl-pybnf-8a5edab282632443.txt'
TARGET_BASE = ROOT / 'published-models' / 'PyBNG'

if not LISTING.exists():
    print('Listing not found')
    exit(1)

# parse FILE sections preserving their content
files = {}  # path -> content
with open(LISTING, 'r', encoding='utf-8') as fh:
    current = None
    buf = []
    for line in fh:
        if line.startswith('FILE: '):
            if current:
                files[current] = ''.join(buf)
                buf = []
            current = line[len('FILE: '):].strip()
        else:
            if current:
                buf.append(line)
    if current:
        files[current] = ''.join(buf)

extracted = []
for path, content in files.items():
    # look for lines like '# Filename: example1.bngl'
    m = re.search(r'^#\s*Filename:\s*(\S+)', content, flags=re.MULTILINE)
    if m:
        fname = m.group(1)
        # determine directory relative to examples/
        rel_dir = path
        if rel_dir.startswith('examples/'):
            rel_dir = rel_dir[len('examples/'):]
        else:
            rel_dir = rel_dir
        # create target path
        # put extracted file in same subdirectory as the FILE; use sanitize minimal
        out_dir = TARGET_BASE / rel_dir
        out_dir = out_dir.parent  # examples/egfr_ode/ -> parent dir
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / fname
        try:
            with open(out_path, 'w', encoding='utf-8') as fh:
                fh.write(content)
            print('Extracted', fname, 'to', out_path)
            extracted.append((fname, str(out_path)))
        except Exception as e:
            # fallback to writing to root of TARGET_BASE
            fallback = TARGET_BASE / fname
            with open(fallback, 'w', encoding='utf-8') as fh:
                fh.write(content)
            print('Extracted (fallback) ', fname, '->', fallback)
            extracted.append((fname, str(fallback)))

print('\nDone. extracted %d embedded filenames.' % len(extracted))
