"""
GrapeRoot MCP stdio server with automatic project root detection.

This module is the canonical MCP runtime for GrapeRoot. It:
1. Auto-detects the project root from the current working directory
2. Sets DG_DATA_DIR to the project's .dual-graph/ directory
3. Builds the FastMCP server with all GrapeRoot tools
4. Runs in stdio transport mode (native MCP communication)

Usage:
  python -m graperoot_mcp_server [project_path]

If project_path is omitted, auto-detects from cwd by searching upward
for .dual-graph/, .git/, or falls back to cwd.
"""

import os
import sys
from pathlib import Path


def find_project_root(start: Path | None = None) -> Path:
    """Find the project root by searching upward for markers.

    Resolution order:
    1. DG_DATA_DIR env var (if set, use its parent)
    2. Nearest .dual-graph/ directory upward from start
    3. Nearest .git/ directory upward from start
    4. Fall back to start (cwd by default)
    """
    # 1. Explicit env var takes priority
    env_dir = os.environ.get("DG_DATA_DIR", "").strip()
    if env_dir:
        p = Path(env_dir)
        if p.is_dir():
            return p if p.name == ".dual-graph" else p

    search = start or Path.cwd()

    # 2. Search upward for .dual-graph/
    current = search.resolve()
    for _ in range(50):  # safety limit
        if (current / ".dual-graph").is_dir():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent

    # 3. Search upward for .git/
    current = search.resolve()
    for _ in range(50):
        if (current / ".git").is_dir():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent

    # 4. Fall back to cwd
    return search.resolve()


MARKER_START = "<!-- GRAPEROOT:START -->"
MARKER_END = "<!-- GRAPEROOT:END -->"

AGENTS_MD_CONTENT = """## GrapeRoot — Dual-Graph Code Navigation

GrapeRoot provides MCP tools for intelligent codebase navigation using a dual-graph.

### Workflow
1. Call `graph_retrieve` with your query BEFORE reading any files
2. Use `graph_read` to read specific files (one call per file)
3. After editing, call `graph_register_edit` to update the action graph
4. Use `graph_continue` for follow-up queries to leverage action memory

### Initial Setup
If GrapeRoot has not been set up for this project, run `graperoot_setup` first.
"""

def inject_agents_md(project_root: Path) -> str:
    candidates = [
        project_root / "AGENTS.md",
        project_root / "CLAUDE.md",
        project_root / ".claude" / "CLAUDE.md",
    ]
    injected = []
    for path in candidates:
        if path.exists() or path.name == "AGENTS.md":
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("", encoding="utf-8")
            content = path.read_text(encoding="utf-8")
            if MARKER_START in content:
                start = content.index(MARKER_START)
                end = content.index(MARKER_END) + len(MARKER_END)
                content = content[:start] + MARKER_START + "\n" + AGENTS_MD_CONTENT + MARKER_END + content[end:]
            else:
                content += "\n" + MARKER_START + "\n" + AGENTS_MD_CONTENT + MARKER_END + "\n"
            path.write_text(content, encoding="utf-8")
            injected.append(str(path))
    return ", ".join(injected) if injected else "none"


def main() -> None:
    project_root = find_project_root(
        Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    )

    data_dir = project_root / ".dual-graph"
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["DG_DATA_DIR"] = str(data_dir)

    from graperoot.mcp_graph_server import build_server

    mcp = build_server()

    @mcp.tool()
    def graperoot_setup(project_path: str = "") -> dict:
        """Initialize GrapeRoot for the current project. Creates .dual-graph/ directory, builds the info graph, and injects instructions into AGENTS.md/CLAUDE.md. Run this once per project before using other graph tools."""
        root = Path(project_path).resolve() if project_path else project_root
        dg = root / ".dual-graph"
        dg.mkdir(parents=True, exist_ok=True)
        os.environ["DG_DATA_DIR"] = str(dg)

        injected = inject_agents_md(root)

        scan_result = None
        try:
            from graperoot.mcp_graph_server import _post
            scan_result = _post("/api/scan", {"project_root": str(root)})
        except Exception:
            try:
                from graperoot.mcp_graph_server import graph_scan
                scan_result = graph_scan(str(root))
            except Exception:
                scan_result = {"note": "graph_scan not available via API, run `dgc .` manually"}

        return {
            "status": "initialized",
            "project_root": str(root),
            "dual_graph_dir": str(dg),
            "agents_md_updated": injected,
            "scan_result": scan_result,
        }

    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
