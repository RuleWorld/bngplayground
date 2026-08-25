# BioNetGen Playground MCP Server

This package exposes the BioNetGen Playground engine as a Model Context Protocol (MCP) server with 44 tools for constructing, validating, simulating, calibrating, analyzing, and exporting BNGL models.

The server currently uses MCP's local `stdio` transport. It is intended for clients that can start a local process, including Claude Desktop, Claude Code, and Codex. ChatGPT chats, Claude.ai, and Claude Cowork use remote MCP connections instead; see [Remote clients](#remote-clients-chatgpt-claudeai-and-cowork).

> **Repository-only package:** `@bngplayground/mcp-server` is not currently published to npm. Do not configure a client with `npx @bngplayground/mcp-server`; launch it from a local clone as described below.

## Prepare the repository

Use Node.js 20 or newer. Install dependencies and build the engine and MCP
server packages from the repository root:

```bash
npm install
npm run build -w @bngplayground/engine
npm run build -w @bngplayground/mcp-server
```

The MCP server build also creates the self-contained HTML bundle used by the
interactive result views. Re-run it after changing files under
`packages/mcp-server/apps/` or the reused chart/contact-map components.

The most reliable local launch uses absolute paths to Node, the repository's `tsx` CLI, and the server source file. Find Node with `command -v node` on macOS/Linux or `where.exe node` on Windows.

| Platform | Command | First argument | Second argument |
| --- | --- | --- | --- |
| macOS | `/absolute/path/to/node` | `/absolute/path/to/julesplayground/node_modules/tsx/dist/cli.mjs` | `/absolute/path/to/julesplayground/packages/mcp-server/src/index.ts` |
| Linux | `/absolute/path/to/node` | `/absolute/path/to/julesplayground/node_modules/tsx/dist/cli.mjs` | `/absolute/path/to/julesplayground/packages/mcp-server/src/index.ts` |
| Windows | `C:\Program Files\nodejs\node.exe` | `C:\absolute\path\to\julesplayground\node_modules\tsx\dist\cli.mjs` | `C:\absolute\path\to\julesplayground\packages\mcp-server\src\index.ts` |

To smoke-test the launch, run the corresponding command in a terminal:

```bash
# macOS or Linux
/absolute/path/to/node \
  /absolute/path/to/julesplayground/node_modules/tsx/dist/cli.mjs \
  /absolute/path/to/julesplayground/packages/mcp-server/src/index.ts
```

```powershell
# Windows PowerShell
& "C:\Program Files\nodejs\node.exe" `
  "C:\absolute\path\to\julesplayground\node_modules\tsx\dist\cli.mjs" `
  "C:\absolute\path\to\julesplayground\packages\mcp-server\src\index.ts"
```

A healthy `stdio` server waits for MCP input and may appear silent. Press Ctrl+C to stop the smoke test. Do not add ordinary logging to stdout because it corrupts the MCP protocol; diagnostics must go to stderr.

## Claude Desktop

Claude Desktop reads a local JSON configuration file:

| Platform | Configuration file |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/Claude/claude_desktop_config.json` |

On macOS or Linux, add this entry using absolute paths from your machine:

```json
{
  "mcpServers": {
    "bngplayground": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/julesplayground/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/julesplayground/packages/mcp-server/src/index.ts"
      ]
    }
  }
}
```

On Windows, JSON backslashes must be escaped:

```json
{
  "mcpServers": {
    "bngplayground": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\absolute\\path\\to\\julesplayground\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\absolute\\path\\to\\julesplayground\\packages\\mcp-server\\src\\index.ts"
      ]
    }
  }
}
```

Preserve any other top-level settings or MCP servers already in the file. Fully quit Claude Desktop, reopen it, and inspect its Developer/Connectors settings to confirm that `bngplayground` is running. Claude Desktop's local configuration does not configure Claude.ai or Cowork.

See Anthropic's [local MCP server guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) for the current Claude Desktop workflow.

## Claude Code

Claude Code can register the same local process. Run one of these commands after replacing every example path:

```bash
# macOS or Linux
claude mcp add bngplayground --scope user -- \
  /absolute/path/to/node \
  /absolute/path/to/julesplayground/node_modules/tsx/dist/cli.mjs \
  /absolute/path/to/julesplayground/packages/mcp-server/src/index.ts
```

```powershell
# Windows PowerShell
claude mcp add bngplayground --scope user -- `
  "C:\Program Files\nodejs\node.exe" `
  "C:\absolute\path\to\julesplayground\node_modules\tsx\dist\cli.mjs" `
  "C:\absolute\path\to\julesplayground\packages\mcp-server\src\index.ts"
```

Verify the saved entry with `claude mcp get bngplayground` and inspect connection status with `/mcp` inside Claude Code.

## Codex

Codex CLI and the Codex desktop app share MCP configuration. Register the server from a terminal:

```bash
# macOS or Linux
codex mcp add bngplayground -- \
  /absolute/path/to/node \
  /absolute/path/to/julesplayground/node_modules/tsx/dist/cli.mjs \
  /absolute/path/to/julesplayground/packages/mcp-server/src/index.ts
```

```powershell
# Windows PowerShell
codex mcp add bngplayground -- `
  "C:\Program Files\nodejs\node.exe" `
  "C:\absolute\path\to\julesplayground\node_modules\tsx\dist\cli.mjs" `
  "C:\absolute\path\to\julesplayground\packages\mcp-server\src\index.ts"
```

Verify it with `codex mcp get bngplayground`. Start a new Codex task or restart the client after changing MCP configuration because an already-running task may retain its original tool inventory. See the official [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for configuration details.

## Remote clients: ChatGPT, Claude.ai, and Cowork

The local commands above cannot be pasted into a remote connector form.

- **ChatGPT chats/custom MCP apps:** deploy the server behind a public HTTPS **Streamable HTTP** MCP endpoint, or expose it with OpenAI's Secure MCP Tunnel. Enable developer mode, create the app/plugin, and enter that endpoint URL. The present repository server only implements `stdio`, so direct ChatGPT connection requires a transport/deployment adapter first. See OpenAI's [connect and test guide](https://developers.openai.com/plugins/deploy/connect-chatgpt/).
- **Claude.ai and Claude Cowork:** add a remote custom connector URL under Customize > Connectors. A local Claude Desktop `claude_desktop_config.json` entry is not available to these products. The present `stdio` server must likewise be hosted behind a supported remote MCP endpoint. See Anthropic's [remote MCP connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

The hosted endpoint and its authentication policy are deployment concerns and are not currently included in this package.

## Interactive result views (MCP Apps)

The `simulate` and `get_contact_map` tools advertise MCP App resources. A host
that supports the official `io.modelcontextprotocol/ui` extension can render:

- simulation trajectories with series toggling, isolation, scaling, and zoom;
- contact maps with the existing Cytoscape layouts and fit controls.

Both views reuse the website's React components and are bundled into one
self-contained, sandboxed HTML resource. The resource declares no network,
frame, or external asset origins. Hosts without MCP Apps support continue to
receive the same text and `structuredContent` tool results; the UI metadata is
an optional enhancement rather than a new requirement.

## Capabilities (44 tools)

The authoritative names, descriptions, and input schemas are registered in [`src/index.ts`](src/index.ts).

- Core lifecycle (6): `parse_bngl`, `generate_network`, `simulate`, `parameter_scan`, `validate_model`, `get_contact_map`
- Calibration and reduction (4): `fit_parameters`, `import_petab`, `reduce_model`, `qssa_reduction`
- Sensitivity, inference, and design (5): `sobol_sensitivity`, `identifiability_analysis`, `bayesian_inference`, `optimal_experiment`, `compute_fim`
- Intelligence and diagnostics (8): `compose_model`, `edit_model`, `diagnose_model`, `explain_model`, `suggest_fix`, `diagnose`, `analyze_residuals`, `assess_model_maturity`
- Verification and dynamics (8): `verify_model`, `bifurcation_analysis`, `temporal_analysis`, `symbolic_steady_state`, `compare_models`, `search_structure`, `check_hysteresis`, `check_phase_handoff`
- Applied analysis (7): `pkpd`, `multiscale_simulation`, `perturbation_screen`, `dose_response`, `first_passage_time`, `lna_analysis`, `reaction_information_flow`
- Export and integration (6): `export_model`, `export_omex`, `export_sbml`, `export_sedml`, `suggest_annotations`, `query_pathway_commons`

Example requests to an MCP-enabled assistant include:

- “Validate this BNGL model and explain every error.”
- “Simulate this model with SSA from 0 to 100 seconds and return only observables.”
- “Run a parameter scan over `k_on` and compare the peak response.”
- “Export this model as SBML and suggest appropriate annotations.”

For token-efficient simulations, set `output_mode` to `observables_only`. The default `full` mode also returns expanded network and species trajectory data.

## Troubleshooting

- **`npm` returns 404 for `@bngplayground/mcp-server`:** the package is not published. Use a local clone and the source launch documented above.
- **`ERR_MODULE_NOT_FOUND` mentions `@bngplayground/engine`:** run `npm install` and then `npm run build -w @bngplayground/engine` from the repository root.
- **The client cannot find Node or `tsx`:** use absolute paths. Confirm that the Node executable, `node_modules/tsx/dist/cli.mjs`, and `packages/mcp-server/src/index.ts` all exist.
- **The server disconnects immediately:** run the exact command manually and inspect stderr. Check for malformed JSON, unescaped Windows backslashes, stale paths, or a missing engine build.
- **The client still shows an old tool list:** fully restart Claude Desktop, or start a new Codex/Claude Code session after changing the MCP configuration.
- **An interactive result says its bundle is unavailable:** run `npm run build -w @bngplayground/mcp-server` from the repository root, then restart the MCP client.
- **Random timeouts from a cloud-synced checkout:** MCP startup reads many repository and dependency files. Keep the clone and `node_modules` fully downloaded, mark them “Always Keep on This Device,” or move the clone to a non-synced local directory. Cloud placeholders can cause intermittent startup and module-resolution failures.
- **Claude Desktop logs:** use its Developer settings to open the MCP logs and inspect the `bngplayground` server's stderr output.

## License

MIT
