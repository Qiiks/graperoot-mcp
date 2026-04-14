import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const MARKER_START = "<!-- GRAPEROOT:START -->";
const MARKER_END = "<!-- GRAPEROOT:END -->";

const GRAPEROOT_INSTRUCTIONS = `## GrapeRoot — Dual-Graph Code Navigation

GrapeRoot provides MCP tools for intelligent codebase navigation using a dual-graph (information graph + action graph).

### Available Tools
- **\`graph_retrieve(query, top_files?, top_edges?)\`** — Retrieve ranked files/edges using dual-graph first. Call this BEFORE reading files.
- **\`graph_read(file, max_chars?, query?, anchor?)\`** — Read ONE file from project root. Call once per file. Use \`file::symbol\` notation for focused reads.
- **\`graph_neighbors(file, limit?)\`** — Return graph edges touching a file.
- **\`graph_impact(changed_files)\`** — Return connected local files likely impacted by edits.
- **\`graph_register_edit(files, summary?)\`** — Register edited files into action graph memory.
- **\`graph_action_summary(query?, limit?)\`** — Return recent action graph summary + query-relevant touched files.
- **\`graph_continue(query, top_files?, top_edges?, limit?)\`** — Continue a conversation using action-memory search first, then info-graph retrieval.
- **\`fallback_rg(pattern, max_hits?)\`** — Controlled fallback grep if retriever confidence is low.
- **\`graph_add_memory(type, content, tags?)\`** — Add a persistent memory note.
- **\`graph_scan(project_root)\`** — Scan a local project directory and build/refresh its information graph.

### Workflow
1. Call \`graph_retrieve\` with your query BEFORE reading any files
2. Use \`graph_read\` to read specific files (one call per file)
3. After editing, call \`graph_register_edit\` to update the action graph
4. Use \`graph_continue\` for follow-up queries to leverage action memory

### Initial Setup
If GrapeRoot has not been set up for this project, run \`graph_scan\` with the project root path first.
`;

export function getTargetFiles(projectDir: string): string[] {
  const files: string[] = [];
  const candidates = ["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md"];
  for (const c of candidates) {
    const p = join(projectDir, c);
    if (existsSync(p)) files.push(p);
  }
  return files;
}

export function injectInstructions(filePath: string): boolean {
  let content = "";
  if (existsSync(filePath)) {
    content = readFileSync(filePath, "utf-8");
  }

  if (content.includes(MARKER_START)) {
    const startIdx = content.indexOf(MARKER_START);
    const endIdx = content.indexOf(MARKER_END);
    if (endIdx > startIdx) {
      const before = content.slice(0, startIdx);
      const after = content.slice(endIdx + MARKER_END.length);
      content =
        before +
        MARKER_START +
        "\n" +
        GRAPEROOT_INSTRUCTIONS +
        MARKER_END +
        after;
    }
  } else {
    const block =
      "\n" + MARKER_START + "\n" + GRAPEROOT_INSTRUCTIONS + MARKER_END + "\n";
    content += block;
  }

  writeFileSync(filePath, content, "utf-8");
  return true;
}

export function removeInstructions(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  let content = readFileSync(filePath, "utf-8");
  if (!content.includes(MARKER_START)) return false;

  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (endIdx < startIdx) return false;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + MARKER_END.length);
  content = before + after.replace(/^\n+/, "\n");
  writeFileSync(filePath, content, "utf-8");
  return true;
}
