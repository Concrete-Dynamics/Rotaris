#!/usr/bin/env python3
"""
Cross-platform pre-commit hook — the one fast gate in the commit path.

    ReqToCode traceability → ruff format → ruff check --fix
    ~5-15 s  (reformatted files are auto-staged)

Install via ``make install-hook`` or ``python .pre-commit-hook.py --install``.

No hook runs tests or mypy.  Those belong to the full pass that runs *after*
the merge (AGENTS.md § Workflow), so nothing slow ever sits between an agent
and the next slice.

Works on Linux, macOS, and Windows (Git Bash, MSYS2, or direct Python).
ReqToCode is stdlib-only; ruff needs the project venv (auto-discovered via
``uv run``, ``.venv/Scripts/``, or ``.venv/bin/``).

Never bypass a rejected commit by deleting annotations or weakening a
requirement; follow docs/reference/reqtocode-playbook.md instead.
"""

from __future__ import annotations

import contextlib
import shutil
import subprocess
import sys
from pathlib import Path

# ── platform helpers ────────────────────────────────────────────────

_IS_WINDOWS = sys.platform == "win32"

# fmt: off
_SRC_DIRS = [
    "src",
    "tests",
    "apps/rotaris/src",
    "apps/rotaris/tests",
]
# fmt: on
_RUFF_EXCLUDE = "tests/fixtures/files/large.py"


def _emoji(icon: str, fallback: str) -> str:
    """Return *icon* if the terminal can encode it, else *fallback*."""
    try:
        icon.encode(sys.stdout.encoding or "utf-8")
        return icon
    except (UnicodeEncodeError, UnicodeDecodeError):
        return fallback


PASS = _emoji("\u2705", "[OK]")
FAIL = _emoji("\u274c", "[FAIL]")
WARN = _emoji("\u26a0\ufe0f", "[WARN]")
GEAR = _emoji("\U0001f50e", "[...]")

# Windows consoles may default to cp1252, which cannot print emoji.
with contextlib.suppress(Exception):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ── tool discovery ──────────────────────────────────────────────────


def _find_uv_run(repo_root: Path) -> list[str] | None:
    """Return ``["uv", "run"]`` if *uv* is on PATH and can reach the project."""
    if shutil.which("uv") is None:
        return None
    try:
        subprocess.run(
            ["uv", "run", "python", "-c", ""],
            cwd=str(repo_root),
            capture_output=True,
            timeout=15,
            check=True,
        )
    except Exception:
        return None
    return ["uv", "run"]


def _find_venv_bin_dir(repo_root: Path) -> Path | None:
    """Return the ``bin/`` (POSIX) or ``Scripts/`` (Windows) dir of the venv."""
    candidates = [
        repo_root / ".venv" / ("Scripts" if _IS_WINDOWS else "bin"),
        repo_root / "venv" / ("Scripts" if _IS_WINDOWS else "bin"),
    ]
    for d in candidates:
        if d.is_dir():
            return d
    return None


def _discover_runner(repo_root: Path) -> tuple[list[str], str]:
    """Return ``(prefix, source)`` for running tools in the project venv."""
    uv = _find_uv_run(repo_root)
    if uv is not None:
        return uv, "uv run"

    venv_bin = _find_venv_bin_dir(repo_root)
    if venv_bin is not None:
        return [], f"venv ({venv_bin})"

    return [], "system PATH"


# ── git helpers ─────────────────────────────────────────────────────


def _find_repo_root() -> Path:
    """Find git repo root, falling back to script-relative heuristics."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return Path(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        current = Path(__file__).resolve().parent
        for _ in range(10):
            if (current / ".git").exists():
                return current
            current = current.parent
        return Path.cwd()


def _hook_name() -> str:
    """Return the git hook name this script is running as."""
    return Path(__file__).name


# ── stage runners (each returns 0 = pass, non-zero = fail) ──────────


def _run_reqtocode(repo_root: Path) -> int:
    """ReqToCode traceability gate (stdlib-only, no venv needed)."""
    src_dir = repo_root / "src"
    generated = src_dir / "rotaris_core" / "reqtocode" / "swr.py"

    if not (src_dir / "rotaris_core" / "reqtocode" / "cli.py").exists():
        print(f"{WARN}  ReqToCode not present; skipping traceability check.")
        return 0

    sys.path.insert(0, str(src_dir))
    try:
        # type: ignore[unused-ignore]
        from rotaris_core.reqtocode.cli import run_check
    except Exception as exc:
        print(f"{FAIL}  ReqToCode import failed: {exc!r}")
        return 2

    print(f"{GEAR}  ReqToCode traceability check ...")
    rc = run_check(repo_root, fix=True)
    if rc == 0:
        subprocess.run(
            ["git", "add", str(generated)], capture_output=True, check=True,
        )
        print(f"{PASS}  ReqToCode check passed (generated traceables staged).")
    else:
        print(f"{FAIL}  ReqToCode violations detected.")
        print("   Fix:  python -m rotaris_core.reqtocode check --fix")
        print("   Docs: docs/reference/reqtocode-playbook.md")
    return rc


def _stage_all_python(repo_root: Path) -> None:
    """Stage all tracked ``.py`` files so fixes become part of the commit."""
    subprocess.run(
        ["git", "add", "-u", "--", "*.py"],
        cwd=str(repo_root), capture_output=True,
    )


def _run_ruff_format(repo_root: Path, prefix: list[str]) -> int:
    """Format with ruff and stage any reformatted files."""
    print(f"{GEAR}  ruff format ...")
    args = [*prefix, "ruff", "format", "--exclude", _RUFF_EXCLUDE, *_SRC_DIRS]
    result = subprocess.run(args, cwd=str(repo_root), capture_output=True,
                            text=True)
    if result.returncode == 0:
        _stage_all_python(repo_root)
        if result.stdout.strip():
            count = len([line for line in result.stdout.strip().splitlines() if line])
            print(f"{GEAR}  {count} file(s) reformatted and staged.")
        else:
            print(f"{PASS}  Formatting OK (no changes).")
    else:
        print(f"{FAIL}  ruff format failed (exit {result.returncode}).")
        if result.stderr.strip():
            print(result.stderr.strip())
    return result.returncode


def _run_ruff_lint(repo_root: Path, prefix: list[str]) -> int:
    """Lint with ruff --fix and stage fixes. Block on unfixable errors."""
    print(f"{GEAR}  ruff check --fix ...")
    # First pass: auto-fix what we can, then stage fixes
    fix_args = [*prefix, "ruff", "check", "--fix", "--exclude", _RUFF_EXCLUDE,
                *_SRC_DIRS]
    fix_result = subprocess.run(fix_args, cwd=str(repo_root), capture_output=True,
                                text=True)
    if fix_result.stdout.strip():
        _stage_all_python(repo_root)
        print(fix_result.stdout.strip())

    # Second pass: check for remaining unfixable violations
    check_args = [*prefix, "ruff", "check",
                  "--exclude", _RUFF_EXCLUDE, *_SRC_DIRS]
    result = subprocess.run(check_args, cwd=str(repo_root), capture_output=True,
                            text=True)
    if result.returncode == 0:
        print(f"{PASS}  Lint OK.")
    else:
        print(f"{FAIL}  Unfixable lint errors remain (ruff check).")
        short = " ".join(_SRC_DIRS)
        print(f"   Reproduce:  uv run ruff check {short} \\")
        print(f"                --exclude '{_RUFF_EXCLUDE}'")
        if result.stdout.strip():
            print(result.stdout.strip())
        print("   Fix these manually, then re-commit.")
    return result.returncode


# ── install ─────────────────────────────────────────────────────────


def _install_one(repo_root: Path, hook_name: str) -> int:
    """Install this script as ``.git/hooks/<hook_name>``."""
    hooks_dir = repo_root / ".git" / "hooks"
    hook_path = hooks_dir / hook_name

    if not hooks_dir.exists():
        print(f"{FAIL}  Not a git repository (no .git/hooks directory found).")
        return 1

    script_content = Path(__file__).read_text(encoding="utf-8")
    hook_path.write_text(script_content, encoding="utf-8")

    if not _IS_WINDOWS:
        hook_path.chmod(0o755)

    print(f"{PASS}  {hook_name} hook installed at {hook_path}")
    return 0


def _install_hooks() -> int:
    """Install the pre-commit hook (the only hook this repo uses)."""
    repo_root = _find_repo_root()
    rc = _install_one(repo_root, "pre-commit")

    if rc == 0:
        print()
        print("pre-commit:  ReqToCode → ruff format → ruff check --fix  (~5-15 s)")
        print("No other hook is installed: tests and mypy run after the merge,")
        print("not in the commit or push path (AGENTS.md § Workflow).")
    return rc


# ── main dispatch ───────────────────────────────────────────────────


def _run_pre_commit(repo_root: Path, prefix: list[str]) -> int:
    """Fast gate: ReqToCode → format-check → lint."""
    stages: list[tuple[str, callable]] = [
        ("ReqToCode", lambda: _run_reqtocode(repo_root)),
        ("Format check", lambda: _run_ruff_format(repo_root, prefix)),
        ("Lint", lambda: _run_ruff_lint(repo_root, prefix)),
    ]
    failed: list[str] = []
    for name, fn in stages:
        rc = fn()
        if rc != 0:
            failed.append(name)
            break  # stop at first failure
    return (1 if failed else 0), failed


def _run_all_checks(repo_root: Path) -> int:
    """Run the pre-commit gate."""
    prefix, tool_source = _discover_runner(repo_root)
    hook = _hook_name()

    if tool_source == "system PATH":
        print(f"{WARN}  uv not found and no .venv detected;")
        print("   using system tools from PATH.  Install uv or activate")
        print("   the venv for deterministic results.")

    print(f"\n{'='*60}")
    print(f"  {hook} gate  |  runner: {tool_source}")
    print(f"{'='*60}")

    rc, failed = _run_pre_commit(repo_root, prefix)

    print(f"{'='*60}")
    if not failed:
        print(f"{PASS}  All {hook} checks passed.\n")
    else:
        print(f"{FAIL}  {hook} blocked: {', '.join(failed)} failed.\n")
    return rc


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--install" in args or "--install-pre-commit" in args:
        sys.exit(_install_hooks())
    else:
        sys.exit(_run_all_checks(_find_repo_root()))
