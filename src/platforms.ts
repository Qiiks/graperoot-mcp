import { homedir } from "node:os";
import { join } from "node:path";
import type { MCPServerConfig, PlatformAdapter } from "./types.js";

const HOME = homedir();

export const opencode: PlatformAdapter = {
  id: "opencode",
  name: "OpenCode",
  globalConfigPath: join(HOME, ".config", "opencode", "opencode.json"),
  rootKey: "mcp",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      type: "local",
      command: config.command,
      ...(config.env && { env: config.env }),
    };
  },
};

export const claudeCode: PlatformAdapter = {
  id: "claude-code",
  name: "Claude Code",
  globalConfigPath: join(HOME, ".claude.json"),
  projectConfigPath: ".mcp.json",
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      type: "stdio",
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const cline: PlatformAdapter = {
  id: "cline",
  name: "Cline",
  globalConfigPath: join(
    HOME, ".cline", "data", "settings", "cline_mcp_settings.json"
  ),
  projectConfigPath: ".cline_mcp_servers.json",
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const cursor: PlatformAdapter = {
  id: "cursor",
  name: "Cursor",
  globalConfigPath: join(HOME, ".cursor", "mcp.json"),
  projectConfigPath: join(".cursor", "mcp.json"),
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const windsurf: PlatformAdapter = {
  id: "windsurf",
  name: "Windsurf",
  globalConfigPath: join(
    HOME, ".codeium", "windsurf", "mcp_config.json"
  ),
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const aider: PlatformAdapter = {
  id: "aider",
  name: "Aider",
  globalConfigPath: join(HOME, ".aider", "mcp_servers.json"),
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: false,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      type: "stdio",
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const cont: PlatformAdapter = {
  id: "continue",
  name: "Continue",
  globalConfigPath: join(HOME, ".continue", "config.json"),
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,
  isArrayFormat: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      name: "graperoot",
      type: "stdio",
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const kilocode: PlatformAdapter = {
  id: "kilocode",
  name: "KiloCode",
  globalConfigPath: join(HOME, ".config", "kilo", "kilo.jsonc"),
  rootKey: "mcp",
  supportsStdio: true,
  supportsHttp: true,
  isJsonc: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      command: config.command,
    };
  },
};

export const qoder: PlatformAdapter = {
  id: "qoder",
  name: "Qoder",
  globalConfigPath: join(
    process.env.APPDATA || join(HOME, "AppData", "Roaming"),
    "Qoder", "mcp-settings.json"
  ),
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const antigravity: PlatformAdapter = {
  id: "antigravity",
  name: "Antigravity",
  globalConfigPath: join(
    HOME, ".gemini", "antigravity", "mcp_config.json"
  ),
  rootKey: "mcpServers",
  supportsStdio: true,
  supportsHttp: true,

  buildMCPEntry(config: MCPServerConfig) {
    return {
      command: config.command[0],
      args: config.command.slice(1),
      ...(config.env && { env: config.env }),
    };
  },
};

export const allPlatforms: PlatformAdapter[] = [
  opencode,
  claudeCode,
  cline,
  cursor,
  windsurf,
  aider,
  cont,
  kilocode,
  qoder,
  antigravity,
];
