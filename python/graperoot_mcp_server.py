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


def main() -> None:
    # Resolve project root
    project_root = find_project_root(
        Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    )

    # Set DG_DATA_DIR to the project's .dual-graph/ directory
    data_dir = project_root / ".dual-graph"
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["DG_DATA_DIR"] = str(data_dir)

    # Build the FastMCP server and run in stdio mode
    from graperoot.mcp_graph_server import build_server

    mcp = build_server()
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
