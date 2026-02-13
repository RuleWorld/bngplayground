/**
 * Jupyter Notebook (.ipynb) Generation Utility
 * 
 * Generates a complete analysis notebook using pybionetgen and libroadrunner.
 */

interface NotebookCell {
  cell_type: 'markdown' | 'code';
  metadata: Record<string, any>;
  source: string[];
}

export function generateJupyterNotebookContent(bnglCode: string, modelName: string): string {
  const cells: NotebookCell[] = [];

  // 1. Header
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `# BioNetGen Analysis: ${modelName}\n`,
      `This notebook provides a complete simulation and analysis suite for the **${modelName}** model. It uses \`pybionetgen\` for rule-based processing and \`libroadrunner\` for high-performance ODE integration.`
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
      `bngl_content = """${bnglCode}"""\n\n`,
      `with open(model_file, "w") as f:\n`,
      `    f.write(bngl_content)\n\n`,
      `print(f"Model saved to {model_file}")`
    ]
  });

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
      `# Run the model\n`,
      `results = bionetgen.run(model_file)\n`,
      `# Access results by model name (without extension)\n`,
      `base_name = os.path.splitext(model_file)[0]\n`,
      `data = results[base_name]  # numpy recarray\n\n`,
      `# Plot results\n`,
      `def plot_data(rec_array, title="Time Courses"):\n`,
      `    names = rec_array.dtype.names\n`,
      `    time = rec_array[names[0]]\n`,
      `    plt.figure()\n`,
      `    for i in range(1, len(names)):\n`,
      `        plt.plot(time, rec_array[names[i]], label=names[i])\n`,
      `    plt.xlabel(names[0])\n`,
      `    plt.ylabel("Value")\n`,
      `    plt.title(title)\n`,
      `    plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')\n`,
      `    plt.tight_layout()\n`,
      `    plt.show()\n\n`,
      `plot_data(data, f"Simulation: {model_name}")`
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
      `rr = model.setup_simulator()\n\n`,
      `# Run a simulation [start, end, points]\n`,
      `rr_data = rr.simulate(0, 100, 101)\n\n`,
      `# Plot with matplotlib\n`,
      `plt.figure(figsize=(10, 6))\n`,
      `for col in rr_data.colnames[1:]:  # Skip time column\n`,
      `    plt.plot(rr_data['time'], rr_data[col], label=col)\n`,
      `plt.xlabel('Time')\n`,
      `plt.ylabel('Concentration')\n`,
      `plt.title(f'ODE Simulation: {model_name}')\n`,
      `plt.legend()\n`,
      `plt.grid(True, alpha=0.3)\n`,
      `plt.show()`
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
      `# Reset to initial conditions\n`,
      `rr.reset()\n\n`,
      `# Find steady state\n`,
      `try:\n`,
      `    steady_state = rr.steadyState()\n`,
      `    print(f"Steady state found with residual: {steady_state}")\n`,
      `    \n`,
      `    # Get steady state values\n`,
      `    ss_values = rr.getSteadyStateValues()\n`,
      `    ss_names = [sel.selection for sel in rr.steadyStateSelections]\n`,
      `    \n`,
      `    print("Steady state values:")\n`,
      `    for name, val in zip(ss_names, ss_values):\n`,
      `        print(f"  {name}: {val}")\n`,
      `        \n`,
      `except Exception as e:\n`,
      `    print(f"Could not find steady state: {e}")\n`,
      `    print("This might be expected for oscillatory systems.")`
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
      `# Print model structure information\n`,
      `print("=== MODEL STRUCTURE ===")\n`,
      `print(f"Parameters: {len(model.parameters)}")\n`,
      `param_count = 0\n`,
      `for param in model.parameters:\n`,
      `    if param_count >= 5:\n`,
      `        break\n`,
      `    print(f"  {param}: {model.parameters[param]}")\n`,
      `    param_count += 1\n`,
      `if len(model.parameters) > 5:\n`,
      `    print(f"  ... and {len(model.parameters) - 5} more")\n`,
      `\n`,
      `print(f"\\nObservables: {len(model.observables)}")\n`,
      `obs_count = 0\n`,
      `for obs in model.observables:\n`,
      `    if obs_count >= 3:\n`,
      `        break\n`,
      `    try:\n`,
      `        if hasattr(model.observables, obs) and callable(getattr(model.observables, obs, None)):\n`,
      `            obs_info = model.observables[obs]\n`,
      `        else:\n`,
      `            obs_info = getattr(model.observables, obs, None)\n`,
      `        if obs_info and len(obs_info) > 1:\n`,
      `            print(f"  {obs}: {obs_info[1]}")  # obs_info[0] is type, [1] is pattern\n`,
      `        else:\n`,
      `            print(f"  {obs}: (pattern not available)")\n`,
      `        obs_count += 1\n`,
      `    except:\n`,
      `        print(f"  {obs}: (could not access details)")\n`,
      `if len(model.observables) > 3:\n`,
      `    print(f"  ... and {len(model.observables) - 3} more")\n`,
      `\n`,
      `print(f"\\nSpecies: {len(model.species)}")\n`,
      `for spec in list(model.species)[:3]:\n`,
      `    print(f"  {spec}: {model.species[spec]}")\n`,
      `if len(model.species) > 3:\n`,
      `    print(f"  ... and {len(model.species) - 3} more")\n`,
      `\n`,
      `print(f"\\nReaction Rules: {len(model.rules)}")\n`,
      `for rule_name in list(model.rules)[:2]:\n`,
      `    rule = model.rules[rule_name]\n`,
      `    print(f"  {rule_name}: {rule.reactants} -> {rule.products}")\n`,
      `if len(model.rules) > 2:\n`,
      `    print(f"  ... and {len(model.rules) - 2} more")`
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
      `# Pick a parameter to scan (change 'k' to your target parameter)\n`,
      `param_name = list(model.parameters)[0] \n`,
      `scan_range = np.logspace(-1, 2, 5)\n`,
      `target_observable = list(model.observables)[0]\n`,
      `print(f"Scanning parameter: {param_name}")\n`,
      `print(f"Monitoring observable: {target_observable}")\n`,
      `print(f"Available result columns: {rr.timeCourseSelections}")\n\n`,
      `scan_results = []\n`,
      `for val in scan_range:\n`,
      `    # We can either re-run with BNG or use RoadRunner for speed\n`,
      `    # For this sweep, we'll use RoadRunner\n`,
      `    rr.reset()\n`,
      `    rr[param_name] = val\n`,
      `    res = rr.simulate(0, 100, 50)\n`,
      `    # Store final value of target observable\n`,
      `    obs_data = None\n`,
      `    try:\n`,
      `        obs_data = res[target_observable]\n`,
      `    except (KeyError, IndexError, TypeError):\n`,
      `        # If direct access fails, try alternative column names\n`,
      `        col_names = [col for col in res.colnames if target_observable in col or col in target_observable]\n`,
      `        if col_names:\n`,
      `            obs_data = res[col_names[0]]\n`,
      `            target_observable = col_names[0]  # Update to matched column\n`,
      `        else:\n`,
      `            print(f"Warning: Could not find column for {target_observable}, using first available")\n`,
      `            obs_data = res[res.colnames[1]]  # Skip time column\n`,
      `            target_observable = res.colnames[1]\n`,
      `    \n`,
      `    if obs_data is not None:\n`,
      `        if hasattr(obs_data, '__len__') and len(obs_data) > 0:\n`,
      `            final_val = float(obs_data[-1])\n`,
      `        else:\n`,
      `            final_val = float(obs_data)  # If it's a scalar\n`,
      `    else:\n`,
      `        final_val = 0.0  # Fallback\n`,
      `    scan_results.append(final_val)\n\n`,
      `plt.figure(figsize=(8, 5))\n`,
      `plt.semilogx(scan_range, scan_results, 'o-')\n`,
      `plt.xlabel(f"Parameter: {param_name}")\n`,
      `plt.ylabel(f"Final {target_observable}")\n`,
      `plt.title(f"1D Parameter Scan: {param_name}")\n`,
      `plt.grid(True, alpha=0.3)\n`,
      `plt.show()`
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
      `# 1. Define objective function\n`,
      `def objective(params, names, target_data, t_points):\n`,
      `    rr.reset()\n`,
      `    for name, val in zip(names, params):\n`,
      `        rr[name] = max(1e-9, val) # Ensure non-negative\n`,
      `    try:\n`,
      `        sim = rr.simulate(t_points[0], t_points[-1], len(t_points))\n`,
      `        # Sum of squared errors across all target observables\n`,
      `        error = 0\n`,
      `        for obs, target_vals in target_data.items():\n`,
      `            try:\n`,
      `                sim_vals = sim[obs]\n`,
      `                if hasattr(sim_vals, '__len__') and len(sim_vals) > 0:\n`,
      `                    error += np.sum((sim_vals - target_vals)**2)\n`,
      `                else:\n`,
      `                    error += (float(sim_vals) - target_vals[0])**2\n`,
      `            except (KeyError, IndexError, TypeError):\n`,
      `                error += 1e6  # Large penalty for missing observables\n`,
      `        return error\n`,
      `    except:\n`,
      `        return 1e12 # Failure penalty\n\n`,
      `# 2. Example fit\n`,
      `# Setup dummy data for demonstration (using current parameter values as 'truth')\n`,
      `t_exp = np.linspace(0, 100, 11)\n`,
      `rr.reset()\n`,
      `truth_data = rr.simulate(0, 100, 11)\n`,
      `obs_to_fit = list(model.observables)[0]\n`,
      `print(f"Fitting observable: {obs_to_fit}")\n`,
      `print(f"Available result columns: {truth_data.colnames}")\n`,
      `try:\n`,
      `    truth_vals = truth_data[obs_to_fit]\n`,
      `    if hasattr(truth_vals, '__len__') and len(truth_vals) > 0:\n`,
      `        exp_data = truth_vals + np.random.normal(0, 0.05, len(truth_vals))\n`,
      `    else:\n`,
      `        exp_data = np.array([float(truth_vals)]) + np.random.normal(0, 0.05, 1)\n`,
      `except (KeyError, IndexError, TypeError):\n`,
      `    # If direct access fails, try alternative column names\n`,
      `    col_names = [col for col in truth_data.colnames if obs_to_fit in col or col in obs_to_fit]\n`,
      `    if col_names:\n`,
      `        truth_vals = truth_data[col_names[0]]\n`,
      `        if hasattr(truth_vals, '__len__') and len(truth_vals) > 0:\n`,
      `            exp_data = truth_vals + np.random.normal(0, 0.05, len(truth_vals))\n`,
      `        else:\n`,
      `            exp_data = np.array([float(truth_vals)]) + np.random.normal(0, 0.05, 1)\n`,
      `        obs_to_fit = col_names[0]  # Update to matched column\n`,
      `    else:\n`,
      `        print(f"Warning: Could not find column for {obs_to_fit}, using first available")\n`,
      `        truth_vals = truth_data[truth_data.colnames[1]]  # Skip time\n`,
      `        if hasattr(truth_vals, '__len__') and len(truth_vals) > 0:\n`,
      `            exp_data = truth_vals + np.random.normal(0, 0.05, len(truth_vals))\n`,
      `        else:\n`,
      `            exp_data = np.array([float(truth_vals)]) + np.random.normal(0, 0.05, 1)\n`,
      `        obs_to_fit = truth_data.colnames[1]\n`,
      `experimental_data = { obs_to_fit: exp_data }\n\n`,
      `# 3. run optimizer\n`,
      `p_to_fit = [param_name]\n`,
      `initial_guess = [rr[param_name] * 0.5]\n`,
      `res = brute(objective, (slice(initial_guess[0]/10, initial_guess[0]*10, initial_guess[0]/2),), \n`,
      `            args=(p_to_fit, experimental_data, t_exp), full_output=True, finish=None)\n\n`,
      `best_p = res[0]\n`,
      `print(f"Optimal parameter found: {best_p}")\n\n`,
      `# 4. Plot comparison\n`,
      `rr.reset()\n`,
      `rr[param_name] = best_p\n`,
      `fitted_sim = rr.simulate(0, 100, 101)\n`,
      `plt.scatter(t_exp, experimental_data[obs_to_fit], label="Exp Data")\n`,
      `plt.plot(fitted_sim['time'], fitted_sim[obs_to_fit], 'r--', label="Fitted Model")\n`,
      `plt.legend()\n`,
      `plt.title("Parameter Estimation Result")\n`,
      `plt.show()`
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
      `# Compute local sensitivity via finite differences\n`,
      `def get_sensitivity(p_name, delta=0.01):\n`,
      `    rr.reset()\n`,
      `    val = rr[p_name]\n`,
      `    \n`,
      `    rr[p_name] = val * (1 + delta)\n`,
      `    sim_plus = rr.simulate(0, 100, 101)\n`,
      `    \n`,
      `    rr.reset()\n`,
      `    rr[p_name] = val * (1 - delta)\n`,
      `    sim_minus = rr.simulate(0, 100, 101)\n`,
      `    \n`,
      `    # Calculate sensitivity for each column\n`,
      `    time_vals = sim_plus['time']\n`,
      `    result = {'time': time_vals}\n`,
      `    for col in sim_plus.colnames[1:]:  # Skip time\n`,
      `        sens_col = (sim_plus[col] - sim_minus[col]) / (2 * delta * val)\n`,
      `        result[col] = sens_col\n`,
      `    return result\n\n`,
      `# Use the same parameter and observable from earlier cells\n`,
      `param_name = list(model.parameters)[0]\n`,
      `obs_to_fit = list(model.observables)[0]\n`,
      `sens_data = get_sensitivity(param_name)\n`,
      `print(f"Available sensitivity columns: {list(sens_data.keys())}")\n`,
      `print(f"Looking for observable: {obs_to_fit}")\n`,
      `# Find the best matching column for the observable\n`,
      `obs_col = None\n`,
      `for col in sens_data.keys():\n`,
      `    if col != 'time' and (obs_to_fit in col or col in obs_to_fit):\n`,
      `        obs_col = col\n`,
      `        break\n`,
      `if obs_col is None and len([k for k in sens_data.keys() if k != 'time']) > 0:\n`,
      `    obs_col = [k for k in sens_data.keys() if k != 'time'][0]  # Use first available\n`,
      `    print(f"Using fallback column: {obs_col}")\n`,
      `if obs_col:\n`,
      `    plt.plot(sens_data['time'], sens_data[obs_col])\n`,
      `    plt.ylabel(f"d[{obs_col}] / d[{param_name}]")\n`,
      `    plt.title("Local Sensitivity Over Time")\n`,
      `    plt.grid(True, alpha=0.3)\n`,
      `    plt.show()\n`,
      `else:\n`,
      `    print("No suitable sensitivity data found to plot.")`
    ]
  });

  // 10. Final Summary
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `--- \n`,
      `**Next Steps**:\n`,
      `- Modify the BNGL string at the top to change model structure.\n`,
      `- Use \`model.rules\` and \`model.species\` to inspect or modify components programmatically.\n`,
      `- Visit [pybionetgen.readthedocs.io](https://pybionetgen.readthedocs.io) for advanced documentation.`
    ]
  });

  const notebook = {
    cells: cells,
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
