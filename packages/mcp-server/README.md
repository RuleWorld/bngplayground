# @bngplayground/mcp-server

MCP (Model Context Protocol) server for BioNetGen Language modeling. Exposes 19 tools for AI-assisted biological model construction, simulation, and analysis.

## Usage

```bash
npx @bngplayground/mcp-server
```

Installation instructions for MCP clients (Claude Desktop, Cursor, Copilot) are in the repository's [docs/mcp-server.md](../../docs/mcp-server.md).

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