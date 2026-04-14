export interface MCPServerConfig {
  command: string[];
  env?: Record<string, string>;
}

export interface PlatformAdapter {
  id: string;
  name: string;
  globalConfigPath: string;
  projectConfigPath?: string;
  rootKey: string;
  supportsStdio: boolean;
  supportsHttp: boolean;
  isArrayFormat?: boolean;
  isJsonc?: boolean;
  buildMCPEntry: (config: MCPServerConfig) => Record<string, unknown>;
}

export interface SetupResult {
  platform: string;
  configPath: string;
  success: boolean;
  error?: string;
}
