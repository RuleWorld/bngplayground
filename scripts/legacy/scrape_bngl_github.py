#!/usr/bin/env python3
"""
GitHub BNGL File Scraper

Finds ALL .bngl files on GitHub using the Search API with multiple strategies
to work around the 1000 result limit per query.

Usage:
    export GITHUB_TOKEN=your_personal_access_token
    python scrape_bngl_github.py [--download] [--output-dir ./bngl_files]

Get a token at: https://github.com/settings/tokens
(Select 'public_repo' scope for public repos only)
"""

import os
import sys
import json
import time
import csv
import argparse
import hashlib
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from datetime import datetime
from collections import defaultdict

# =============================================================================
# CONFIGURATION
# =============================================================================

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
API_BASE = "https://api.github.com"
RATE_LIMIT_DELAY_AUTH = 2      # seconds between requests (authenticated)
RATE_LIMIT_DELAY_UNAUTH = 6    # seconds between requests (unauthenticated)
MAX_PAGES_PER_QUERY = 10       # GitHub limits to 1000 results = 10 pages of 100

# =============================================================================
# API HELPERS
# =============================================================================

class GitHubAPI:
    def __init__(self, token=None):
        self.token = token
        self.request_count = 0
        self.rate_limit_remaining = None
        self.rate_limit_reset = None
        
    def _make_request(self, url, accept="application/vnd.github.v3+json"):
        """Make an authenticated request to GitHub API."""
        headers = {
            'Accept': accept,
            'User-Agent': 'BNGL-Scraper-Bot'
        }
        
        if self.token:
            headers['Authorization'] = f'token {self.token}'
        
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=30) as response:
                # Track rate limits
                self.rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                self.rate_limit_reset = response.headers.get('X-RateLimit-Reset')
                
                self.request_count += 1
                return json.loads(response.read().decode())
                
        except HTTPError as e:
            if e.code == 403:
                reset_time = int(e.headers.get('X-RateLimit-Reset', 0))
                wait_seconds = max(reset_time - time.time(), 60)
                print(f"\n⚠️  Rate limited! Waiting {wait_seconds:.0f} seconds...")
                time.sleep(wait_seconds + 1)
                return self._make_request(url, accept)
            elif e.code == 422:
                print(f"  ⚠️  Query validation failed (422)")
                return {'items': [], 'total_count': 0}
            else:
                print(f"  ❌ HTTP Error {e.code}: {e.reason}")
                return {'items': [], 'total_count': 0}
        except URLError as e:
            print(f"  ❌ URL Error: {e.reason}")
            return {'items': [], 'total_count': 0}
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return {'items': [], 'total_count': 0}
    
    def search_code(self, query, page=1, per_page=100):
        """Search code on GitHub."""
        url = f"{API_BASE}/search/code?q={quote(query)}&per_page={per_page}&page={page}"
        return self._make_request(url)
    
    def get_file_content(self, repo, path):
        """Get the content of a file."""
        url = f"{API_BASE}/repos/{repo}/contents/{quote(path)}"
        return self._make_request(url)
    
    def get_raw_file(self, repo, path, ref="HEAD"):
        """Get raw file content."""
        url = f"https://raw.githubusercontent.com/{repo}/{ref}/{path}"
        headers = {'User-Agent': 'BNGL-Scraper-Bot'}
        
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=30) as response:
                return response.read().decode('utf-8', errors='replace')
        except Exception as e:
            print(f"  ❌ Failed to download: {e}")
            return None
    
    def get_delay(self):
        """Get appropriate delay between requests."""
        return RATE_LIMIT_DELAY_AUTH if self.token else RATE_LIMIT_DELAY_UNAUTH

# =============================================================================
# SEARCH STRATEGIES
# =============================================================================

def search_by_filename_prefix(api, all_files):
    """Search by first letter of filename to split results."""
    print("\n📁 Strategy 1: Search by filename prefix")
    
    prefixes = (
        list('abcdefghijklmnopqrstuvwxyz') +
        list('ABCDEFGHIJKLMNOPQRSTUVWXYZ') +
        list('0123456789') +
        ['_']
    )
    
    for prefix in prefixes:
        query = f"extension:bngl filename:{prefix}"
        print(f"  Searching '{prefix}'...", end=" ", flush=True)
        
        count = search_with_query(api, query, all_files)
        print(f"found {count} files")
        
        time.sleep(api.get_delay())


def search_by_size_ranges(api, all_files):
    """Search by file size ranges."""
    print("\n📏 Strategy 2: Search by file size")
    
    ranges = [
        ("size:<1000", "< 1KB"),
        ("size:1000..5000", "1-5KB"),
        ("size:5000..10000", "5-10KB"),
        ("size:10000..50000", "10-50KB"),
        ("size:50000..100000", "50-100KB"),
        ("size:>100000", "> 100KB"),
    ]
    
    for size_query, label in ranges:
        query = f"extension:bngl {size_query}"
        print(f"  Searching {label}...", end=" ", flush=True)
        
        count = search_with_query(api, query, all_files)
        print(f"found {count} files")
        
        time.sleep(api.get_delay())


def search_by_keywords(api, all_files):
    """Search by BNGL-specific keywords."""
    print("\n🔑 Strategy 3: Search by BNGL keywords")
    
    keywords = [
        "begin model",
        "begin parameters",
        "begin molecule types", 
        "begin species",
        "begin reaction rules",
        "begin observables",
        "begin functions",
        "begin compartments",
        "generate_network",
        "simulate",
        "writeXML",
        "writeSBML",
        "NFsim",
    ]
    
    for keyword in keywords:
        query = f'extension:bngl "{keyword}"'
        print(f"  Searching '{keyword}'...", end=" ", flush=True)
        
        count = search_with_query(api, query, all_files)
        print(f"found {count} files")
        
        time.sleep(api.get_delay())


def search_known_repos(api, all_files):
    """Search in known repositories with BNGL files."""
    print("\n📦 Strategy 4: Search known repositories")
    
    repos = [
        "RuleWorld/bionetgen",
        "RuleWorld/BNGTutorial",
        "lanl/PyBNF",
        "mcellteam/mcell_tests",
        "mcellteam/mcell",
        "virtualcell/vcell",
        "bnglviz/bnglviz.github.io",
        "marordyan/CaMKII_well_mixed",
        "RuleWorld/RuleBender",
        "ASinanSaglam/WESTPA_BNG",
        "NFSIM/NFsim",
        "ssandrews/Smoldyn",
        "ModelBricks/ModelBricks",
    ]
    
    for repo in repos:
        query = f"extension:bngl repo:{repo}"
        print(f"  Searching {repo}...", end=" ", flush=True)
        
        count = search_with_query(api, query, all_files)
        print(f"found {count} files")
        
        time.sleep(api.get_delay())


def search_by_path_patterns(api, all_files):
    """Search by common path patterns."""
    print("\n📂 Strategy 5: Search by path patterns")
    
    paths = [
        "path:models",
        "path:Models",
        "path:examples",
        "path:test",
        "path:validation",
        "path:published",
    ]
    
    for path_query in paths:
        query = f"extension:bngl {path_query}"
        print(f"  Searching {path_query}...", end=" ", flush=True)
        
        count = search_with_query(api, query, all_files)
        print(f"found {count} files")
        
        time.sleep(api.get_delay())


def search_with_query(api, query, all_files, max_pages=MAX_PAGES_PER_QUERY):
    """Execute a search query with pagination and add results to all_files."""
    new_count = 0
    
    for page in range(1, max_pages + 1):
        result = api.search_code(query, page=page)
        items = result.get('items', [])
        
        if not items:
            break
        
        for item in items:
            repo = item['repository']['full_name']
            path = item['path']
            key = f"{repo}/{path}"
            
            if key not in all_files:
                all_files[key] = {
                    'repo': repo,
                    'path': path,
                    'filename': item['name'],
                    'url': item['html_url'],
                    'sha': item.get('sha', ''),
                    'score': item.get('score', 0),
                    'repo_url': item['repository']['html_url'],
                    'repo_description': item['repository'].get('description', ''),
                    'repo_stars': item['repository'].get('stargazers_count', 0),
                }
                new_count += 1
        
        if len(items) < 100:
            break
            
        time.sleep(api.get_delay())
    
    return new_count

# =============================================================================
# FILE ANALYSIS
# =============================================================================

def compute_file_hash(content):
    """Compute MD5 hash of file content."""
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def analyze_and_dedupe(api, all_files, download=False, output_dir=None):
    """Analyze files for duplicates by content hash."""
    print("\n🔍 Analyzing files for content duplicates...")
    
    content_hashes = defaultdict(list)
    
    if download and output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
    
    total = len(all_files)
    for i, (key, file_info) in enumerate(all_files.items(), 1):
        if i % 50 == 0:
            print(f"  Progress: {i}/{total} files...")
        
        if download:
            content = api.get_raw_file(file_info['repo'], file_info['path'])
            
            if content:
                file_hash = compute_file_hash(content)
                file_info['content_hash'] = file_hash
                content_hashes[file_hash].append(key)
                
                # Save file
                if output_dir:
                    # Create safe filename
                    safe_name = f"{file_info['repo'].replace('/', '_')}_{file_info['filename']}"
                    save_path = output_path / safe_name
                    
                    # Handle duplicates
                    counter = 1
                    while save_path.exists():
                        safe_name = f"{file_info['repo'].replace('/', '_')}_{counter}_{file_info['filename']}"
                        save_path = output_path / safe_name
                        counter += 1
                    
                    with open(save_path, 'w') as f:
                        f.write(content)
                    
                    file_info['local_path'] = str(save_path)
            
            time.sleep(0.5)  # Be nice to GitHub
    
    # Mark duplicates
    duplicate_count = 0
    for file_hash, keys in content_hashes.items():
        if len(keys) > 1:
            duplicate_count += len(keys) - 1
            for dup_key in keys[1:]:
                all_files[dup_key]['is_duplicate'] = True
                all_files[dup_key]['duplicate_of'] = keys[0]
    
    print(f"  Found {duplicate_count} content duplicates")
    return content_hashes

# =============================================================================
# OUTPUT
# =============================================================================

def save_results(all_files, output_prefix="bngl_files"):
    """Save results to multiple formats."""
    
    unique_files = {k: v for k, v in all_files.items() if not v.get('is_duplicate')}
    
    with open(f"{output_prefix}_all.json", 'w') as f:
        json.dump(list(all_files.values()), f, indent=2)
    
    with open(f"{output_prefix}_unique.json", 'w') as f:
        json.dump(list(unique_files.values()), f, indent=2)
    
    with open(f"{output_prefix}_unique.csv", 'w', newline='') as f:
        fieldnames = ['repo', 'path', 'filename', 'url', 'repo_stars', 'repo_description']
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for file_info in sorted(unique_files.values(), key=lambda x: -x.get('repo_stars', 0)):
            writer.writerow(file_info)
    
    repo_summary = defaultdict(lambda: {'count': 0, 'files': [], 'stars': 0})
    for key, file_info in unique_files.items():
        repo = file_info['repo']
        repo_summary[repo]['count'] += 1
        repo_summary[repo]['files'].append(file_info['filename'])
        repo_summary[repo]['stars'] = file_info.get('repo_stars', 0)
        repo_summary[repo]['url'] = file_info['repo_url']
    
    with open(f"{output_prefix}_repos.csv", 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Repository', 'Stars', 'File Count', 'URL'])
        for repo, info in sorted(repo_summary.items(), key=lambda x: -x[1]['stars']):
            writer.writerow([repo, info['stars'], info['count'], info['url']])
    
    with open(f"{output_prefix}_summary.md", 'w') as f:
        f.write(f"# GitHub BNGL Files Summary\n\n")
        f.write(f"Generated: {datetime.now().isoformat()}\n\n")
        f.write(f"## Statistics\n\n")
        f.write(f"- **Total files found:** {len(all_files)}\n")
        f.write(f"- **Unique files:** {len(unique_files)}\n")
        f.write(f"- **Repositories:** {len(repo_summary)}\n\n")
        f.write(f"## Top Repositories by Stars\n\n")
        f.write("| Repository | Stars | Files |\n")
        f.write("|------------|-------|-------|\n")
        for repo, info in sorted(repo_summary.items(), key=lambda x: -x[1]['stars'])[:30]:
            f.write(f"| [{repo}]({info['url']}) | {info['stars']} | {info['count']} |\n")
        
        f.write(f"\n## Top Repositories by File Count\n\n")
        f.write("| Repository | Files | Stars |\n")
        f.write("|------------|-------|-------|\n")
        for repo, info in sorted(repo_summary.items(), key=lambda x: -x[1]['count'])[:30]:
            f.write(f"| [{repo}]({info['url']}) | {info['count']} | {info['stars']} |\n")
    
    print(f"\n💾 Saved results:")
    print(f"   - {output_prefix}_all.json ({len(all_files)} files)")
    print(f"   - {output_prefix}_unique.json ({len(unique_files)} files)")
    print(f"   - {output_prefix}_unique.csv")
    print(f"   - {output_prefix}_repos.csv ({len(repo_summary)} repos)")
    print(f"   - {output_prefix}_summary.md")

# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='Scrape all BNGL files from GitHub')
    parser.add_argument('--download', action='store_true', 
                        help='Download file contents (slower, enables content deduplication)')
    parser.add_argument('--output-dir', type=str, default='./bngl_downloads',
                        help='Directory to save downloaded files')
    parser.add_argument('--output-prefix', type=str, default='bngl_files',
                        help='Prefix for output files')
    args = parser.parse_args()
    
    print("=" * 70)
    print("  GitHub BNGL File Scraper")
    print("=" * 70)
    
    if not GITHUB_TOKEN:
        print("\n⚠️  WARNING: No GITHUB_TOKEN environment variable set!")
        print("   You'll be limited to 10 requests/minute (vs 5000/hour with token)")
        print("   Get a token at: https://github.com/settings/tokens")
        print("   Then run: export GITHUB_TOKEN=your_token_here\n")
        
        response = input("Continue without token? [y/N] ")
        if response.lower() != 'y':
            sys.exit(1)
    else:
        print(f"\n✅ Using GitHub token: {GITHUB_TOKEN[:8]}...")
    
    api = GitHubAPI(GITHUB_TOKEN)
    all_files = {}
    
    # Run all search strategies
    search_by_filename_prefix(api, all_files)
    search_by_size_ranges(api, all_files)
    search_by_keywords(api, all_files)
    search_known_repos(api, all_files)
    search_by_path_patterns(api, all_files)
    
    print(f"\n{'=' * 70}")
    print(f"  Found {len(all_files)} unique files (by path)")
    print(f"  Made {api.request_count} API requests")
    print(f"{'=' * 70}")
    
    # Optionally download and dedupe by content
    if args.download:
        analyze_and_dedupe(api, all_files, download=True, output_dir=args.output_dir)
    
    # Save results
    save_results(all_files, args.output_prefix)
    
    print("\n✅ Done!")

if __name__ == '__main__':
    main()
