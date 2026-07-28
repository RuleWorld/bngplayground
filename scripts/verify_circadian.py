import os
import re
import subprocess
import numpy as np
import scipy.linalg as la

BNG2_PATH = os.environ.get("BNG2_PATH", "")
RULEHUB_ROOT = os.environ.get("RULEHUB_ROOT", "")
MODEL_PATH = os.path.join(RULEHUB_ROOT, "Published", "vilar2002", "vilar_2002.bngl")

# Nominal parameters
PARAM_NAMES = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"]
NOMINAL_VALUES = {
    "k1": 0.01,
    "k2": 0.2,
    "k3": 0.5,
    "k4": 1.0,
    "k5": 2.0,
    "k6": 10.0,
    "k7": 50.0,
    "k8": 100.0,
    "k9": 500.0,
    "k10": 5.0,
}


def load_and_normalize_bngl(path):
    with open(path, "r") as f:
        code = f.read()
    # Normalize molecular types -> molecule types
    code = re.sub(r"molecular\s+types", "molecule types", code, flags=re.IGNORECASE)
    return code


def write_and_run_bng(code, outdir, filename="model.bngl"):
    os.makedirs(outdir, exist_ok=True)
    bngl_file = os.path.join(outdir, filename)
    with open(bngl_file, "w") as f:
        f.write(code)

    # Run BNG2.pl
    cmd = ["perl", BNG2_PATH, "--outdir", outdir, bngl_file]
    result = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"BioNetGen failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return bngl_file


def parse_gdat(gdat_path):
    with open(gdat_path, "r") as f:
        lines = f.readlines()
    header = lines[0].strip().split()
    # Remove leading '#' if present
    if header[0] == "#":
        header = header[1:]
    elif header[0].startswith("#"):
        header[0] = header[0][1:]

    data = []
    for line in lines[1:]:
        if line.strip():
            data.append([float(x) for x in line.strip().split()])
    return header, np.array(data)


def simulate_ode_with_params(param_overrides):
    # Prepare model text with overrides
    model_code = load_and_normalize_bngl(MODEL_PATH)

    # Re-write parameters block with overrides
    param_block = "begin parameters\n"
    for name in PARAM_NAMES:
        val = param_overrides.get(name, NOMINAL_VALUES[name])
        param_block += f"    {name} {val}\n"
    param_block += "end parameters"

    model_code = re.sub(
        r"begin\s+parameters.*?end\s+parameters",
        param_block,
        model_code,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Set simulate_ode parameters
    sim_cmd = 'simulate_ode({suffix=>"ode",t_start=>0,t_end=>200,n_steps=>100});'
    model_code = re.sub(r"simulate_ode\(.*?\);", sim_cmd, model_code)

    # Run
    outdir = "temp_bng_fim"
    write_and_run_bng(model_code, outdir, "vilar_overridden.bngl")

    # Parse results
    gdat_file = os.path.join(outdir, "vilar_overridden_ode.gdat")
    headers, data = parse_gdat(gdat_file)
    return headers, data


def compute_fim_python():
    print("Computing Fisher Information Matrix using BNG2.pl as ODE solver...")
    epsilon = 1e-4

    # Get baseline
    headers, base_data = simulate_ode_with_params(NOMINAL_VALUES)
    time_pts = base_data[:, 0]
    # We want observables A and R
    idx_A = headers.index("A")
    idx_R = headers.index("R")

    n_params = len(PARAM_NAMES)
    n_timepoints = len(time_pts)
    n_observables = 2  # A and R

    # Sensitivities array
    # Shape: (n_timepoints * n_observables, n_params)
    sensitivities = np.zeros((n_timepoints * n_observables, n_params))

    for j, name in enumerate(PARAM_NAMES):
        val = NOMINAL_VALUES[name]

        # Perturb up
        overrides_up = NOMINAL_VALUES.copy()
        overrides_up[name] = val * (1.0 + epsilon)
        _, data_up = simulate_ode_with_params(overrides_up)

        # Perturb down
        overrides_down = NOMINAL_VALUES.copy()
        overrides_down[name] = val * (1.0 - epsilon)
        _, data_down = simulate_ode_with_params(overrides_down)

        # Central difference for log-parameters: dY/d(ln P) = P * dY/dP
        # dY/d(ln P) = (Y(P*(1+eps)) - Y(P*(1-eps))) / (2 * eps)
        diff_A = (data_up[:, idx_A] - data_down[:, idx_A]) / (2 * epsilon)
        diff_R = (data_up[:, idx_R] - data_down[:, idx_R]) / (2 * epsilon)

        sensitivities[:n_timepoints, j] = diff_A
        sensitivities[n_timepoints:, j] = diff_R
        print(f"  Sensitivities computed for parameter {name}")

    # FIM = J^T * J
    FIM = np.dot(sensitivities.T, sensitivities)

    # Eigenvalues
    eigenvalues = np.sort(la.eigvalsh(FIM))[::-1]
    cond_num = eigenvalues[0] / eigenvalues[-1]

    # VIF
    # R = D^-1/2 * FIM * D^-1/2
    D = np.diag(np.diag(FIM))
    D_inv_sqrt = np.diag(1.0 / np.sqrt(np.diag(FIM)))
    R = D_inv_sqrt @ FIM @ D_inv_sqrt
    R_inv = la.inv(R)
    vifs = np.diag(R_inv)

    return FIM, eigenvalues, cond_num, vifs


def parse_net_file(net_path):
    with open(net_path, "r") as f:
        lines = f.readlines()

    species = []
    reactions = []
    parameters = {}

    mode = None
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("begin parameters"):
            mode = "parameters"
            continue
        if line.startswith("end parameters"):
            mode = None
            continue
        if line.startswith("begin species"):
            mode = "species"
            continue
        if line.startswith("end species"):
            mode = None
            continue
        if line.startswith("begin reactions"):
            mode = "reactions"
            continue
        if line.startswith("end reactions"):
            mode = None
            continue

        if mode == "parameters":
            # format: index name value
            parts = line.split()
            parameters[parts[1]] = float(parts[2])
        elif mode == "species":
            # format: index pattern initial_conc
            parts = line.split()
            species.append(
                {"id": int(parts[0]), "pattern": parts[1], "initial": float(parts[2])}
            )
        elif mode == "reactions":
            # format: index reactants products rate_expr [comment]
            parts = line.split()
            reactants = [int(x) for x in parts[1].split(",") if x != "0"]
            products = [int(x) for x in parts[2].split(",") if x != "0"]
            rate_expr = parts[3]
            comment = parts[4] if len(parts) > 4 else ""
            reactions.append(
                {
                    "id": int(parts[0]),
                    "reactants": reactants,
                    "products": products,
                    "rate_expr": rate_expr,
                    "name": comment.replace("#", "").strip(),
                }
            )

    return parameters, species, reactions


def run_python_ssa(parameters, species, reactions, t_end=400, seed=42):
    np.random.seed(seed)
    n_species = len(species)
    n_reactions = len(reactions)

    # Initial concentrations
    y = np.zeros(n_species + 1)  # 1-based indexing
    for sp in species:
        y[sp["id"]] = sp["initial"]

    t = 0.0
    firing_events = []

    # Map parameter names to values
    rates = [parameters[r["rate_expr"]] for r in reactions]

    # Pre-map reactants and products stoichiometry
    rxn_reactants = [r["reactants"] for r in reactions]
    rxn_products = [r["products"] for r in reactions]
    rxn_names = [r["name"] for r in reactions]

    while t < t_end:
        # Compute propensities
        propensities = np.zeros(n_reactions)
        for r_idx in range(n_reactions):
            reac = rxn_reactants[r_idx]
            k = rates[r_idx]
            if len(reac) == 0:
                propensities[r_idx] = k
            elif len(reac) == 1:
                propensities[r_idx] = k * y[reac[0]]
            elif len(reac) == 2:
                if reac[0] == reac[1]:  # homodimer
                    propensities[r_idx] = k * y[reac[0]] * (y[reac[0]] - 1) / 2.0
                else:
                    propensities[r_idx] = k * y[reac[0]] * y[reac[1]]

        a_total = np.sum(propensities)
        if a_total <= 0:
            break

        # Time step
        dt = -np.log(np.random.rand()) / a_total
        t += dt
        if t > t_end:
            break

        # Choose reaction
        r2 = np.random.rand() * a_total
        cum_sum = 0.0
        chosen_rxn = 0
        for r_idx in range(n_reactions):
            cum_sum += propensities[r_idx]
            if r2 <= cum_sum:
                chosen_rxn = r_idx
                break

        # Fire reaction
        reac = rxn_reactants[chosen_rxn]
        prod = rxn_products[chosen_rxn]

        # Apply stoichiometry
        for sp_id in reac:
            y[sp_id] -= 1
        for sp_id in prod:
            y[sp_id] += 1

        firing_events.append(
            {"time": t, "reactionIndex": chosen_rxn, "ruleName": rxn_names[chosen_rxn]}
        )

    return firing_events


def binary_entropy(p1):
    if p1 <= 0 or p1 >= 1:
        return 0.0
    p0 = 1.0 - p1
    return -p1 * np.log2(p1) - p0 * np.log2(p0)


def analyze_entropy_python(firing_events, n_reactions, t_end=400, bin_width=1.0):
    n_bins = int(np.ceil(t_end / bin_width))
    series = np.zeros((n_reactions, n_bins), dtype=np.uint8)

    for event in firing_events:
        bin_idx = int(np.floor(event["time"] / bin_width))
        if 0 <= bin_idx < n_bins:
            series[event["reactionIndex"], bin_idx] = 1

    entropies = []
    for r in range(n_reactions):
        p1_val = np.sum(series[r]) / n_bins
        h = binary_entropy(p1_val)
        entropies.append((r, h))

    return entropies


def main():
    print("================================================================")
    # 1. Compute ODE FIM in Python
    FIM, eigenvalues, cond_num, vifs = compute_fim_python()

    print("\n[PYTHON] FIM Eigenvalues:")
    for i, val in enumerate(eigenvalues):
        print(
            f"  L{i + 1}: {val.toExponential(4) if hasattr(val, 'toExponential') else f'{val:.4e}'}"
        )
    print(f"[PYTHON] FIM Condition Number: {cond_num:.4e}")

    print("\n[PYTHON] Variance Inflation Factors (VIF):")
    for i, name in enumerate(PARAM_NAMES):
        print(f"  {name}: {vifs[i]:.2f}")

    # 2. Run Python SSA and Entropy
    print("\nParsing net file for Gillespie SSA...")
    parameters, species, reactions = parse_net_file("temp_bng/vilar_2002.net")
    print(
        f"Loaded {len(species)} species and {len(reactions)} reactions from BioNetGen .net file."
    )

    print("Running Gillespie SSA in Python...")
    firing_events = run_python_ssa(parameters, species, reactions, t_end=400)
    print(f"Stochastic simulation complete: {len(firing_events)} events recorded.")

    entropies = analyze_entropy_python(firing_events, len(reactions), t_end=400)

    print("\n[PYTHON] Per-Reaction Shannon Entropy:")
    # Sort by entropy descending
    entropies_sorted = sorted(entropies, key=lambda x: x[1], reverse=True)
    for r, h in entropies_sorted[:10]:
        print(f"  Reaction R{r + 1} ({reactions[r]['name']}): {h:.4f} bits")

    print("================================================================")


if __name__ == "__main__":
    main()
