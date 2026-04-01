# @ruleworld/mcp-server

MCP (Model Context Protocol) server for BioNetGen Language modeling. Exposes 19 tools for AI-assisted biological model construction, simulation, and analysis.

## Usage

```bash
npx @ruleworld/mcp-server
```

Or add to your MCP client configuration:

```json
{
    "mcpServers": {
        "bngplayground": {
            "command": "npx",
            "args": ["@ruleworld/mcp-server"]
        }
    }
}
```

## License

MIT