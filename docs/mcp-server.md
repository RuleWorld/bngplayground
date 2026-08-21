# MCP Server Installation

This guide shows how to connect the BioNetGen Playground MCP server to Claude Desktop, Cursor, and Copilot.

## Prerequisites

- Node.js 18+
- Local clone of this repository
- Dependencies installed from repository root:

```bash
npm install
```

For local source launches, build the engine package once so runtime imports resolve:

```bash
npm run build -w @bngplayground/engine
```

## Server Command (Recommended)

Use the local source entrypoint during development:

- Command (Windows):

```text
C:\Users\<you>\AppData\Roaming\npm\tsx.cmd
```

- Argument:

```text
<repo>\packages\mcp-server\src\index.ts
```

If your setup already has tsx on PATH, you can use command `tsx` with the same argument.

## Claude Desktop

Edit the Claude Desktop MCP config file:

- Windows path:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

Add a server entry under `mcpServers`:

```json
{
  "mcpServers": {
    "bngplayground": {
      "command": "C:\\Users\\<you>\\AppData\\Roaming\\npm\\tsx.cmd",
      "args": [
        "<repo>\\packages\\mcp-server\\src\\index.ts"
      ]
    }
  }
}
```

Restart Claude Desktop after saving.

## Cursor

Open Cursor MCP server settings and add a custom stdio server using the same command and args:

- command: `C:\\Users\\<you>\\AppData\\Roaming\\npm\\tsx.cmd`
- args: `<repo>\\packages\\mcp-server\\src\\index.ts`
- server name: `bngplayground`

Then restart Cursor.

## Copilot (VS Code)

In VS Code with GitHub Copilot Chat:

1. Open Command Palette.
2. Run MCP server management command(s) to add a custom stdio server.
3. Configure command and args with the same values shown above.
4. Restart VS Code.

If you store MCP config in workspace or user settings, use the same `bngplayground` command/args values.

## Troubleshooting

- `ERR_MODULE_NOT_FOUND` for `@bngplayground/engine/dist/index.js`:
  - Run `npm run build -w @bngplayground/engine`
- `tsx` not found:
  - Install globally: `npm i -g tsx`
  - Or use the full path to `tsx.cmd`
- Server exits immediately:
  - Confirm the repository path in args is correct
  - Confirm dependencies are installed from repository root (`npm install`)
