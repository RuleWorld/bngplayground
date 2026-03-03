#!/usr/bin/env python3
"""
Recover .bngl files for previously failed items by extracting them from the
local `lanl-pybnf` listing file (`lanl-pybnf-8a5edab282632443.txt`).

Writes recovered files into `published-models/PyBNG/` preserving the
relative `examples/...` structure (sanitized for Windows filenames).
Produces `recovery_from_listing.txt` and `still_missing_after_listing.txt`.
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LISTING = ROOT / 'lanl-pybnf-8a5edab282632443.txt'
TARGET_BASE = ROOT / 'published-models' / 'PyBNG'
FAILED_FILE = TARGET_BASE / 'failed_items.txt'
RECOVERY_LOG = TARGET_BASE / 'recovery_from_listing.txt'
STILL_MISSING = TARGET_BASE / 'still_missing_after_listing.txt'

if not LISTING.exists():
    print('Listing file not found:', LISTING)
    sys.exit(1)
if not FAILED_FILE.exists():
    print('Failed items file not found:', FAILED_FILE)
    sys.exit(1)

# reuse sanitize from mirror script
import re as _re

def sanitize_path(p: str) -> str:
    s = p.replace('\\', '/')
    s = s.strip()
    if s.startswith('examples/'):
        s = s[len('examples/'):]
    s = _re.sub(r'[,:]', '', s)
    s = s.replace(' ', '_')
    s = s.replace('\u2013', '-')
    s = s.replace('\u2014', '-')
    s = _re.sub(r'_+', '_', s)
    # remove leading/trailing underscores or dots
    s = s.strip('_.')
    return s

# Parse listing: collect all FILE: sections
files = {}  # path -> content (str)
with open(LISTING, 'r', encoding='utf-8') as fh:
    current_path = None
    buf = []
    for line in fh:
        if line.startswith('FILE: '):
            if current_path:
                files[current_path] = ''.join(buf)
                buf = []
            current_path = line[len('FILE: '):].strip()
        else:
            if current_path:
                buf.append(line)
    if current_path:
        files[current_path] = ''.join(buf)

print(f'Parsed {len(files)} embedded files from listing')

# Build basename -> list(paths) index for quick lookup
from collections import defaultdict
index = defaultdict(list)
for path in files.keys():
    basename = os.path.basename(path).lower()
    index[basename].append(path)

# read failed list
failed = []
with open(FAILED_FILE, 'r', encoding='utf-8') as fh:
    for line in fh:
        if not line.strip():
            continue
        parts = line.strip().split('\t')
        name = parts[0]
        failed.append(name)

recovered = []
still_missing = []
log_lines = []

for name in failed:
    name_norm = name.strip()
    if not name_norm:
        continue
    # attempt exact basename match
    candidates = index.get(name_norm.lower(), [])
    match_path = None
    if candidates:
        match_path = candidates[0]
    else:
        # try case-insensitive basename contains
        nm_noext = os.path.splitext(name_norm)[0].lower()
        for b, paths in index.items():
            if nm_noext in b:
                match_path = paths[0]
                break
        # try suffix match of full path
        if not match_path:
            for p in files.keys():
                pnorm = p.replace('\\', '/').lower()
                if pnorm.endswith(name_norm.lower()) or pnorm.endswith('/' + name_norm.lower()):
                    match_path = p
                    break
    if match_path:
        content = files[match_path]
        # write to TARGET_BASE / sanitize_path(match_path)
        safe_rel = sanitize_path(match_path)
        dest = TARGET_BASE / safe_rel
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, 'w', encoding='utf-8') as out:
                out.write(content)
            print('Recovered from listing:', name_norm, '->', safe_rel)
            log_lines.append(f'RECOVERED_FROM_LISTING\t{name_norm}\t{match_path}\n')
            recovered.append(name_norm)
        except Exception as e:
            # fallback to writing the file at the TARGET_BASE root (basename only)
            fallback = TARGET_BASE / os.path.basename(safe_rel)
            try:
                with open(fallback, 'w', encoding='utf-8') as out:
                    out.write(content)
                print('Recovered with fallback (basename):', name_norm, '->', fallback.name)
                log_lines.append(f'RECOVERED_FROM_LISTING_FALLBACK\t{name_norm}\t{match_path}\tfallback={fallback.name}\terr={e}\n')
                recovered.append(name_norm)
            except Exception as e2:
                print('Failed to write file for', name_norm, 'error:', e2)
                log_lines.append(f'FAILED_WRITE\t{name_norm}\t{match_path}\terr={e2}\n')
                still_missing.append(name_norm)
    else:
        print('Not found in listing:', name_norm)
        log_lines.append(f'MISSING_IN_LISTING\t{name_norm}\n')
        still_missing.append(name_norm)

# write logs
with open(RECOVERY_LOG, 'w', encoding='utf-8') as fh:
    fh.writelines(log_lines)

with open(STILL_MISSING, 'w', encoding='utf-8') as fh:
    for nm in still_missing:
        fh.write(nm + '\n')

print('\nDone. Recovered %d files, still missing %d files' % (len(recovered), len(still_missing)))
print('See', RECOVERY_LOG, 'and', STILL_MISSING)
