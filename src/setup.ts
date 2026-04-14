import { select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { allPlatforms } from "./platforms.js";
import { configurePlatform, buildMCPConfig, findPython, findGraperootVenv } from "./config-writer.js";
import { getTargetFiles, injectInstructions } from "./agents-md.js";
import type { SetupResult } from "./types.js";

export async function runSetup(): Promise<void> {
  console.log(chalk.cyan("\n🍇 GrapeRoot MCP Setup\n"));

  const pythonCmd = findPython();
  const venvPython = findGraperootVenv();

  if (!pythonCmd && !venvPython) {
    console.log(
      chalk.red(
        "Error: Python >=3.10 not found. Install Python first, then run GrapeRoot's installer:\n"
      )
    );
    console.log("  macOS/Linux: curl -sSL https://raw.githubusercontent.com/kunal12203/Codex-CLI-Compact/main/install.sh | bash");
    console.log("  Windows:    irm https://raw.githubusercontent.com/kunal12203/Codex-CLI-Compact/main/install.ps1 | iex");
    console.log();
    process.exit(1);
  }

  if (venvPython) {
    console.log(chalk.green("✓") + " Found GrapeRoot Python venv: " + chalk.dim(venvPython));
  } else if (pythonCmd) {
    console.log(chalk.green("✓") + " Found Python: " + chalk.dim(pythonCmd));
    console.log(chalk.yellow("⚠") + " GrapeRoot venv not found. Run the GrapeRoot installer for best results.");
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

  const doInject = await confirm({
    message: "Inject GrapeRoot instructions into AGENTS.md/CLAUDE.md in this project?",
    default: true,
  });

  if (doInject) {
    const projectDir = process.cwd();
    const targets = getTargetFiles(projectDir);
    if (targets.length === 0) {
      console.log(chalk.yellow("\n⚠ No AGENTS.md or CLAUDE.md found in this project."));
      const createAgents = await confirm({
        message: "Create AGENTS.md with GrapeRoot instructions?",
        default: true,
      });
      if (createAgents) {
        const { writeFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        writeFileSync(join(projectDir, "AGENTS.md"), "", "utf-8");
        targets.push(join(projectDir, "AGENTS.md"));
      }
    }
    for (const f of targets) {
      injectInstructions(f);
      console.log(chalk.green("  ✓") + ` Updated: ${chalk.dim(f)}`);
    }
  }

  console.log(
    chalk.cyan("\n🍇 Done! Restart your AI coding assistant to pick up the new MCP server.\n")
  );
}
