import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import type { PlatformAdapter, MCPServerConfig, SetupResult } from "./types.js";

const SERVER_NAME = "graperoot";

export function findPython(): string | null {
  const candidates = ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const match = version.match(/Python (\d+)\.(\d+)/);
      if (match && parseInt(match[1]) >= 3 && parseInt(match[2]) >= 10) {
        return cmd;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function findGraperootVenv(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const venvPython = join(home, ".dual-graph", "venv", "Scripts", "python.exe");
  const venvPythonUnix = join(home, ".dual-graph", "venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  if (existsSync(venvPythonUnix)) return venvPythonUnix;
  return null;
}

export function getMCPServerCommand(): string[] {
  const venvPython = findGraperootVenv();
  if (venvPython) {
    const scriptPath = join(dirname(dirname(venvPython)), "..", "..");
    return [venvPython, "-m", "graperoot.mcp_graph_server"];
  }

  const python = findPython();
  if (python) {
    return [python, "-m", "graperoot.mcp_graph_server"];
  }

  throw new Error(
    "Python >=3.10 not found. Install Python or run the GrapeRoot installer first."
  );
}

export function buildMCPConfig(): MCPServerConfig {
  const command = getMCPServerCommand();
  return { command };
}

function readJsonConfig(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readJsoncConfig(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf-8");
  const stripped = raw
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(stripped);
  } catch {
    return {};
  }
}

function writeJsonConfig(
  filePath: string,
  data: Record<string, unknown>,
  isJsonc: boolean = false
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (isJsonc && existsSync(filePath)) {
    const original = readFileSync(filePath, "utf-8");
    const jsonStr = JSON.stringify(data, null, 2);
    writeFileSync(filePath, jsonStr + "\n", "utf-8");
    return;
  }

  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function configurePlatform(
  platform: PlatformAdapter,
  config: MCPServerConfig
): SetupResult {
  const filePath = platform.globalConfigPath;

  try {
    const data = platform.isJsonc
      ? readJsoncConfig(filePath)
      : readJsonConfig(filePath);

    const rootKey = platform.rootKey;
    let servers = data[rootKey] as Record<string, unknown> | undefined;

    if (!servers) {
      servers = {};
      data[rootKey] = servers;
    }

    if (platform.isArrayFormat) {
      const arr = Array.isArray(servers) ? servers : [];
      const idx = arr.findIndex(
        (e: Record<string, unknown>) => e.name === SERVER_NAME
      );
      const entry = platform.buildMCPEntry(config);
      if (idx >= 0) {
        arr[idx] = entry as Record<string, unknown>;
      } else {
        arr.push(entry as Record<string, unknown>);
      }
      data[rootKey] = arr;
    } else {
      const entry = platform.buildMCPEntry(config);
      (servers as Record<string, unknown>)[SERVER_NAME] = entry;
    }

    writeJsonConfig(filePath, data, platform.isJsonc);

    return { platform: platform.name, configPath: filePath, success: true };
  } catch (error) {
    return {
      platform: platform.name,
      configPath: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
