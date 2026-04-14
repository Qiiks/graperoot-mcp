import { select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { allPlatforms } from "./platforms.js";
import {
  configurePlatform,
  buildMCPConfig,
  findPython,
  isGraperootInstalled,
  installGraperoot,
} from "./config-writer.js";
import { getTargetFiles, injectInstructions } from "./agents-md.js";
import type { SetupResult } from "./types.js";

export async function runSetup(): Promise<void> {
  console.log(chalk.cyan("\n🍇 GrapeRoot MCP Setup\n"));

  const python = findPython();
  if (!python) {
    console.log(chalk.red("Error: Python >=3.10 not found. Install Python first.\n"));
    process.exit(1);
  }
  console.log(chalk.green("✓") + " Found Python: " + chalk.dim(python));

  if (!isGraperootInstalled(python)) {
    console.log(chalk.yellow("⚠") + " graperoot not installed via pip.");
    const doInstall = await confirm({
      message: "Install graperoot globally via pip?",
      default: true,
    });
    if (!doInstall) {
      console.log(chalk.red("\nCannot continue without graperoot. Run: pip install graperoot"));
      process.exit(1);
    }
    const spin = ora("Installing graperoot via pip...").start();
    const ok = installGraperoot(python);
    spin.stop();
    if (!ok) {
      console.log(chalk.red("Failed to install graperoot. Try manually: pip install graperoot"));
      process.exit(1);
    }
    console.log(chalk.green("✓") + " graperoot installed");
  } else {
    console.log(chalk.green("✓") + " graperoot pip package found");
  }

  const choices = allPlatforms.map((p) => ({
    name: p.name,
    value: p.id,
    description: `Config: ${p.globalConfigPath}`,
  }));

  const selectedIds = await select({
    message: "Select AI coding assistants to configure:",
    choices,
  });

  const selectedPlatforms = allPlatforms.filter((p) =>
    Array.isArray(selectedIds)
      ? selectedIds.includes(p.id)
      : selectedIds === p.id
  );

  if (selectedPlatforms.length === 0) {
    console.log(chalk.yellow("\nNo platforms selected. Exiting."));
    return;
  }

  const spinner = ora("Configuring MCP servers...").start();
  const config = buildMCPConfig();
  const results: SetupResult[] = [];

  for (const platform of selectedPlatforms) {
    spinner.text = `Configuring ${platform.name}...`;
    const result = configurePlatform(platform, config);
    results.push(result);
  }

  spinner.stop();

  console.log(chalk.cyan("\n📋 Results:\n"));
  for (const r of results) {
    if (r.success) {
      console.log(chalk.green("  ✓") + ` ${r.platform}: ${chalk.dim(r.configPath)}`);
    } else {
      console.log(chalk.red("  ✗") + ` ${r.platform}: ${r.error}`);
    }
  }

  console.log(
    chalk.cyan("\n🍇 Done! Restart your AI coding assistant to pick up the new MCP server.\n")
  );
  console.log(
    chalk.dim("To initialize GrapeRoot for a specific project, ask your AI assistant to run the `graperoot_setup` tool.\n")
  );
}
