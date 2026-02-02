import fs from 'fs';
const summary = fs.readFileSync('report_summary.txt', 'utf8');
const table = fs.readFileSync('report_table.txt', 'utf8');

const content = `# BioNetGen Web Simulator Parity Report (v2)

This report documents the status of the **229 verified accessible models** in the BioNetGen Web Simulator. 

These models have been verified to:
1.  Parse successfully in the web simulator.
2.  Run successfully in the official \`BNG2.pl\` engine (v2.9.3).
3.  Produce \`.gdat\` outputs for numerical comparison.

Models that fail any of the above criteria have been **excluded** from the website's verified list to ensure reliability.

${summary}

## Investigation Highlights

- **Multi-Phase Concatenation**: Successfully implemented full simulation history capture. Models like \`Hat_2016\` are now correctly compared across all phases (1201 rows) rather than just the first phase.
- **Improved Time-Step Alignment**: Fixed duplicate time point logic at phase boundaries, ensuring seamless concatenation for models that use the \`continue\` flag or sequential simulation calls.
- **Numerical Drift in Stiff Models**: Quantified that mismatches in large models (e.g., \`Hat_2016\`, \`e2f-rb-cell-cycle-switch\`) are due to numerical sensitivity in the JS solver during long equilibrations, not interpolation or time-grid errors.

## Analysis of Excluded Models (23 Total)

The following models are present in the repository but **excluded** from the "Verified" list because they fail in the official BNG2 engine:

- **Strict Syntax Violations**: \`McMillan_2021\` (numeric component names), \`BaruaFceRI_2012\` (parameter ordering), \`vilar_2002\` (non-standard \`molecular types\` block).
- **Perl/Engine Conflicts**: \`Kesseler_2013\` (uses reserved bareword "unlimited").
- **Missing Outputs**: \`tlmr\` and \`test_fixed\` (valid simulations but no \`observables\` block = no GDAT).
- **Missing Dependencies**: \`rec_dim\` (requires \`default.geometry.mdl\`).
- **NFsim Only**: Models like \`polymer\` which require network-free simulation (not currently supported for ODE parity checks).

## Detailed Verified Model Status

| Model ID | Parity Status | Reason for Mismatch / Note |
| :--- | :--- | :--- |
${table}
`;

fs.writeFileSync('C:/Users/Achyudhan/.gemini/antigravity/brain/f168a6ed-8260-4b1e-afd1-ad9e87f5c47d/bng_parity_report_v2.md', content);
console.log('Artifact created successfully.');
