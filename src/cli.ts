import { Command } from "commander";
import { runSetup } from "./setup.js";

const program = new Command();

program
  .name("graperoot-mcp")
  .description("Configure GrapeRoot's dual-graph MCP server for any AI coding assistant")
  .version("0.1.0");

program
  .command("setup")
  .description("Interactive setup: select AI assistants and configure MCP")
  .action(async () => {
    await runSetup();
  });

program.parse();
