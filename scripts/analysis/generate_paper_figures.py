"""
generate_paper_figures.py

Generates publication-quality figures for the BioNetGen Playground paper:
  - Figure 7: Validation scatter (playground vs BNG2.pl observable values)
  - Figure 8: Benchmark timing bars

Usage:
  python scripts/analysis/generate_paper_figures.py

Prerequisites:
  pip install matplotlib numpy

PLOS ONE requirements:
  - 300 DPI minimum
  - TIFF or EPS preferred
  - Minimum font size 8pt
  - Single-column width = 5.2 inches, double-column = 7.5 inches
  - Okabe-Ito colorblind-accessible palette
"""

import json
import os
import sys
import numpy as np

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
except ImportError:
    print("Error: matplotlib is required. Install with: pip install matplotlib")
    sys.exit(1)

# Okabe-Ito colorblind-accessible palette
COLORS = {
    'blue': '#0173B2',
    'orange': '#DE8F05',
    'green': '#029E73',
    'red': '#D55E00',
    'purple': '#CC78BC',
    'brown': '#CA9161',
    'pink': '#FBAFE4',
    'gray': '#949494',
    'yellow': '#ECE133',
    'cyan': '#56B4E9',
}

PAPER_DIR = os.path.join('artifacts', 'paper')
MAX_PLOT_POINTS = 50000

# ── Figure 7: Validation Scatter ────────────────────────────────────────────

def generate_fig7():
    """Generate validation scatter plot from real parity data (all time points)."""
    scatter_path = os.path.join(PAPER_DIR, 'fig7_validation_scatter.json')
    if not os.path.exists(scatter_path):
        print(f"Skipping Figure 7: {scatter_path} not found")
        print("  Run: npx tsx scripts/analysis/generate_scatter_data.ts")
        return

    with open(scatter_path) as f:
        data = json.load(f)

    points = data.get('points', [])
    if not points:
        print("  No scatter data points found. Run generate_scatter_data.ts first.")
        return

    xs = np.array([p['x'] for p in points], dtype=float)
    ys = np.array([p['y'] for p in points], dtype=float)

    # Filter out zeros and non-finite
    mask = np.isfinite(xs) & np.isfinite(ys) & ((xs != 0) | (ys != 0))
    xs = xs[mask]
    ys = ys[mask]
    print(f"  {len(xs)} finite non-zero points from {data.get('nModels', '?')} models")

    if len(xs) == 0:
        print("  No plottable data. Skipping.")
        return

    # Downsample if huge (>50k) for rendering speed, using random subsample
    if len(xs) > MAX_PLOT_POINTS:
        rng = np.random.default_rng(42)
        idx = rng.choice(len(xs), size=MAX_PLOT_POINTS, replace=False)
        xs_plot = xs[idx]
        ys_plot = ys[idx]
        print(f"  Downsampled to {MAX_PLOT_POINTS:,} points for rendering")
    else:
        xs_plot = xs
        ys_plot = ys

    fig, ax = plt.subplots(figsize=(5.0, 5.0))

    # Determine if log scale is appropriate
    pos_x = xs_plot[xs_plot > 0]
    use_log = len(pos_x) > len(xs_plot) * 0.5 and pos_x.max() / pos_x.min() > 100

    if use_log:
        # Filter to positive for log scale
        pos_mask = (xs_plot > 0) & (ys_plot > 0)
        xp = xs_plot[pos_mask]
        yp = ys_plot[pos_mask]

        ax.scatter(xp, yp, s=1.5, alpha=0.15, color=COLORS['blue'],
                   edgecolors='none', rasterized=True, zorder=2)

        lo = min(xp.min(), yp.min()) * 0.5
        hi = max(xp.max(), yp.max()) * 2.0
        ax.set_xscale('log')
        ax.set_yscale('log')
        ax.plot([lo, hi], [lo, hi], 'k-', linewidth=0.8, alpha=0.6, zorder=1)
        ax.set_xlim(lo, hi)
        ax.set_ylim(lo, hi)
    else:
        ax.scatter(xs_plot, ys_plot, s=1.5, alpha=0.15, color=COLORS['blue'],
                   edgecolors='none', rasterized=True, zorder=2)

        lo = min(xs_plot.min(), ys_plot.min())
        hi = max(xs_plot.max(), ys_plot.max())
        margin = (hi - lo) * 0.05
        ax.plot([lo - margin, hi + margin], [lo - margin, hi + margin],
                'k-', linewidth=0.8, alpha=0.6, zorder=1)
        ax.set_xlim(lo - margin, hi + margin)
        ax.set_ylim(lo - margin, hi + margin)

    ax.set_xlabel(data.get('xlabel', 'BNG2.pl observable value'), fontsize=10)
    ax.set_ylabel(data.get('ylabel', 'Playground observable value'), fontsize=10)
    ax.tick_params(labelsize=8)
    ax.set_aspect('equal')

    # Annotation with real stats
    n_models = data.get('nModels', '?')
    n_total = len(xs)
    # Compute R^2
    ss_res = np.sum((ys - xs) ** 2)
    ss_tot = np.sum((ys - np.mean(ys)) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 1.0
    n_obs = data.get('nObservables', n_total)
    ax.text(0.05, 0.95,
            f'{n_models} models, {n_obs} observables\n$R^2$ = {r2:.10f}',
            transform=ax.transAxes, fontsize=8, va='top',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.8))

    fig.tight_layout()

    for fmt, dpi in [('pdf', 300), ('tiff', 300), ('png', 150)]:
        out_path = os.path.join(PAPER_DIR, f'fig7_validation_scatter.{fmt}')
        fig.savefig(out_path, dpi=dpi, bbox_inches='tight')
        print(f"  Wrote {out_path}")

    plt.close(fig)


# ── Figure 8: Benchmark Timing Bars ────────────────────────────────────────

def generate_fig8():
    """Generate benchmark timing comparison bar chart."""
    timing_path = os.path.join(PAPER_DIR, 'fig8_benchmark_timings.json')
    if not os.path.exists(timing_path):
        print(f"Skipping Figure 8: {timing_path} not found")
        return

    with open(timing_path) as f:
        data = json.load(f)

    models_data = data.get('models', [])
    # Filter to models with timing data
    models_with_timing = [m for m in models_data
                          if m.get('playgroundMs', {}).get('total') is not None]

    if not models_with_timing:
        print("  No timing data available. Run parity suite with --timing flag first.")
        # Generate placeholder with model names
        models_with_timing = models_data[:15]
        for m in models_with_timing:
            if m.get('playgroundMs', {}).get('total') is None:
                m['playgroundMs'] = {'total': None}

    models = [m['name'] for m in models_with_timing]
    playground_times = [m.get('playgroundMs', {}).get('total', 0) or 0 for m in models_with_timing]
    bng2_times = [m.get('bng2Ms', {}).get('total', 0) or 0 for m in models_with_timing]

    if not any(t > 0 for t in playground_times + bng2_times):
        print("  No non-zero timing data. Skipping Figure 8.")
        return

    fig, ax = plt.subplots(figsize=(7.5, 4))

    x = np.arange(len(models))
    width = 0.35

    ax.bar(x - width / 2, playground_times, width,
           label='Playground', color=COLORS['blue'], edgecolor='white', linewidth=0.3)
    if any(t > 0 for t in bng2_times):
        ax.bar(x + width / 2, bng2_times, width,
               label='BNG2.pl', color=COLORS['orange'], edgecolor='white', linewidth=0.3)

    ax.set_xticks(x)
    ax.set_xticklabels(models, rotation=45, ha='right', fontsize=8)
    ax.set_ylabel('Wall-clock time (ms)', fontsize=10)
    ax.tick_params(axis='y', labelsize=8)
    ax.legend(fontsize=9, loc='upper left')

    # Use log scale if range spans > 2 orders of magnitude
    all_times = [t for t in playground_times + bng2_times if t > 0]
    if all_times and max(all_times) / min(all_times) > 100:
        ax.set_yscale('log')

    # Add species count annotations above bars
    for i, m in enumerate(models_with_timing):
        sc = m.get('speciesCount')
        if sc is not None:
            y_pos = max(playground_times[i], bng2_times[i] if i < len(bng2_times) else 0)
            if y_pos > 0:
                ax.text(i, y_pos * 1.1, f'n={sc}', ha='center', va='bottom', fontsize=6,
                        color=COLORS['gray'])

    fig.tight_layout()

    for fmt, dpi in [('pdf', 300), ('tiff', 300), ('png', 150)]:
        out_path = os.path.join(PAPER_DIR, f'fig8_benchmarks.{fmt}')
        fig.savefig(out_path, dpi=dpi, bbox_inches='tight')
        print(f"  Wrote {out_path}")

    plt.close(fig)


# ── Supplementary: Root Cause Breakdown Pie Chart ───────────────────────────

def generate_root_cause_chart():
    """Generate root cause classification pie/bar chart."""
    summary_path = os.path.join(PAPER_DIR, 'parity_summary.json')
    if not os.path.exists(summary_path):
        print("Skipping root cause chart: parity_summary.json not found")
        return

    with open(summary_path) as f:
        summary = json.load(f)

    rc = summary.get('rootCauseCounts', {})
    if not rc:
        return

    labels = list(rc.keys())
    values = list(rc.values())
    color_map = {
        'pass': COLORS['green'],
        'threshold_only': COLORS['cyan'],
        'unknown': COLORS['gray'],
        'parameter_mismatch': COLORS['orange'],
        'species_mismatch': COLORS['red'],
        'reaction_count_mismatch': COLORS['purple'],
        'rate_constant_mismatch': COLORS['brown'],
        'trajectory_accuracy_mismatch': COLORS['pink'],
        'solver_or_steadystate': COLORS['yellow'],
    }
    colors = [color_map.get(l, COLORS['gray']) for l in labels]

    fig, ax = plt.subplots(figsize=(5.2, 3.5))
    bars = ax.barh(range(len(labels)), values, color=colors, edgecolor='white', linewidth=0.5)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels([l.replace('_', ' ') for l in labels], fontsize=8)
    ax.set_xlabel('Number of models', fontsize=10)
    ax.tick_params(axis='x', labelsize=8)
    ax.invert_yaxis()

    # Add count labels
    for _i, (bar, val) in enumerate(zip(bars, values)):
        ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                str(val), va='center', fontsize=8, color=COLORS['gray'])

    fig.tight_layout()

    for fmt, dpi in [('pdf', 300), ('tiff', 300), ('png', 150)]:
        out_path = os.path.join(PAPER_DIR, f'root_cause_breakdown.{fmt}')
        fig.savefig(out_path, dpi=dpi, bbox_inches='tight')
        print(f"  Wrote {out_path}")

    plt.close(fig)


# ── Main ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(PAPER_DIR, exist_ok=True)

    print("Generating Figure 7: Validation Scatter...")
    generate_fig7()

    print("Generating Figure 8: Benchmark Timings...")
    generate_fig8()

    print("Generating Root Cause Breakdown Chart...")
    generate_root_cause_chart()

    print("\nDone. All figures written to artifacts/paper/")
