"""
Compute the Fisher Information Matrix (FIM) for a Michaelis–Menten SBML model
using libRoadRunner. The workflow mirrors `services/fim.ts` and the Node-based
`check_michaelis_menten_fim.mjs` script so the numerical results can be compared
side-by-side.

Key capabilities:
- Automatically discovers observables exported as assignment-rule parameters
- Configures the CVODE integrator with RoadRunner's API for reproducible output
- Uses central finite differences over the full time course to assemble J and F
- Provides CLI options for custom parameter subsets, time horizons, and step
  counts

Usage examples::

    # Basic run using defaults (parameters k_on/k_off/k_cat, t_end=50, 500 steps)
    python scripts/check_mm_fim_roadrunner.py path/to/model.xml

    # Override parameter list and number of time steps
    python scripts/check_mm_fim_roadrunner.py model.xml --parameters k_on k_cat \
        --steps 1000

Requirements:
    pip install libroadrunner numpy
"""

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple, cast

import numpy as np
import roadrunner


SPECIES_ID_BY_NAME: Dict[str, str] = {}
TIMECOURSE_SELECTIONS: List[str] = []


@dataclass(frozen=True)
class SimulationConfig:
    start: float = 0.0
    end: float = 50.0
    steps: int = 500  # equals Node RK4 configuration (500 steps -> 501 points)
    rel_tol: float = 1e-10
    abs_tol: float = 1e-12
    integrator: str = 'cvode'

    @property
    def points(self) -> int:
        return self.steps + 1


@dataclass(frozen=True)
class FIMDecomposition:
    fim_matrix: np.ndarray
    eigenvalues: np.ndarray
    eigenvectors: np.ndarray
    covariance: np.ndarray
    correlations: np.ndarray
    condition_number: float
    regularized_condition: float


@dataclass(frozen=True)
class NullspaceCombination:
    eigenvalue: float
    components: List[Tuple[str, float]]


@dataclass(frozen=True)
class IdentifiabilitySummary:
    identifiable_params: List[str]
    unidentifiable_params: List[str]
    nullspace_combinations: List[NullspaceCombination]


@dataclass(frozen=True)
class CorrelationPair:
    names: Tuple[str, str]
    corr: float


def configure_integrator(rr: roadrunner.RoadRunner, config: SimulationConfig) -> None:
    """Configure the requested integrator and harmonise settings across modes."""
    desired = config.integrator.lower()
    if rr.getIntegrator().getName().lower() != desired:
        rr.setIntegrator(desired)
    integrator = rr.getIntegrator()
    name = integrator.getName().lower()

    if name == 'cvode':
        integrator.setValue('relative_tolerance', config.rel_tol)
        integrator.setValue('absolute_tolerance', config.abs_tol)
        try:
            integrator.setValue('variable_step_size', False)
        except RuntimeError:
            pass
    elif name.startswith('rk'):
        # Ensure we use fixed steps that align with the Node RK4 implementation when possible.
        for key in ('variable_step_size', 'adaptive'):  # integrator-specific naming
            try:
                integrator.setValue(key, False)
            except RuntimeError:
                continue
    else:
        raise ValueError(f'Unsupported integrator: {config.integrator}')


def infer_observables(rr: roadrunner.RoadRunner) -> List[str]:
    """Infer observable IDs exported as assignment-rule parameters (prefixed with obs_)."""
    candidate_params = rr.model.getGlobalParameterIds()
    observables = [pid for pid in candidate_params if pid.startswith('obs_')]
    if not observables:
        raise RuntimeError('Could not infer observables (no parameters starting with "obs_").')
    return observables


def snapshot_parameters(rr: roadrunner.RoadRunner, ids: Sequence[str]) -> Dict[str, float]:
    return {pid: float(cast(float, rr.getValue(pid))) for pid in ids}


def normalise_initial_conditions(rr: roadrunner.RoadRunner) -> None:
    """Reset floating species to BNGL seed-state values prior to each simulation."""
    if not SPECIES_ID_BY_NAME:
        return

    def set_init(name: str, value: float) -> None:
        sid = SPECIES_ID_BY_NAME.get(name)
        if sid is not None:
            try:
                rr.setValue(f'init({sid})', value)
            except RuntimeError:
                pass

    # Use BNGL parameters for free enzyme/substrate when available; fall back to defaults.
    try:
        set_init('E(s)', float(rr.getValue('E_0')))
    except RuntimeError:
        pass
    try:
        set_init('S(e)', float(rr.getValue('S_0')))
    except RuntimeError:
        pass

    # Product and complex start at zero in the Node baseline.
    set_init('P()', 0.0)
    set_init('E(s!1).S(e!1)', 0.0)


def load_species_name_map(sbml_path: Path) -> Dict[str, str]:
    """Build a lookup from SBML species names to IDs, retaining IDs as fallbacks."""
    mapping: Dict[str, str] = {}
    try:
        tree = ET.parse(sbml_path)
    except ET.ParseError:
        return mapping

    root = tree.getroot()
    if not root.tag.startswith('{'):
        return mapping
    ns = {'sbml': root.tag.split('}', 1)[0][1:]}
    for species in root.findall('.//sbml:listOfSpecies/sbml:species', ns):
        sid = species.attrib.get('id')
        if not sid:
            continue
        name = species.attrib.get('name', sid)
        mapping[name] = sid
        mapping[sid] = sid  # allow direct ID lookup as a fallback
    return mapping


def simulate_model(
    rr: roadrunner.RoadRunner,
    config: SimulationConfig,
    param_overrides: Dict[str, float] | None = None,
) -> Any:
    rr.resetAll()
    if TIMECOURSE_SELECTIONS:
        rr.timeCourseSelections = TIMECOURSE_SELECTIONS
        rr.selections = TIMECOURSE_SELECTIONS
    normalise_initial_conditions(rr)
    if param_overrides:
        rr.setValues(param_overrides)
    if TIMECOURSE_SELECTIONS:
        return rr.simulate(config.start, config.end, config.points, TIMECOURSE_SELECTIONS)
    return rr.simulate(config.start, config.end, config.points)


def build_jacobian(
    rr: roadrunner.RoadRunner,
    config: SimulationConfig,
    param_names: Sequence[str],
    base_params: Dict[str, float],
    observables: Sequence[str],
    rel_eps: float,
) -> np.ndarray:
    baseline = simulate_model(rr, config)
    obs_indices = {name: baseline.colnames.index(name) for name in observables}

    time_count = baseline.shape[0]
    num_obs = len(observables)
    p = len(param_names)
    J = np.zeros((time_count * num_obs, p))

    for j, pname in enumerate(param_names):
        base_val = base_params[pname]
        # Mirror Node script: relative perturbation with lower bound 1e-8.
        eps = max(1e-8, abs(base_val) * rel_eps, 1e-8)

        plus_params = dict(base_params)
        plus_params[pname] = base_val + eps

        minus_params = dict(base_params)
        minus_params[pname] = max(0.0, base_val - eps)

        plus_data = simulate_model(rr, config, plus_params)
        minus_data = simulate_model(rr, config, minus_params)

        denom = plus_params[pname] - minus_params[pname] or eps

        for ti in range(time_count):
            row_offset = ti * num_obs
            for oi, obs_name in enumerate(observables):
                idx = obs_indices[obs_name]
                deriv = (plus_data[ti, idx] - minus_data[ti, idx]) / denom
                J[row_offset + oi, j] = deriv if np.isfinite(deriv) else 0.0

    return J


def compute_fim(J: np.ndarray) -> FIMDecomposition:
    F = J.T @ J
    eigenvalues, eigenvectors = np.linalg.eigh(F)
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[order]
    eigenvectors = eigenvectors[:, order]

    max_eig = eigenvalues[0]
    min_eig = eigenvalues[-1]
    raw_condition = max_eig / min_eig if min_eig > 0 else np.inf
    rel_eps = max(abs(max_eig) * 1e-12, 1e-16)
    regularized_condition = max_eig / max(min_eig, rel_eps)

    eig_threshold = max(1e-12, max_eig * 1e-12)
    p = J.shape[1]
    cov = np.zeros((p, p))
    for k in range(p):
        lam = eigenvalues[k]
        if lam > eig_threshold:
            cov += np.outer(eigenvectors[:, k], eigenvectors[:, k]) / lam

    correlations = np.zeros_like(cov)
    for i in range(p):
        for j in range(p):
            var_i = cov[i, i]
            var_j = cov[j, j]
            correlations[i, j] = cov[i, j] / np.sqrt(var_i * var_j) if var_i > 0 and var_j > 0 else 0.0

    return FIMDecomposition(
        fim_matrix=F,
        eigenvalues=eigenvalues,
        eigenvectors=eigenvectors,
        covariance=cov,
        correlations=correlations,
        condition_number=float(raw_condition),
        regularized_condition=float(regularized_condition),
    )


def analyse_identifiability(
    eigenvalues: np.ndarray,
    eigenvectors: np.ndarray,
    param_names: Sequence[str],
) -> IdentifiabilitySummary:
    max_eig = eigenvalues[0]
    eig_threshold = max(1e-12, max_eig * 1e-12)
    contrib_threshold = max_eig * 1e-6

    identifiable: List[str] = []
    unidentifiable: List[str] = []

    for i, pname in enumerate(param_names):
        contribution = sum(
            (eigenvectors[i, k] ** 2) * eigenvalues[k]
            for k in range(len(param_names))
            if eigenvalues[k] > eig_threshold
        )
        target = identifiable if contribution > contrib_threshold else unidentifiable
        target.append(pname)

    null_tol = max(1e-12, abs(max_eig) * 1e-4)
    nullspace: List[NullspaceCombination] = []
    for k in range(len(param_names) - 1, -1, -1):
        lam = eigenvalues[k]
        if lam > null_tol:
            break
        vec = eigenvectors[:, k]
        max_abs = np.max(np.abs(vec))
        threshold = max_abs * 0.1
        components = [
            (param_names[i], float(vec[i]))
            for i in range(len(param_names))
            if np.isfinite(vec[i]) and abs(vec[i]) >= threshold
        ]
        components.sort(key=lambda item: abs(item[1]), reverse=True)
        nullspace.append(NullspaceCombination(float(lam), components))

    return IdentifiabilitySummary(identifiable, unidentifiable, nullspace)


def top_correlated_pairs(correlations: np.ndarray, param_names: Sequence[str], limit: int = 3) -> List[CorrelationPair]:
    pairs: List[CorrelationPair] = []
    for i in range(len(param_names)):
        for j in range(i + 1, len(param_names)):
            pairs.append(CorrelationPair((param_names[i], param_names[j]), float(correlations[i, j])))
    pairs.sort(key=lambda entry: abs(entry.corr), reverse=True)
    return pairs[:limit]


def print_matrix(matrix: np.ndarray, format_str: str = '.3e') -> None:
    for row in matrix:
        print('  ', ' '.join(f'{val:{format_str}}'.rjust(12) for val in row))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Compute a Michaelis–Menten FIM with libRoadRunner.')
    parser.add_argument('sbml_file', type=Path, help='Path to SBML model exported from BioNetGen.')
    parser.add_argument('--parameters', nargs='+', help='Parameter IDs to differentiate (default: kinetic params detected).')
    parser.add_argument('--steps', type=int, default=500, help='Number of uniform integration steps (default: 500).')
    parser.add_argument('--t-end', type=float, default=50.0, help='Simulation end time (default: 50).')
    parser.add_argument('--rel-eps', type=float, default=1e-4, help='Relative perturbation size for finite differences (default: 1e-4).')
    parser.add_argument('--abs-tol', type=float, default=1e-12, help='CVODE absolute tolerance (default: 1e-12).')
    parser.add_argument('--rel-tol', type=float, default=1e-10, help='CVODE relative tolerance (default: 1e-10).')
    parser.add_argument('--integrator', type=str, default='cvode', help="RoadRunner integrator to use (e.g. 'cvode', 'rk4').")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sbml_path: Path = args.sbml_file
    if not sbml_path.exists():
        raise FileNotFoundError(f'SBML file not found: {sbml_path}')

    config = SimulationConfig(
        end=args.t_end,
        steps=args.steps,
        rel_tol=args.rel_tol,
        abs_tol=args.abs_tol,
        integrator=args.integrator,
    )

    print('Computing FIM for Michaelis–Menten model using RoadRunner...\n')
    print(f'Loading model from: {sbml_path}\n')

    rr = roadrunner.RoadRunner(str(sbml_path))
    global SPECIES_ID_BY_NAME
    SPECIES_ID_BY_NAME = load_species_name_map(sbml_path)
    configure_integrator(rr, config)
    observables = infer_observables(rr)
    global TIMECOURSE_SELECTIONS
    TIMECOURSE_SELECTIONS = ['time', *observables]
    rr.timeCourseSelections = TIMECOURSE_SELECTIONS

    if args.parameters:
        param_names = args.parameters
    else:
        kinetic_candidates = [pid for pid in rr.model.getGlobalParameterIds() if not pid.startswith('obs_')]
        param_names = [pid for pid in kinetic_candidates if pid.startswith('k_')]
        if not param_names:
            raise RuntimeError('Could not infer kinetic parameters. Specify them via --parameters.')

    base_params = snapshot_parameters(rr, param_names)

    J = build_jacobian(rr, config, param_names, base_params, observables, args.rel_eps)
    fim_stats = compute_fim(J)
    ident_stats = analyse_identifiability(fim_stats.eigenvalues, fim_stats.eigenvectors, param_names)
    corr_pairs = top_correlated_pairs(fim_stats.correlations, param_names)

    print('FIM eigenvalues (descending):')
    for idx, val in enumerate(fim_stats.eigenvalues):
        print(f'  λ{idx + 1}: {val:.6e}')
    print()

    print('Condition number (raw / regularized):')
    print(f'  {fim_stats.condition_number:.6e} / {fim_stats.regularized_condition:.6e}')
    print()

    identifiable = ', '.join(ident_stats.identifiable_params) or '(none)'
    unidentifiable = ', '.join(ident_stats.unidentifiable_params) or '(none)'
    print(f'Identifiable parameters: {identifiable}')
    print(f'Unidentifiable parameters: {unidentifiable}')
    print()

    if ident_stats.nullspace_combinations:
        print('Near-null eigenvectors (suggesting unidentifiable combinations):')
        for mode, combo in enumerate(ident_stats.nullspace_combinations, start=1):
            print(f'  Mode {mode} (λ = {combo.eigenvalue:.6e}):')
            for name, loading in combo.components:
                print(f'    {name}: {loading:.4f}')
        print()

    if corr_pairs:
        print('Top correlated parameter pairs:')
        for pair in corr_pairs:
            print(f'  {pair.names[0]} vs {pair.names[1]}: corr = {pair.corr:.4f}')
        print()

    print('Correlation matrix:')
    print_matrix(fim_stats.correlations)
    print()

    print('FIM matrix:')
    print_matrix(fim_stats.fim_matrix)
    print()

    print('Comparison notes:')
    print('- Run `node scripts/check_michaelis_menten_fim.mjs` to compare')
    print('- Small numerical differences expected due to solver differences (CVODE vs RK4)')
    print('- Eigenvalues, condition number, and correlations should track closely when using matching step counts')


if __name__ == '__main__':
    main()
