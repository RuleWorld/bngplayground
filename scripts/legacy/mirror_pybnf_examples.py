#!/usr/bin/env python3
"""
Parse the lanl PyBNF gitingest tree file and download all .bngl files
into published-models/PyBNG/ preserving directory structure.
"""
import os
import re
import sys
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LISTING = os.path.join(ROOT, 'lanl-pybnf-8a5edab282632443.txt')
TARGET_BASE = os.path.join(ROOT, 'published-models', 'PyBNG')
RAW_BASE = 'https://raw.githubusercontent.com/lanl/PyBNF/master/'

if not os.path.exists(LISTING):
    print('Listing file not found:', LISTING)
    sys.exit(1)

files = []
stack = []

with open(LISTING, 'r', encoding='utf-8') as fh:
    for line in fh:
        if '.bngl' not in line:
            # still need to track directories
            mdir = re.search(r'[└├][─]*\s*(.+/)$', line)
            if mdir:
                name = mdir.group(1).strip()
                # compute indent level by position of box char
                pos = line.find('└')
                if pos == -1:
                    pos = line.find('├')
                level = pos // 4 if pos >= 0 else 0
                # adjust stack to level
                while len(stack) > level:
                    stack.pop()
                stack.append(name.rstrip('/'))
            continue
        # file line
        pos = line.find('└')
        if pos == -1:
            pos = line.find('├')
        level = pos // 4 if pos >= 0 else 0
        if '──' in line:
            name = line.split('──',1)[1].strip()
        else:
            # fallback: last whitespace-separated token
            name = line.strip().split()[-1]
        # adjust stack to level
        while len(stack) > level:
            stack.pop()
        # build relative path starting from 'examples' directory if present in stack
        rel_parts = []
        for s in stack:
            if s:
                rel_parts.append(s)
        rel_parts.append(name)
        # find index of 'examples' in rel_parts and slice from there
        if 'examples' in rel_parts:
            idx = rel_parts.index('examples')
            rel = os.path.join(*rel_parts[idx+1:])
        else:
            rel = os.path.join(*rel_parts)
        files.append(rel)

print('Found %d .bngl files to fetch' % len(files))

ok = []
failed = []
from urllib.parse import quote
import time

import re

def sanitize_path(p):
    # make filenames safe for Windows by replacing problematic characters
    s = p.replace('\\', '/')
    s = s.strip()
    # remove leading 'examples/' if present
    if s.startswith('examples/'):
        s = s[len('examples/'):]
    # replace commas and slashes for local path
    s = re.sub(r'[,:]', '', s)
    s = s.replace(' ', '_')
    s = s.replace('\u2013', '-')  # en-dash
    s = s.replace('\u2014', '-')  # em-dash
    s = re.sub(r'_+', '_', s)
    return s

for rel in sorted(set(files)):
    rel_path = rel.replace('\\', '/')
    # canonicalize to be relative to examples/
    if rel_path.startswith('examples/'):
        rel_path = rel_path[len('examples/'):]
    src_url = RAW_BASE + quote('examples/' + rel_path, safe='/')
    safe_rel = sanitize_path(rel_path)
    dest = os.path.join(TARGET_BASE, safe_rel)
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
    except Exception as e:
        print('ERROR making directories for', dest, e)
        failed.append((rel, f'dir error {e}'))
        continue
    print('Fetching:', src_url)
    try:
        req = Request(src_url, headers={'User-Agent': 'bionetgen-mirror/1.0'})
        with urlopen(req, timeout=30) as resp:
            data = resp.read()
        with open(dest, 'wb') as out:
            out.write(data)
        ok.append(rel)
    except HTTPError as e:
        print('HTTPError', e.code, src_url)
        failed.append((rel, 'HTTPError %s' % e.code))
    except URLError as e:
        print('URLError', e.reason, src_url)
        failed.append((rel, 'URLError %s' % e.reason))
    except Exception as e:
        print('ERROR', e, src_url)
        failed.append((rel, 'ERROR %s' % e))
    time.sleep(0.05)  # be polite

print('\nSummary:')
print('  fetched:', len(ok))
print('  failed: ', len(failed))
if failed:
    for r, msg in failed:
        print('   -', r, msg)

# persist failed list for triage
failed_file = os.path.join(TARGET_BASE, 'failed_items.txt')
with open(failed_file, 'w', encoding='utf-8') as fh:
    for r, msg in failed:
        fh.write(f"{r}\t{msg}\n")
print('\nWrote failed items to', failed_file)

# attempt automated recovery for failed items
print('\nAttempting automated recovery for failed items...')
import json
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

RECOVERY_LOG = os.path.join(TARGET_BASE, 'recovery_attempts.txt')
branches_to_try = ['master', 'main', 'develop', 'gh-pages']
recovered = []
still_failed = []

def try_raw_branch(rel_path, branch):
    src = f'https://raw.githubusercontent.com/lanl/PyBNF/{branch}/examples/{rel_path}'
    src = quote(src, safe=':/')
    try:
        req = Request(src, headers={'User-Agent': 'bionetgen-mirror/1.0'})
        with urlopen(req, timeout=20) as resp:
            return resp.read()
    except Exception as e:
        return None

# fetch repo tree once per branch to search for moved files
repo_trees = {}
for b in branches_to_try:
    try:
        api_url = f'https://api.github.com/repos/lanl/PyBNF/git/trees/{b}?recursive=1'
        req = Request(api_url, headers={'User-Agent': 'bionetgen-mirror/1.0'})
        with urlopen(req, timeout=20) as resp:
            data = json.load(resp)
        paths = set(item['path'] for item in data.get('tree', []))
        repo_trees[b] = paths
        time.sleep(0.1)
    except Exception:
        repo_trees[b] = set()

with open(RECOVERY_LOG, 'w', encoding='utf-8') as logfh:
    for rel, msg in failed:
        rel_path = rel.replace('\\', '/')
        if rel_path.startswith('examples/'):
            rel_path = rel_path[len('examples/'):]
        dest = os.path.join(TARGET_BASE, sanitize_path(rel_path))
        found = False
        # try raw branch urls
        for b in branches_to_try:
            data = try_raw_branch(rel_path, b)
            if data:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, 'wb') as out:
                    out.write(data)
                logfh.write(f"RECOVERED_RAW_BRANCH\t{rel}\tbranch={b}\n")
                print('Recovered', rel, 'from branch', b)
                recovered.append(rel)
                found = True
                break
        if found:
            continue
        # search repo tree for matching path
        for b, paths in repo_trees.items():
            candidates = [p for p in paths if p.endswith(rel_path)]
            if candidates:
                # pick first candidate
                p = candidates[0]
                raw_src = f'https://raw.githubusercontent.com/lanl/PyBNF/{b}/{p}'
                try:
                    req = Request(raw_src, headers={'User-Agent': 'bionetgen-mirror/1.0'})
                    with urlopen(req, timeout=20) as resp:
                        data = resp.read()
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, 'wb') as out:
                        out.write(data)
                    logfh.write(f"RECOVERED_TREE_SEARCH\t{rel}\tbranch={b}\tpath={p}\n")
                    print('Recovered', rel, 'from tree search', p)
                    recovered.append(rel)
                    found = True
                    break
                except Exception as e:
                    continue
        if found:
            continue
        # try a GitHub code search (filename only)
        filename = os.path.basename(rel_path)
        try:
            search_url = f'https://api.github.com/search/code?q={quote(filename)}+repo:lanl/PyBNF'
            req = Request(search_url, headers={'User-Agent': 'bionetgen-mirror/1.0'})
            with urlopen(req, timeout=20) as resp:
                res = json.load(resp)
            items = res.get('items', [])
            if items:
                # take first result
                item = items[0]
                path = item.get('path')
                repo_branch = item.get('repository', {}).get('default_branch', 'master')
                raw_src = f'https://raw.githubusercontent.com/lanl/PyBNF/{repo_branch}/{path}'
                try:
                    req = Request(raw_src, headers={'User-Agent': 'bionetgen-mirror/1.0'})
                    with urlopen(req, timeout=20) as resp:
                        data = resp.read()
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, 'wb') as out:
                        out.write(data)
                    logfh.write(f"RECOVERED_SEARCH_API\t{rel}\tpath={path}\n")
                    print('Recovered', rel, 'from search api', path)
                    recovered.append(rel)
                    found = True
                except Exception:
                    pass
        except Exception:
            pass
        if not found:
            logfh.write(f"STILL_MISSING\t{rel}\t{msg}\n")
            still_failed.append((rel, msg))
        time.sleep(0.05)

print('\nAutomated recovery done. Recovered %d files, still missing %d files' % (len(recovered), len(still_failed)))
print('Recovery log at', RECOVERY_LOG)
if still_failed:
    miss_file = os.path.join(TARGET_BASE, 'still_missing_after_recovery.txt')
    with open(miss_file, 'w', encoding='utf-8') as fh:
        for r, m in still_failed:
            fh.write(f"{r}\t{m}\n")
    print('Wrote still-missing list to', miss_file)

# write a small README
readme = os.path.join(TARGET_BASE, 'README.md')
with open(readme, 'w', encoding='utf-8') as fh:
    fh.write('# Mirror of lanl/PyBNF examples (selected .bngl files)\n')
    fh.write('\nThis directory was populated by a scripted mirror of the `examples/`\n')
    fh.write('folder of the lanl/PyBNF repository. Files were fetched from:\n')
    fh.write('\n```\n' + RAW_BASE + 'examples/\n```\n')
    fh.write('\nSee the original project for authorship and licensing information.\n')

print('\nWrote README at', readme)
