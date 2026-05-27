/**
 * Jupyter Notebook (.ipynb) Generation Utility
 *
 * Generates a complete analysis notebook using pybionetgen and libroadrunner.
 */

import type { SimulationResults } from '../../types';

interface NotebookCell {
  cell_type: 'markdown' | 'code';
  metadata: {
    language?: 'markdown' | 'python';
    id?: string;
    [key: string]: unknown;
  };
  source: string[];
}

interface JupyterExportOptions {
  simulationResults?: SimulationResults | null;
}

function escapeTripleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
}

function buildSimulationRows(results?: SimulationResults | null): Record<string, unknown>[] {
  if (!results?.data?.length) return [];
  return results.data.map((row) => ({ ...row }));
}

export function generateJupyterNotebookContent(
  bnglCode: string,
  modelName: string,
  options: JupyterExportOptions = {}
): string {
  const cells: NotebookCell[] = [];
  const embeddedRows = buildSimulationRows(options.simulationResults);
  const embeddedRowsJson = embeddedRows.length > 0 ? JSON.stringify(embeddedRows, null, 2) : '';

  // 1. Header
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `# BioNetGen Analysis: ${modelName}\n`,
      `This notebook is generated from the current web session. It preserves the BNGL source, adds a reproducible Python workflow, and can embed simulation output when it is available.`
    ]
  });

  // 2. Setup
  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `# Install dependencies if needed\n`,
      `# !pip install pybionetgen libroadrunner numpy matplotlib pandas seaborn scipy\n`,
      `import bionetgen\n`,
      `import numpy as np\n`,
      `import pandas as pd\n`,
      `import matplotlib.pyplot as plt\n`,
      `import seaborn as sns\n`,
      `import os\n`,
      `from scipy.optimize import curve_fit, root, brute\n`,
      `from scipy.stats import sem\n\n`,
      `# Configure plot style\n`,
      `sns.set_theme(style="whitegrid", palette="muted")\n`,
      `plt.rcParams['figure.figsize'] = [10, 6]\n`,
      `plt.rcParams['font.size'] = 12`
    ]
  });

  // 3. Save Model
  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `# Save current model to file\n`,
      `model_name = "${modelName}"\n`,
      `model_file = f"{model_name}.bngl"\n`,
      `bngl_content = """${escapeTripleQuoted(bnglCode)}"""\n\n`,
      `with open(model_file, "w", encoding="utf-8") as f:\n`,
      `    f.write(bngl_content)\n\n`,
      `print(f"Model saved to {model_file}")`
    ]
  });

  if (embeddedRowsJson) {
    cells.push({
      cell_type: 'markdown',
      metadata: {},
      source: [
        `## 1.1 Embedded Session Results\n`,
        `The current web-session trajectory is embedded below so the exported notebook can inspect and re-plot the same data immediately.`
      ]
    });

    cells.push({
      cell_type: 'code',
      metadata: {},
      source: [
        `import json\n`,
        `session_rows = json.loads("""${embeddedRowsJson.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}""")\n`,
        `session_df = pd.DataFrame(session_rows)\n`,
        `if 'time' in session_df.columns:\n`,
        `    session_df = session_df.sort_values('time').reset_index(drop=True)\n`,
        `display(session_df.head())\n`,
        `\n`,
        `plt.figure(figsize=(10, 6))\n`,
        `for column in session_df.columns:\n`,
        `    if column != 'time':\n`,
        `        plt.plot(session_df['time'], session_df[column], label=column)\n`,
        `plt.xlabel('Time')\n`,
        `plt.ylabel('Value')\n`,
        `plt.title(f'Session Results: ${modelName}')\n`,
        `plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')\n`,
        `plt.tight_layout()\n`,
        `plt.show()`
      ]
    });
  }

  // 4. Basic Simulation (Standard BNG)
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 1. Standard Simulation with pybionetgen\n`,
      `The \`bionetgen.run()\` command executes the full BNGL script using the BNG2.pl engine. This handles network generation and simulation as defined in your script.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `# Run the model using pybionetgen's documented return structure\n`,
      `def to_dataframe(result_obj):\n`,
      `    if isinstance(result_obj, pd.DataFrame):\n`,
      `        return result_obj.copy()\n`,
      `    if hasattr(result_obj, 'colnames'):\n`,
      `        return pd.DataFrame({col: result_obj[col] for col in result_obj.colnames})\n`,
      `    return pd.DataFrame(result_obj)\n\n`,
      `sim_df = None\n`,
      `try:\n`,
      `    ret = bionetgen.run(model_file, out="bng_output")\n`,
      `    base_name = os.path.splitext(os.path.basename(model_file))[0]\n`,
      `    result_map = ret.results if hasattr(ret, 'results') else ret\n`,
      `    if not isinstance(result_map, dict) or len(result_map) == 0:\n`,
      `        raise RuntimeError("No simulation result map was returned by bionetgen.run")\n`,
      `    result_key = base_name if base_name in result_map else next(iter(result_map.keys()))\n`,
      `    print(f"Using result key: {result_key}")\n`,
      `    sim_df = to_dataframe(result_map[result_key])\n`,
      `except Exception as err:\n`,
      `    print(f"bionetgen.run() failed ({err})")\n`,
      `    print("Trying bngmodel + setup_simulator fallback")\n`,
      `    try:\n`,
      `        fallback_model = bionetgen.bngmodel(model_file)\n`,
      `        fallback_rr = fallback_model.setup_simulator()\n`,
      `        sim_df = to_dataframe(fallback_rr.simulate(0, 100, 101))\n`,
      `    except Exception as fallback_err:\n`,
      `        raise RuntimeError(f"Both simulation paths failed: {fallback_err}")\n\n`,
      `display(sim_df.head())\n`,
      `time_col = 'time' if 'time' in sim_df.columns else sim_df.columns[0]\n`,
      `plt.figure(figsize=(10, 6))\n`,
      `for col in sim_df.columns:\n`,
      `    if col != time_col:\n`,
      `        plt.plot(sim_df[time_col], sim_df[col], label=col)\n`,
      `plt.xlabel(time_col)\n`,
      `plt.ylabel('Value')\n`,
      `plt.title(f"Simulation: {model_name}")\n`,
      `plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')\n`,
      `plt.tight_layout()\n`,
      `plt.show()`
    ]
  });

  // 5. libroadrunner Integration
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 2. High-Performance ODE Simulation with libroadrunner\n`,
      `For rapid parameter sweeps or optimization, you can use the \`libroadrunner\` engine, which uses LLVM to JIT-compile your model for high-performance ODE integration.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `# Load the model into a pythonic bngmodel object\n`,
      `model = bionetgen.bngmodel(model_file)\n\n`,
      `# Setup the roadrunner simulator\n`,
      `# Note: This generates BNG-XML and then SBML to load into roadrunner\n`,
      `rr = None\n`,
      `try:\n`,
      `    rr = model.setup_simulator()\n`,
      `\n`,
      `    def safe_rr_simulate(start, end, points):\n`,
      `        try:\n`,
      `            return rr.simulate(float(start), float(end), int(points))\n`,
      `        except Exception as first_err:\n`,
      `            # Retry with relaxed integration settings for stiff/unstable regimes\n`,
      `            try:\n`,
      `                rr.integrator.setValue('maximum_num_steps', 200000)\n`,
      `                rr.integrator.setValue('relative_tolerance', 1e-6)\n`,
      `                rr.integrator.setValue('absolute_tolerance', 1e-10)\n`,
      `            except Exception:\n`,
      `                pass\n`,
      `            try:\n`,
      `                retry_points = max(51, int(points) // 2)\n`,
      `                return rr.simulate(float(start), float(end), retry_points)\n`,
      `            except Exception as second_err:\n`,
      `                raise RuntimeError(f'RoadRunner simulate failed: {first_err}; retry failed: {second_err}')\n`,
      `\n`,
      `    rr_data = safe_rr_simulate(0, 100, 101)\n`,
      `    rr_df = pd.DataFrame({col: rr_data[col] for col in rr_data.colnames})\n`,
      `    plt.figure(figsize=(10, 6))\n`,
      `    for col in rr_df.columns:\n`,
      `        if col != 'time':\n`,
      `            plt.plot(rr_df['time'], rr_df[col], label=col)\n`,
      `    plt.xlabel('Time')\n`,
      `    plt.ylabel('Concentration')\n`,
      `    plt.title(f'ODE Simulation: {model_name}')\n`,
      `    plt.legend()\n`,
      `    plt.grid(True, alpha=0.3)\n`,
      `    plt.show()\n`,
      `except Exception as err:\n`,
      `    print(f'RoadRunner setup unavailable: {err}')\n`,
      `    print('Advanced ODE cells below are optional and will be skipped if rr is None.')`
    ]
  });

  // 5.5. Steady State Analysis
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 2.5. Steady State Analysis\n`,
      `Find and analyze the steady-state behavior of your model.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `if rr is None:\n`,
      `    print('Skipping steady-state analysis because rr is unavailable.')\n`,
      `else:\n`,
      `    rr.reset()\n`,
      `    try:\n`,
      `        steady_state = rr.steadyState()\n`,
      `        print(f"Steady state found with residual: {steady_state}")\n`,
      `        ss_values = rr.getSteadyStateValues()\n`,
      `        raw_selections = list(getattr(rr, 'steadyStateSelections', []))\n`,
      `        ss_names = []\n`,
      `        for sel in raw_selections:\n`,
      `            if hasattr(sel, 'selection'):\n`,
      `                ss_names.append(str(sel.selection))\n`,
      `            else:\n`,
      `                ss_names.append(str(sel))\n`,
      `        if len(ss_names) != len(ss_values):\n`,
      `            ss_names = [f'value_{i}' for i in range(len(ss_values))]\n`,
      `        print('Steady state values:')\n`,
      `        for name, val in zip(ss_names, ss_values):\n`,
      `            print(f"  {name}: {val}")\n`,
      `    except Exception as e:\n`,
      `        print(f"Steady-state analysis unavailable: {e}")\n`,
      `        print('This can happen for oscillatory systems or unsupported steady-state outputs.')`
    ]
  });

  // 6. Model Structure Analysis
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 3. Model Structure Analysis\n`,
      `Explore the structure of your BioNetGen model.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `# Parse names directly from BNGL text to avoid API-shape assumptions\n`,
      `def parse_parameter_names(text):\n`,
      `    names = []\n`,
      `    in_section = False\n`,
      `    for raw in text.splitlines():\n`,
      `        line = raw.strip()\n`,
      `        low = line.lower()\n`,
      `        if low.startswith('begin parameters'):\n`,
      `            in_section = True\n`,
      `            continue\n`,
      `        if low.startswith('end parameters'):\n`,
      `            break\n`,
      `        if in_section and line and not line.startswith('#'):\n`,
      `            parts = line.split()\n`,
      `            if len(parts) >= 2:\n`,
      `                names.append(parts[0])\n`,
      `    return names\n\n`,
      `param_names = parse_parameter_names(bngl_content)\n`,
      `observable_names = [c for c in sim_df.columns if c != 'time'] if sim_df is not None else []\n`,
      `print('=== MODEL STRUCTURE ===')\n`,
      `print(f'Parameters parsed from BNGL: {len(param_names)}')\n`,
      `print(param_names[:10])\n`,
      `print(f'Observable/result columns: {len(observable_names)}')\n`,
      `print(observable_names[:10])\n`,
      `if rr is not None:\n`,
      `    try:\n`,
      `        print(f'RoadRunner global params: {rr.getGlobalParameterIds()}')\n`,
      `    except Exception:\n`,
      `        pass`
    ]
  });

  // 7. Parameter Scan (1D)
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 4. Parameter Sensitivity Scan (1D)\n`,
      `Explore how varying a single parameter affects the final state of your observables.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `if rr is None:\n`,
      `    print('Skipping parameter scan because rr is unavailable.')\n`,
      `else:\n`,
      `    if len(param_names) == 0:\n`,
      `        rr_params = list(rr.getGlobalParameterIds()) if hasattr(rr, 'getGlobalParameterIds') else []\n`,
      `        param_names = [p for p in rr_params if p.lower() not in ('time')]\n`,
      `    if len(param_names) == 0 or len(observable_names) == 0:\n`,
      `        print('Skipping scan: need at least one parameter and one observable/result column.')\n`,
      `    else:\n`,
      `        param_name = param_names[0]\n`,
      `        target_observable = observable_names[0]\n`,
      `        scan_range = np.logspace(-1, 1, 7)\n`,
      `        print(f'Scanning parameter: {param_name}')\n`,
      `        print(f'Monitoring observable: {target_observable}')\n`,
      `\n`,
      `        baseline = rr[param_name]\n`,
      `        t_end = float(sim_df[time_col].max()) if sim_df is not None and time_col in sim_df.columns else 100.0\n`,
      `        n_steps = max(51, len(sim_df)) if sim_df is not None else 101\n`,
      `        scan_results = []\n`,
      `        for scale in scan_range:\n`,
      `            rr.reset()\n`,
      `            rr[param_name] = max(1e-12, baseline * scale)\n`,
      `            try:\n`,
      `                res = safe_rr_simulate(0, t_end, n_steps)\n`,
      `                obs_data = res[target_observable] if target_observable in res.colnames else res[res.colnames[1]]\n`,
      `                scan_results.append(float(obs_data[-1]))\n`,
      `            except Exception as sim_err:\n`,
      `                print(f'Scan point failed at scale={scale:.3g}: {sim_err}')\n`,
      `                scan_results.append(np.nan)\n`,
      `\n`,
      `        plt.figure(figsize=(8, 5))\n`,
      `        plt.semilogx(scan_range, scan_results, 'o-')\n`,
      `        plt.xlabel(f'Fold-change on {param_name}')\n`,
      `        plt.ylabel(f'Final {target_observable}')\n`,
      `        plt.title(f'1D Parameter Scan: {param_name}')\n`,
      `        plt.grid(True, alpha=0.3)\n`,
      `        plt.show()`
    ]
  });

  // 8. Global Optimization
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 5. Parameter Estimation (Optimization)\n`,
      `Fit your model parameters to experimental data using \`scipy.optimize\`.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `if rr is None or 'param_name' not in globals() or len(observable_names) == 0:\n`,
      `    print('Skipping optimization: run the previous cells first and ensure rr is available.')\n`,
      `else:\n`,
      `    def robust_rr_simulate(start, end, points):\n`,
      `        attempts = [\n`,
      `            ('cvode', float(start), float(end), int(points)),\n`,
      `            ('cvode', float(start), float(end), max(51, int(points)//2)),\n`,
      `            ('rk4', float(start), max(10.0, float(end)*0.5), max(51, int(points)//2)),\n`,
      `            ('rk4', float(start), max(5.0, float(end)*0.25), max(31, int(points)//4)),\n`,
      `        ]\n`,
      `        last_err = None\n`,
      `        for integrator, s, e, p in attempts:\n`,
      `            try:\n`,
      `                rr.setIntegrator(integrator)\n`,
      `            except Exception:\n`,
      `                pass\n`,
      `            try:\n`,
      `                return rr.simulate(s, e, p)\n`,
      `            except Exception as err:\n`,
      `                last_err = err\n`,
      `        print(f'Optimization simulate fallback exhausted: {last_err}')\n`,
      `        return None\n`,
      `\n`,
      `    obs_to_fit = observable_names[0]\n`,
      `    t_exp = np.linspace(0, 100, 21)\n`,
      `\n`,
      `    rr.reset()\n`,
      `    truth = robust_rr_simulate(float(t_exp[0]), float(t_exp[-1]), len(t_exp))\n`,
      `    if truth is None:\n`,
      `        print('Skipping optimization: could not produce stable baseline simulation.')\n`,
      `    else:\n`,
      `        truth_vals = truth[obs_to_fit] if obs_to_fit in truth.colnames else truth[truth.colnames[1]]\n`,
      `        experimental_data = truth_vals + np.random.normal(0, 0.02, len(truth_vals))\n`,
      `        t_exp_data = np.linspace(float(t_exp[0]), float(t_exp[-1]), len(experimental_data))\n`,
      `\n`,
      `        def objective(p):\n`,
      `            rr.reset()\n`,
      `            rr[param_name] = max(1e-12, float(p[0]))\n`,
      `            sim = robust_rr_simulate(float(t_exp[0]), float(t_exp[-1]), len(t_exp))\n`,
      `            if sim is None:\n`,
      `                return 1e15\n`,
      `            sim_vals = sim[obs_to_fit] if obs_to_fit in sim.colnames else sim[sim.colnames[1]]\n`,
      `            return float(np.sum((sim_vals - experimental_data) ** 2))\n`,
      `\n`,
      `        base = float(rr[param_name])\n`,
      `        sweep = np.logspace(np.log10(max(base * 0.1, 1e-12)), np.log10(max(base * 10.0, 1e-11)), 25)\n`,
      `        losses = [objective([candidate]) for candidate in sweep]\n`,
      `        best_idx = int(np.argmin(losses))\n`,
      `        best_p = sweep[best_idx]\n`,
      `        print(f'Best {param_name} from grid search: {best_p}')\n`,
      `\n`,
      `        rr.reset()\n`,
      `        rr[param_name] = float(best_p)\n`,
      `        fitted = robust_rr_simulate(0, 100, 101)\n`,
      `        if fitted is None:\n`,
      `            print('Skipping optimization plot: best-fit simulation failed.')\n`,
      `        else:\n`,
      `            fitted_vals = fitted[obs_to_fit] if obs_to_fit in fitted.colnames else fitted[fitted.colnames[1]]\n`,
      `\n`,
      `            plt.figure(figsize=(8, 5))\n`,
      `            plt.scatter(t_exp_data, experimental_data, label='Synthetic experimental data')\n`,
      `            plt.plot(fitted['time'], fitted_vals, 'r--', label='Best-fit simulation')\n`,
      `            plt.legend()\n`,
      `            plt.title('Parameter Estimation Result')\n`,
      `            plt.xlabel('Time')\n`,
      `            plt.ylabel(obs_to_fit)\n`,
      `            plt.grid(True, alpha=0.3)\n`,
      `            plt.show()`
    ]
  });

  // 9. FIM & Sensitivity
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `## 6. Fisher Information & Sensitivity Analysis\n`,
      `Estimate the sensitivity of model dynamic responses to parameter changes.`
    ]
  });

  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      `if rr is None or 'param_name' not in globals():\n`,
      `    print('Skipping sensitivity analysis: run previous cells first and ensure rr is available.')\n`,
      `else:\n`,
      `    def robust_rr_simulate(start, end, points):\n`,
      `        attempts = [\n`,
      `            ('cvode', float(start), float(end), int(points)),\n`,
      `            ('cvode', float(start), float(end), max(51, int(points)//2)),\n`,
      `            ('rk4', float(start), max(10.0, float(end)*0.5), max(51, int(points)//2)),\n`,
      `            ('rk4', float(start), max(5.0, float(end)*0.25), max(31, int(points)//4)),\n`,
      `        ]\n`,
      `        last_err = None\n`,
      `        for integrator, s, e, p in attempts:\n`,
      `            try:\n`,
      `                rr.setIntegrator(integrator)\n`,
      `            except Exception:\n`,
      `                pass\n`,
      `            try:\n`,
      `                return rr.simulate(s, e, p)\n`,
      `            except Exception as err:\n`,
      `                last_err = err\n`,
      `        print(f'Sensitivity simulate fallback exhausted: {last_err}')\n`,
      `        return None\n`,
      `\n`,
      `    def get_sensitivity(p_name, delta=0.01):\n`,
      `        rr.reset()\n`,
      `        base = float(rr[p_name])\n`,
      `\n`,
      `        rr[p_name] = max(1e-12, base * (1 + delta))\n`,
      `        sim_plus = robust_rr_simulate(0, 100, 101)\n`,
      `\n`,
      `        rr.reset()\n`,
      `        rr[p_name] = max(1e-12, base * (1 - delta))\n`,
      `        sim_minus = robust_rr_simulate(0, 100, 101)\n`,
      `        if sim_plus is None or sim_minus is None:\n`,
      `            return None\n`,
      `\n`,
      `        target = observable_names[0] if len(observable_names) > 0 else sim_plus.colnames[1]\n`,
      `        if target not in sim_plus.colnames:\n`,
      `            target = sim_plus.colnames[1]\n`,
      `\n`,
      `        sens = (sim_plus[target] - sim_minus[target]) / (2 * delta * max(base, 1e-12))\n`,
      `        return sim_plus['time'], sens, target\n`,
      `\n`,
      `    sensitivity_output = get_sensitivity(param_name)\n`,
      `    if sensitivity_output is None:\n`,
      `        print('Skipping sensitivity plot: simulation failed for perturbed parameter values.')\n`,
      `    else:\n`,
      `        t_vals, sens_vals, target_col = sensitivity_output\n`,
      `        plt.figure(figsize=(8, 5))\n`,
      `        plt.plot(t_vals, sens_vals)\n`,
      `        plt.ylabel(f'd[{target_col}] / d[{param_name}]')\n`,
      `        plt.xlabel('Time')\n`,
      `        plt.title('Local Sensitivity Over Time')\n`,
      `        plt.grid(True, alpha=0.3)\n`,
      `        plt.show()`
    ]
  });

  // 10. Final Summary
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `---\n`,
      `**Next Steps**:\n`,
      `- Modify the BNGL string at the top to change model structure.\n`,
      `- Use \`model.rules\` and \`model.species\` to inspect or modify components programmatically.\n`,
      `- Visit [pybionetgen.readthedocs.io](https://pybionetgen.readthedocs.io) for advanced documentation.`
    ]
  });

  const normalizedCells = cells.map((cell) => ({
    ...cell,
    metadata: {
      ...cell.metadata,
      language: cell.cell_type === 'code' ? 'python' : 'markdown'
    }
  }));

  const notebook = {
    cells: normalizedCells,
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3"
      },
      language_info: {
        codemirror_mode: {
          name: "ipython",
          version: 3
        },
        file_extension: ".py",
        mimetype: "text/x-python",
        name: "python",
        nbconvert_exporter: "python",
        pygments_lexer: "ipython3",
        version: "3.10.0"
      }
    },
    nbformat: 4,
    nbformat_minor: 5
  };

  return JSON.stringify(notebook, null, 2);
}
