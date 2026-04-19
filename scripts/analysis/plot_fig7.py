#!/usr/bin/env python3
"""
scripts/analysis/plot_fig7.py

Render Figure 7 of the BNG Playground paper: parity scatter (left panel,
BNG2.pl vs BNG Playground observable endpoints) + max-relative-error violin
by parity tier (right panel).

Input:
  artifacts/paper/fig7_validation_scatter.json
  (Output of scripts/analysis/generate_paper_parity_data.ts)

Output:
  artifacts/paper/fig7_validation.pdf
  artifacts/paper/fig7_validation.png

Reads the JSON schema:
  {
    "nModels": int,
    "nObservables": int,
    "r2": float,
    "points": [{ "model": str, "observable": str, "bng2": float, "web": float, "maxRelErr": float, "tier": str }, ...],
    "byTier": { tier_name: [points...] }
  }

Styling targets PLOS Comp Bio figure conventions: serif font, 300 dpi,
reasonable default sizes. Adjust figsize to taste.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import numpy as np

# PLOS-compatible styling.
matplotlib.rcParams.update({
    'font.family': 'serif',
    'font.size': 9,
    'axes.labelsize': 9,
    'axes.titlesize': 10,
    'xtick.labelsize': 8,
    'ytick.labelsize': 8,
    'legend.fontsize': 8,
    'pdf.fonttype': 42,   # editable text in Illustrator
    'ps.fonttype': 42,
})


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', '-i', default='artifacts/paper/fig7_validation_scatter.json')
    p.add_argument('--output-prefix', '-o', default='artifacts/paper/fig7_validation')
    p.add_argument('--tier-order', nargs='+',
                   default=['pass', 'fp_drift', 'derivative_bug', 'major'],
                   help='Left-to-right order of tier categories on the violin plot')
    return p.parse_args()


def load_data(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        print(f'error: {path} not found. Run:', file=sys.stderr)
        print('  npx tsx scripts/analysis/generate_paper_parity_data.ts', file=sys.stderr)
        print('first, then re-run this script.', file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f'error: {path} is not valid JSON: {e}', file=sys.stderr)
        sys.exit(1)


def plot_scatter(ax: plt.Axes, data: dict) -> None:
    pts = data.get('points', [])
    if not pts:
        ax.text(0.5, 0.5, 'no points', ha='center', va='center', transform=ax.transAxes)
        return

    bng2 = np.array([p['bng2'] for p in pts])
    web = np.array([p['web'] for p in pts])

    # Color by tier.
    tier_colors = {
        'pass': '#2e7d32',          # green
        'fp_drift': '#f9a825',      # amber
        'derivative_bug': '#d84315', # orange-red
        'major': '#b71c1c',         # dark red
    }
    tiers = [p.get('tier', 'pass') for p in pts]
    colors = [tier_colors.get(t, '#666666') for t in tiers]

    ax.scatter(bng2, web, s=3, alpha=0.5, c=colors, edgecolors='none', rasterized=True)

    # y=x reference line, covering the full data range.
    all_values = np.concatenate([bng2[np.isfinite(bng2)], web[np.isfinite(web)]])
    if len(all_values) > 0:
        all_values = all_values[all_values > 0]
        lim = [max(1e-12, all_values.min()), all_values.max() * 1.5]
        ax.plot(lim, lim, 'k--', lw=0.8, alpha=0.6, label='identity')

    ax.set_xscale('symlog', linthresh=1e-6)
    ax.set_yscale('symlog', linthresh=1e-6)
    ax.set_xlabel('BNG2.pl observable endpoint')
    ax.set_ylabel('BNG Playground observable endpoint')
    r2 = data.get('r2', float('nan'))
    ax.set_title(
        f'{data.get("nObservables", len(pts))} observables from {data.get("nModels", "?")} models\n'
        f'Pearson R² = {r2:.10f}'
    )
    ax.grid(True, which='major', alpha=0.3)
    ax.legend(loc='upper left', framealpha=0.9)


def plot_violin(ax: plt.Axes, data: dict, tier_order: list[str]) -> None:
    by_tier = data.get('byTier', {})
    available = [t for t in tier_order if t in by_tier and by_tier[t]]
    if not available:
        ax.text(0.5, 0.5, 'no tier data', ha='center', va='center', transform=ax.transAxes)
        return

    series = []
    labels = []
    for t in available:
        errs = [max(1e-20, abs(p.get('maxRelErr', 0))) for p in by_tier[t]]
        if errs:
            series.append(np.log10(errs))
            labels.append(f'{t}\n(n={len(errs)})')

    if not series:
        ax.text(0.5, 0.5, 'no data', ha='center', va='center', transform=ax.transAxes)
        return

    parts = ax.violinplot(series, showmedians=True, showextrema=False)

    tier_colors = {
        'pass': '#2e7d32',
        'fp_drift': '#f9a825',
        'derivative_bug': '#d84315',
        'major': '#b71c1c',
    }
    for body, tier in zip(parts['bodies'], available):
        body.set_facecolor(tier_colors.get(tier, '#888'))
        body.set_alpha(0.7)
        body.set_edgecolor('black')

    if 'cmedians' in parts:
        parts['cmedians'].set_color('black')
        parts['cmedians'].set_linewidth(1.2)

    ax.set_xticks(range(1, len(available) + 1))
    ax.set_xticklabels(labels)
    ax.set_ylabel(r'$\log_{10}$(max relative error)')
    ax.set_title('Error distribution by parity tier')
    ax.axhline(-6, color='gray', linestyle=':', alpha=0.5, label='$10^{-6}$ threshold')
    ax.grid(True, axis='y', alpha=0.3)
    ax.legend(loc='lower right')


def main() -> None:
    args = parse_args()
    data = load_data(args.input)

    _, (ax_scatter, ax_violin) = plt.subplots(1, 2, figsize=(10, 4.2))
    plot_scatter(ax_scatter, data)
    plot_violin(ax_violin, data, args.tier_order)

    plt.tight_layout()

    out_dir = os.path.dirname(args.output_prefix)
    if out_dir:
        Path(out_dir).mkdir(parents=True, exist_ok=True)
    pdf_path = f'{args.output_prefix}.pdf'
    png_path = f'{args.output_prefix}.png'
    plt.savefig(pdf_path, dpi=300, bbox_inches='tight')
    plt.savefig(png_path, dpi=300, bbox_inches='tight')

    print(f'wrote {pdf_path}')
    print(f'wrote {png_path}')


if __name__ == '__main__':
    main()
