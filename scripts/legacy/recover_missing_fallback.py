#!/usr/bin/env python3
"""
Attempt additional flexible matches for the small set of files remaining in
`still_missing_after_listing.txt` using fuzzy/sanitized matching heuristics.
"""
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
LISTING = ROOT / 'lanl-pybnf-8a5edab282632443.txt'
TARGET_BASE = ROOT / 'published-models' / 'PyBNG'
STILL = TARGET_BASE / 'still_missing_after_listing.txt'
LOG = TARGET_BASE / 'recovery_fallback.txt'

if not LISTING.exists() or not STILL.exists():
    print('Required files missing')
    exit(1)

# parse files (reuse small parser)
files = {}
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

# helper normalize
def norm(s):
    s = s.replace('\\', '/').strip()
    s = s.lower()
    s = re.sub(r'[\s_\-\.,]+', '', s)
    return s

index = {p: norm(os.path.basename(p)) for p in files.keys()}

with open(STILL, 'r', encoding='utf-8') as fh:
    missing = [l.strip() for l in fh if l.strip()]

recovered = []
not_found = []
logs = []
for m in missing:
    if m in ('that', 'generation.'):
        logs.append(f'IGNORED_TOKEN\t{m}\n')
        not_found.append(m)
        continue
    m_norm = norm(os.path.basename(m))
    # direct match
    candidate = None
    for path, n in index.items():
        if n == m_norm:
            candidate = path
            reason = 'norm_exact'
            break
    if not candidate:
        # substring match
        for path, n in index.items():
            if m_norm in n or n in m_norm:
                candidate = path
                reason = 'norm_substring'
                break
    if candidate:
        content = files[candidate]
        safe_rel = candidate
        safe_rel = safe_rel.replace('examples/', '') if safe_rel.startswith('examples/') else safe_rel
        # sanitize path similar to main script
        safe_rel = re.sub(r'[,:]', '', safe_rel)
        safe_rel = safe_rel.replace(' ', '_')
        safe_rel = re.sub(r'_+', '_', safe_rel)
        dest = TARGET_BASE / safe_rel
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, 'w', encoding='utf-8') as out:
                out.write(content)
            logs.append(f'RECOVERED_FLEX\t{m}\t{candidate}\treason={reason}\n')
            print('Recovered (flex):', m, '->', safe_rel)
            recovered.append(m)
        except Exception as e:
            fallback = TARGET_BASE / os.path.basename(safe_rel)
            try:
                with open(fallback, 'w', encoding='utf-8') as out:
                    out.write(content)
                logs.append(f'RECOVERED_FLEX_FALLBACK\t{m}\t{candidate}\tfallback={fallback.name}\terr={e}\n')
                print('Recovered (flex fallback):', m, '->', fallback.name)
                recovered.append(m)
            except Exception as e2:
                logs.append(f'FAILED_FLEX_WRITE\t{m}\t{candidate}\terr={e2}\n')
                not_found.append(m)
                print('Failed to write (flex) for', m, 'error:', e2)
    else:
        logs.append(f'STILL_MISSING_FLEX\t{m}\n')
        not_found.append(m)

with open(LOG, 'w', encoding='utf-8') as fh:
    fh.writelines(logs)

print('\nFallback pass done. recovered:', len(recovered), 'still missing:', len(not_found))
print('See', LOG)