# 🍇 GrapeRoot MCP

Configure [GrapeRoot](https://graperoot.dev/)'s dual-graph MCP server for **any** AI coding assistant — one command, all platforms.

## What It Does

GrapeRoot provides intelligent codebase navigation via a dual-graph (information graph + action graph). This package:

1. **Adds GrapeRoot's MCP server globally** to your AI assistant's config
2. **Injects tool instructions** into `AGENTS.md`/`CLAUDE.md` so the AI knows how to use the tools
3. Supports **10 platforms**: OpenCode, Claude Code, Cline, Cursor, Windsurf, Aider, Continue, KiloCode, Qoder, Antigravity

## Quick Start

```bash
npx graperoot-mcp setup
```

That's it. You'll see an interactive picker to select which AI assistants to configure.

## Prerequisites

- **Python >=3.10** must be installed
- **GrapeRoot** should be installed first ([install guide](https://graperoot.dev/)):
  ```bash
  # macOS/Linux
  curl -sSL https://raw.githubusercontent.com/kunal12203/Codex-CLI-Compact/main/install.sh | bash

  # Windows (PowerShell)
  irm https://raw.githubusercontent.com/kunal12203/Codex-CLI-Compact/main/install.ps1 | iex
  ```

## Supported Platforms

| Platform | Global Config | Stdio | HTTP |
|----------|--------------|-------|------|
| OpenCode | `~/.config/opencode/opencode.json` | ✅ | ✅ |
| Claude Code | `~/.claude.json` | ✅ | ✅ |
| Cline | `~/.cline/data/settings/cline_mcp_settings.json` | ✅ | ✅ |
| Cursor | `~/.cursor/mcp.json` | ✅ | ✅ |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | ✅ | ✅ |
| Aider | `~/.aider/mcp_servers.json` | ✅ | ❌ |
| Continue | `~/.continue/config.json` | ✅ | ✅ |
| KiloCode | `~/.config/kilo/kilo.jsonc` | ✅ | ✅ |
| Qoder | `%APPDATA%\Qoder\mcp-settings.json` | ✅ | ✅ |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | ✅ | ✅ |

## How It Works

### Architecture

```
┌─────────────────────────────────────┐
│  graperoot-mcp (npm CLI)            │
│  - Interactive platform selector    │
│  - Writes MCP config to each        │
│    assistant's global config file   │
│  - Injects AGENTS.md instructions  │
└──────────────┬──────────────────────┘
               │ configures
               ▼
┌─────────────────────────────────────┐
│  AI Assistant (Claude Code, etc.)   │
│  - Reads MCP config on startup     │
│  - Spawns GrapeRoot MCP process    │
└──────────────┬──────────────────────┘
               │ spawns via stdio
               ▼
┌─────────────────────────────────────┐
│  GrapeRoot MCP Server (Python)      │
│  - FastMCP stdio transport          │
│  - 10 graph navigation tools        │
│  - Auto-detects project root        │
│  - Lazy .dual-graph/ init           │
└─────────────────────────────────────┘
```

### Project Root Detection

The MCP server automatically finds your project by searching upward from the current directory for:
1. `DG_DATA_DIR` environment variable (if set)
2. `.dual-graph/` directory
3. `.git/` directory
4. Falls back to current working directory

### Per-Project Setup

After global config, run `graph_scan` from within your AI assistant to initialize the dual-graph for a specific project. This creates `.dual-graph/` with the info graph.

## MCP Tools

| Tool | Description |
|------|-------------|
| `graph_retrieve(query)` | Retrieve ranked files/edges — call BEFORE reading files |
| `graph_read(file)` | Read one file from project root |
| `graph_neighbors(file)` | Return graph edges touching a file |
| `graph_impact(changed_files)` | Return files likely impacted by edits |
| `graph_register_edit(files)` | Register edited files into action graph |
| `graph_action_summary(query?)` | Recent action graph summary |
| `graph_continue(query)` | Continue conversation using action memory |
| `fallback_rg(pattern)` | Controlled fallback grep |
| `graph_add_memory(type, content)` | Add persistent memory note |
| `graph_scan(project_root)` | Scan project and build info graph |

## Auto-Updates

GrapeRoot automatically checks for updates every time you run `dgc .` or `dg .`. No separate update command needed.

## Development

```bash
git clone https://github.com/sanveer-dev/graperoot-mcp.git
cd graperoot-mcp
npm install
npm run build
node dist/cli.js setup
```

## License

MIT
