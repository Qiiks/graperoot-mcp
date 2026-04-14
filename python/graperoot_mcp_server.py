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
import subprocess
import threading
import time
import uuid
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

AGENTS_MD_CONTENT = """<!-- dgc-policy-v10 -->
# Dual-Graph Context Policy

This project uses a local dual-graph MCP server for efficient context retrieval.

## MANDATORY: Always follow this order

1. **Call `graph_continue` first** — before any file exploration, grep, or code reading.

2. **If `graph_continue` returns `needs_project=true`**: call `graperoot_setup` with the
   current project directory (`pwd`). Do NOT ask the user.

3. **If `graph_continue` returns `skip=true`**: project has fewer than 5 files.
   Do NOT do broad or recursive exploration. Read only specific files if their names
   are mentioned, or ask the user what to work on.

4. **Read `recommended_files`** using `graph_read` — **one call per file**.
   - `graph_read` accepts a single `file` parameter (string). Call it separately for each
     recommended file. Do NOT pass an array or batch multiple files into one call.
   - `recommended_files` may contain `file::symbol` entries (e.g. `src/auth.ts::handleLogin`).
     Pass them verbatim to `graph_read(file: "src/auth.ts::handleLogin")` — it reads only
     that symbol's lines, not the full file.
   - Example: if `recommended_files` is `["src/auth.ts::handleLogin", "src/db.ts"]`,
     call `graph_read(file: "src/auth.ts::handleLogin")` and `graph_read(file: "src/db.ts")`
     as two separate calls (they can be parallel).

5. **Check `confidence` and obey the caps strictly:**
   - `confidence=high` -> Stop. Do NOT grep or explore further.
   - `confidence=medium` -> If recommended files are insufficient, call `fallback_rg`
     at most `max_supplementary_greps` time(s) with specific terms, then `graph_read`
     at most `max_supplementary_files` additional file(s). Then stop.
   - `confidence=low` -> Call `fallback_rg` at most `max_supplementary_greps` time(s),
     then `graph_read` at most `max_supplementary_files` file(s). Then stop.

## Token Usage

A `token-counter` MCP is available for tracking live token usage.

- To check how many tokens a large file or text will cost **before** reading it:
  `count_tokens({text: "<content>"})`
- To log actual usage after a task completes (if the user asks):
  `log_usage({input_tokens: <est>, output_tokens: <est>, description: "<task>"})`
- To show the user their running session cost:
  `get_session_stats()`

Live dashboard URL is printed at startup next to "Token usage".

## Rules

- Do NOT use `rg`, `grep`, or bash file exploration before calling `graph_continue`.
- Do NOT do broad/recursive exploration at any confidence level.
- `max_supplementary_greps` and `max_supplementary_files` are hard caps - never exceed them.
- Do NOT dump full chat history.
- Do NOT call `graph_retrieve` more than once per turn.
- After edits, call `graph_register_edit(files: ["path/to/file"])` — the parameter is **`files` (plural, always an array)**. Never pass `file` (singular). Use `file::symbol` notation (e.g. `src/auth.ts::handleLogin`) when the edit targets a specific function, class, or hook.

## Releasing

When the user asks to release, bump version, or push changes, **read and follow `RELEASING.md`** in the project root. It contains:

- All version file locations across 3 repos (Dashboard, Core, Scoop)
- Correct push order (Dashboard first, then Core + Scoop)
- Scoop hash computation steps
- Common mistakes to avoid

**Never skip any version file.** Always check all three repos for the current highest version before bumping.

## Context Store

Whenever you make a decision, identify a task, fact, or blocker during a conversation, call `graph_add_memory`.

**To add an entry:**
```
graph_add_memory(type="decision|task|next|fact|blocker", content="one sentence max 15 words", tags=["topic"], files=["relevant/file.ts"])
```

**Do NOT write context-store.json directly** — always use `graph_add_memory`. It applies pruning and keeps the store healthy.

**Rules:**
- Only log things worth remembering across sessions (not every minor detail)
- `content` must be under 15 words
- `files` lists the files this decision/task relates to (can be empty)
- Log immediately when the item arises — not at session end

## Initializing GrapeRoot for New Projects

If this is a new project that hasn't been set up with GrapeRoot yet:
1. Call `graperoot_setup()` to initialize the dual-graph
2. This creates the `.dual-graph/` directory and builds the info graph
3. After setup completes, you can use all graph tools normally
"""

DUALGRAPH_ENTRY = ".dualgraph"


def add_dualgraph_to_gitignore(root: Path) -> str:
    """Add .dualgraph/ to .gitignore if not already present."""
    gitignore = root / ".gitignore"
    entry = DUALGRAPH_ENTRY

    if gitignore.exists():
        content = gitignore.read_text(encoding="utf-8")
        lines = content.splitlines()
        if entry in lines or any(l.strip() == entry for l in lines):
            return "already_present"

    with open(gitignore, "a", encoding="utf-8") as f:
        f.write(f"\n{entry}\n")
    return "added"


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

    setup_jobs: dict[str, dict] = {}
    jobs_lock = threading.Lock()

    def _run_scan_once(root: Path, out_file: Path) -> dict:
        try:
            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "graperoot.graph_builder",
                    "--root",
                    str(root),
                    "--out",
                    str(out_file),
                ],
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
        except Exception as exc:
            return {
                "ok": False,
                "method": "python -m graperoot.graph_builder",
                "error": str(exc),
            }

        if completed.returncode == 0 and out_file.exists():
            return {
                "ok": True,
                "method": "python -m graperoot.graph_builder",
                "returncode": 0,
                "info_graph": str(out_file),
            }

        return {
            "ok": False,
            "method": "python -m graperoot.graph_builder",
            "returncode": completed.returncode,
            "stdout_tail": "\n".join((completed.stdout or "").splitlines()[-20:]),
            "stderr_tail": "\n".join((completed.stderr or "").splitlines()[-20:]),
        }

    def _run_setup_job(job_id: str, root: Path, dg: Path, injected: str, gitignore_status: str) -> None:
        out_file = dg / "info_graph.json"
        with jobs_lock:
            setup_jobs[job_id]["status"] = "running"
            setup_jobs[job_id]["phase"] = "scan_attempt_1"

        first = _run_scan_once(root, out_file)
        if first.get("ok"):
            with jobs_lock:
                setup_jobs[job_id]["status"] = "completed"
                setup_jobs[job_id]["result"] = {
                    "status": "initialized",
                    "project_root": str(root),
                    "dual_graph_dir": str(dg),
                    "agents_md_updated": injected,
                    "gitignore_updated": gitignore_status,
                    "scan_result": {
                        "status": "scan_complete",
                        "attempt": 1,
                        **first,
                    },
                }
            return

        with jobs_lock:
            setup_jobs[job_id]["phase"] = "auto_heal"

        heal = {
            "status": "pip_upgrade_failed",
            "detail": "upgrade step failed",
        }
        try:
            pip_upgrade = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--upgrade", "graperoot"],
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
            heal = {
                "status": "pip_upgrade_complete" if pip_upgrade.returncode == 0 else "pip_upgrade_failed",
                "returncode": pip_upgrade.returncode,
                "stdout_tail": "\n".join((pip_upgrade.stdout or "").splitlines()[-20:]),
                "stderr_tail": "\n".join((pip_upgrade.stderr or "").splitlines()[-20:]),
            }
        except Exception as exc:
            heal = {
                "status": "pip_upgrade_failed",
                "error": str(exc),
            }

        with jobs_lock:
            setup_jobs[job_id]["phase"] = "scan_attempt_2"

        second = _run_scan_once(root, out_file)
        if second.get("ok"):
            with jobs_lock:
                setup_jobs[job_id]["status"] = "completed"
                setup_jobs[job_id]["result"] = {
                    "status": "initialized",
                    "project_root": str(root),
                    "dual_graph_dir": str(dg),
                    "agents_md_updated": injected,
                    "gitignore_updated": gitignore_status,
                    "scan_result": {
                        "status": "scan_complete_after_auto_heal",
                        "attempt": 2,
                        "heal": heal,
                        **second,
                    },
                }
            return

        with jobs_lock:
            setup_jobs[job_id]["status"] = "failed"
            setup_jobs[job_id]["result"] = {
                "status": "scan_failed",
                "project_root": str(root),
                "dual_graph_dir": str(dg),
                "agents_md_updated": injected,
                "gitignore_updated": gitignore_status,
                "scan_result": {
                    "status": "scan_failed",
                    "attempts": [first, second],
                    "heal": heal,
                    "hint": "Scan failed after auto-heal retry. Verify python/pip environment and graperoot installation.",
                },
            }

    @mcp.tool()
    def graperoot_setup(project_path: str = "") -> dict:
        """Initialize GrapeRoot asynchronously for the current project. Creates .dual-graph/, injects AGENTS.md/CLAUDE.md, and starts a background scan job. Returns a job_id for polling."""
        root = Path(project_path).resolve() if project_path else project_root
        dg = root / ".dual-graph"
        dg.mkdir(parents=True, exist_ok=True)
        os.environ["DG_DATA_DIR"] = str(dg)

        injected = inject_agents_md(root)
        gitignore_status = add_dualgraph_to_gitignore(root)

        job_id = uuid.uuid4().hex
        with jobs_lock:
            setup_jobs[job_id] = {
                "status": "queued",
                "phase": "queued",
                "project_root": str(root),
                "dual_graph_dir": str(dg),
                "agents_md_updated": injected,
                "gitignore_updated": gitignore_status,
                "created_at": time.time(),
                "result": None,
            }

        worker = threading.Thread(
            target=_run_setup_job,
            args=(job_id, root, dg, injected, gitignore_status),
            daemon=True,
        )
        worker.start()

        return {
            "status": "queued",
            "job_id": job_id,
            "project_root": str(root),
            "dual_graph_dir": str(dg),
            "agents_md_updated": injected,
            "gitignore_updated": gitignore_status,
            "message": "Setup job started. Poll graperoot_setup_status(job_id) or call graperoot_setup_wait(job_id).",
        }

    @mcp.tool()
    def graperoot_setup_status(job_id: str) -> dict:
        """Get status for a previously started graperoot_setup job."""
        with jobs_lock:
            job = setup_jobs.get(job_id)
            if not job:
                return {
                    "status": "not_found",
                    "job_id": job_id,
                    "message": "No setup job found for this job_id.",
                }
            return {
                "job_id": job_id,
                "status": job["status"],
                "phase": job.get("phase", "unknown"),
                "project_root": job.get("project_root"),
                "dual_graph_dir": job.get("dual_graph_dir"),
                "gitignore_updated": job.get("gitignore_updated"),
                "result": job.get("result"),
            }

    @mcp.tool()
    def graperoot_setup_wait(job_id: str, timeout_seconds: int = 1200, poll_interval_seconds: int = 2) -> dict:
        """Wait for a setup job to complete (or fail), with polling."""
        start = time.time()
        while True:
            with jobs_lock:
                job = setup_jobs.get(job_id)
                if not job:
                    return {
                        "status": "not_found",
                        "job_id": job_id,
                        "message": "No setup job found for this job_id.",
                    }
                if job["status"] in {"completed", "failed"}:
                    return {
                        "job_id": job_id,
                        "status": job["status"],
                        "phase": job.get("phase", "unknown"),
                        "result": job.get("result"),
                    }

            if time.time() - start >= timeout_seconds:
                return {
                    "job_id": job_id,
                    "status": "timeout",
                    "message": "Wait timed out; call graperoot_setup_status(job_id) to continue polling.",
                }
            time.sleep(max(1, poll_interval_seconds))

    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
