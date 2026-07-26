#!/usr/bin/env python3
"""
Simulation parity check: BNG2 (emitted BNGL) vs libRoadRunner (original SBML).

Compares the ORIGINAL SBML trajectory (libRoadRunner) to the BNG2 output produced
from the atomizer's emitted BNGL. Robustness improvements over v1:

  1. UNIT ROBUSTNESS. BNG2 reports molecule COUNTS (amounts, with the atomizer's
     Avogadro token = 1, so counts are in the SBML's substance units). RoadRunner
     can report either. We pull RoadRunner in BOTH amount (bare id) and
     concentration ([id]) and score each BNG2 series against both, taking the
     better. A V != 1 model therefore no longer mismatches just because one side
     was concentration and the other amount -- that was inflating "mismatch" with
     pure unit artifacts, not real translation errors.

  2. BOTH FILES. We read the .gdat (named observables) AND the .cdat (raw species),
     mapping .cdat's positional S1..Sn columns back to names via the emitted BNGL
     'begin species' block, then align every RoadRunner species against the union.

  3. HONEST VERDICT. The verdict is driven by divergence of the *matched* species.
     Unmatched species are reported explicitly (count + names) rather than silently
     flipping the whole model to MISMATCH, so a name-canonicalization miss on one
     obscure species no longer masks an otherwise-perfect trajectory.

Usage:
  python3 parity_check.py --sbml model.xml --bngl model.bngl --bng2 /path/BNG2.pl [--bngpath DIR]
  python3 parity_check.py --sbml model.xml --gdat out.gdat [--cdat out.cdat] [--bngl model.bngl]
"""
import argparse, os, sys, subprocess, tempfile, glob, re
import numpy as np


def read_table(path):
    """Read a BNG2 .gdat/.cdat: '# col0 col1 ...' header then whitespace rows."""
    with open(path) as f:
        lines = [l.rstrip("\n") for l in f if l.strip()]
    if not lines:
        raise ValueError(f"empty table: {path}")
    header = lines[0].lstrip("#").split()
    data = np.array([[float(x) for x in row.split()] for row in lines[1:]])
    return header, data  # header[0] == 'time'


def sim_params_from_bngl(bngl_path):
    """Read t_end and n_steps from the first simulate() action in the emitted BNGL.

    The atomizer bakes in the SBML model's own simulation timescale. Using a
    fixed tend=10 ignores this and produces meaningless parity comparisons for
    models whose dynamics happen on a different scale (e.g. circadian: t=86400,
    fast kinetics: t=0.01). We always prefer the BNGL's own value over the CLI
    default so the two integrators see the same time window.
    """
    if not bngl_path or not os.path.exists(bngl_path):
        return None, None
    with open(bngl_path) as f:
        text = f.read()
    # match simulate({...t_end=>VALUE...n_steps=>VALUE...}) in any order
    m_tend = re.search(r't_end\s*=>\s*([0-9eE.+\-]+)', text)
    m_nsteps = re.search(r'n_steps\s*=>\s*([0-9eE.+\-]+)', text)
    tend = float(m_tend.group(1)) if m_tend else None
    nsteps = int(float(m_nsteps.group(1))) if m_nsteps else None
    return tend, nsteps


def species_patterns_from_bngl(bngl_path):
    """Ordered species patterns from 'begin species' -> maps .cdat S1..Sn to names.

    The Nth line of the species block is species S{N}; its first token is the
    pattern, e.g. '$M_X5P_ch@chloroplast'. We reduce it to a bare species name.
    """
    names, in_block = [], False
    try:
        with open(bngl_path) as f:
            for line in f:
                s = line.strip()
                if s.startswith("begin species"):
                    in_block = True
                    continue
                if s.startswith("end species"):
                    break
                if in_block and s:
                    names.append(s.split()[0])
    except OSError:
        return []
    return names


def norm(name):
    """Canonicalize a label for matching: drop non-alphanumerics, lowercase,
    strip a molecule 'M_' prefix, an '@compartment' suffix, and an 'amt' suffix."""
    s = str(name).lstrip("$")
    s = re.sub(r"@.*$", "", s)        # strip @compartment
    s = re.sub(r"^M_", "", s)         # strip molecule prefix
    s = re.sub(r"[^A-Za-z0-9]", "", s).lower()
    if s.endswith("amt"):
        s = s[:-3]
    return s


def run_bng2(bngl, bng2_pl, bngpath=None):
    td = tempfile.mkdtemp(prefix="parity-")
    bf = os.path.join(td, "m.bngl")
    open(bf, "w").write(open(bngl).read())
    env = dict(os.environ)
    if bngpath:
        env["BNGPATH"] = bngpath
    r = subprocess.run(["perl", bng2_pl, bf], cwd=td, env=env,
                       capture_output=True, text=True, timeout=300)
    gdats = glob.glob(os.path.join(td, "**", "*.gdat"), recursive=True)
    cdats = glob.glob(os.path.join(td, "**", "*.cdat"), recursive=True)
    if not gdats and not cdats:
        tail = (r.stdout or "")[-800:] + "\n--- stderr ---\n" + (r.stderr or "")[-1200:]
        raise RuntimeError(f"BNG2 produced no .gdat/.cdat (exit {r.returncode}):\n{tail}")
    gdat = max(gdats, key=os.path.getsize) if gdats else None
    cdat = max(cdats, key=os.path.getsize) if cdats else None
    return gdat, cdat


def run_roadrunner(sbml, tend, npoints):
    """Return (time, {species_id: {'amt': series, 'conc': series}}).

    We request BOTH the bare id (amount, by RoadRunner convention) and the
    bracketed [id] (concentration) so the comparison is unit-agnostic downstream.
    """
    import roadrunner
    rr = roadrunner.RoadRunner(sbml)
    ids = list(rr.model.getFloatingSpeciesIds())
    sel_amt = list(ids)
    sel_conc = [f"[{s}]" for s in ids]
    rr.timeCourseSelections = ["time"] + sel_amt + sel_conc
    res = np.array(rr.simulate(0, tend, npoints))
    cols = list(rr.timeCourseSelections)
    t = res[:, 0]
    out = {}
    for s in ids:
        ia = cols.index(s)
        ic = cols.index(f"[{s}]")
        out[s] = {"amt": res[:, ia], "conc": res[:, ic]}
    return t, out


def build_bng_columns(gdat, cdat, bngl):
    """Return {norm_name: series_on_bng_time_grid} plus the BNG time vector,
    unioning named .gdat observables with .cdat species mapped by bngl order."""
    cols, bt = {}, None
    if gdat:
        gh, gd = read_table(gdat)
        bt = gd[:, 0]
        for i, h in enumerate(gh):
            if i == 0:
                continue
            cols.setdefault(norm(h), gd[:, i])  # observables win ties (they're named)
    if cdat:
        ch, cd = read_table(cdat)
        if bt is None:
            bt = cd[:, 0]
        patterns = species_patterns_from_bngl(bngl) if bngl else []
        for i, h in enumerate(ch):
            if i == 0:
                continue
            # .cdat columns are usually S1..Sn (positional); map via the bngl species order.
            key = None
            m = re.fullmatch(r"S(\d+)", h.strip())
            if m and patterns:
                idx = int(m.group(1)) - 1
                if 0 <= idx < len(patterns):
                    key = norm(patterns[idx])
            if key is None:
                key = norm(h)
            cols.setdefault(key, cd[:, i])  # do not overwrite a named gdat column
    return cols, bt


def rel_l2(a, b):
    denom = max(np.abs(b).max(), 1e-30)
    return float(np.sqrt(np.mean((a - b) ** 2)) / denom)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sbml", required=True)
    ap.add_argument("--gdat")
    ap.add_argument("--cdat")
    ap.add_argument("--bngl")
    ap.add_argument("--bng2")
    ap.add_argument("--bngpath")
    ap.add_argument("--tend", type=float, default=10.0)
    ap.add_argument("--npoints", type=int, default=100)
    ap.add_argument("--rtol", type=float, default=1e-3)
    a = ap.parse_args()

    gdat, cdat = a.gdat, a.cdat
    if not gdat and not cdat:
        gdat, cdat = run_bng2(a.bngl, a.bng2, a.bngpath)

    # Use the t_end/n_steps baked into the emitted BNGL by the atomizer (derived from the
    # SBML's own simulationSettings) unless the caller explicitly overrides them. A fixed
    # tend=10 is wrong for models with dynamics on wildly different timescales (circadian
    # oscillators at t=86400; fast signalling at t=0.01) and produces meaningless parity
    # comparisons even for correctly-translated models.
    bngl_tend, bngl_nsteps = sim_params_from_bngl(a.bngl)
    tend   = bngl_tend   if (bngl_tend   is not None and a.tend   == 10.0) else a.tend
    nsteps = bngl_nsteps if (bngl_nsteps is not None and a.npoints == 100)  else a.npoints
    print(f"t_end={tend} n_steps={nsteps}")

    bng_cols, bt = build_bng_columns(gdat, cdat, a.bngl)
    rt, rr = run_roadrunner(a.sbml, tend, nsteps)

    print(f"BNG2 columns: {len(bng_cols)} (gdat+cdat) | RoadRunner species: {len(rr)}")
    worst = 0.0
    matched = 0
    unmatched = []
    for sid, series in rr.items():
        key = norm(sid)
        if key not in bng_cols:
            unmatched.append(sid)
            continue
        matched += 1
        bng = np.interp(rt, bt, bng_cols[key])         # BNG2 amount on RR grid
        r_amt = rel_l2(bng, series["amt"])              # vs RR amount
        r_conc = rel_l2(bng, series["conc"])            # vs RR concentration
        best = min(r_amt, r_conc)
        unit = "amt" if r_amt <= r_conc else "conc"
        worst = max(worst, best)
        flag = "" if best <= a.rtol else "  <-- DIVERGES"
        print(f"  {sid:24s} rel_L2={best:.2e} (via {unit}; amt={r_amt:.1e} conc={r_conc:.1e}){flag}")

    if unmatched:
        print(f"UNMATCHED RoadRunner species (no BNG2 column): {unmatched}")

    # Verdict is driven by matched-species divergence. Unmatched species are reported
    # but do not by themselves flip the model, so one naming miss can't mask a good fit.
    ok = (matched > 0 and worst <= a.rtol)
    verdict = "PARITY" if ok else "MISMATCH"
    print(f"\n{verdict}: worst matched rel_L2={worst:.2e} over {matched} species "
          f"(rtol={a.rtol}); unmatched={len(unmatched)}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()