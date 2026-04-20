# @bngplayground/mcp-server

MCP (Model Context Protocol) server for BioNetGen Language modeling. Exposes 33 tools for AI-assisted model construction, simulation, calibration, verification, and advanced analysis.

## Usage

```bash
npx @bngplayground/mcp-server
```

Installation instructions for MCP clients (Claude Desktop, Cursor, Copilot) are in the repository's [docs/mcp-server.md](../../docs/mcp-server.md).

## Capabilities (33 Tools)

The MCP server supports end-to-end BNGL workflows:

- Core modeling and simulation: `parse_bngl`, `validate_model`, `generate_network`, `get_contact_map`, `simulate`, `parameter_scan`
- Calibration and model reduction: `fit_parameters`, `import_petab`, `reduce_model`
- Sensitivity and inference: `sobol_sensitivity`, `identifiability_analysis`, `bayesian_inference`, `optimal_experiment`
- Intelligence workflows: `compose_model`, `edit_model`, `diagnose_model`, `explain_model`
- Export and external knowledge: `export_model`, `query_pathway_commons`
- Advanced dynamical and formal analysis: `verify_model`, `bifurcation_analysis`, `temporal_analysis`, `symbolic_steady_state`, `compare_models`, `search_structure`, `perturbation_screen`, `dose_response`, `first_passage_time`, `lna_analysis`, `reaction_information_flow`, `qssa_reduction`
- Applied workflows: `pkpd`, `multiscale_simulation`

### Full Tool List

1. `parse_bngl`
2. `generate_network`
3. `simulate`
4. `parameter_scan`
5. `validate_model`
6. `get_contact_map`
7. `fit_parameters`
8. `import_petab`
9. `reduce_model`
10. `query_pathway_commons`
11. `sobol_sensitivity`
12. `identifiability_analysis`
13. `bayesian_inference`
14. `export_model`
15. `compose_model`
16. `edit_model`
17. `diagnose_model`
18. `explain_model`
19. `optimal_experiment`
20. `verify_model`
21. `bifurcation_analysis`
22. `temporal_analysis`
23. `symbolic_steady_state`
24. `compare_models`
25. `search_structure`
26. `pkpd`
27. `multiscale_simulation`
28. `perturbation_screen`
29. `dose_response`
30. `first_passage_time`
31. `lna_analysis`
32. `reaction_information_flow`
33. `qssa_reduction`

The authoritative registry for names/descriptions/input schemas is in `src/index.ts` under `ListToolsRequestSchema`.

Or add to your MCP client configuration:

```json
{
    "mcpServers": {
        "bngplayground": {
            "command": "npx",
            "args": ["@bngplayground/mcp-server"]
        }
    }
}
```

## License

MIT