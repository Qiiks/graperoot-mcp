import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

export function isGraperootInstalled(python: string): boolean {
  try {
    execSync(`${python} -c "import graperoot" 2>&1`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

export function installGraperoot(python: string): boolean {
  try {
    execSync(`${python} -m pip install graperoot --quiet 2>&1`, {
      encoding: "utf-8",
      timeout: 120000,
    });
    return true;
  } catch {
    return false;
  }
}

function getPackagedWrapperPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(dirname(currentFile)), "python", "graperoot_mcp_server.py");
}

function getInstalledWrapperPath(): string {
  const home = homedir();
  return join(home, ".graperoot-mcp", "bin", "graperoot_mcp_server.py");
}

export function installWrapperToUserDir(): string {
  const source = getPackagedWrapperPath();
  const target = getInstalledWrapperPath();
  const targetDir = dirname(target);

  if (!existsSync(source)) {
    throw new Error(`Packaged wrapper not found at ${source}`);
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  copyFileSync(source, target);
  return target;
}

export function getMCPServerCommand(): string[] {
  const python = findPython();
  if (!python) {
    throw new Error("Python >=3.10 not found. Install Python first.");
  }

  if (!isGraperootInstalled(python)) {
    throw new Error("graperoot not installed. Run: pip install graperoot");
  }

  const wrapper = installWrapperToUserDir();
  return [python, wrapper];
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
  _isJsonc: boolean = false
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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
