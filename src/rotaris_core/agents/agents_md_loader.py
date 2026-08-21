from __future__ import annotations

import logging
from pathlib import Path

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_DEFAULT_PER_FILE_LIMIT = 32_768
_DEFAULT_TOTAL_LIMIT = 131_072
_AGENTS_MD_CACHE: dict[str, str] = {}


def clear_agents_md_cache() -> None:
    _AGENTS_MD_CACHE.clear()


@traces(SWR.SWR_449, SWR.SWR_454, SWR.SWR_455, SWR.SWR_458)
def load_agents_md_content(
    workspace_root: Path,
    *,
    per_file_limit: int = _DEFAULT_PER_FILE_LIMIT,
    total_limit: int = _DEFAULT_TOTAL_LIMIT,
) -> str:
    cache_key = str(workspace_root)
    cached = _AGENTS_MD_CACHE.get(cache_key)
    if cached is not None:
        return cached

    merged = _merge_agents_md_content(
        workspace_root,
        per_file_limit=per_file_limit,
        total_limit=total_limit,
    )
    _AGENTS_MD_CACHE[cache_key] = merged
    return merged


@traces(SWR.SWR_449, SWR.SWR_451, SWR.SWR_452, SWR.SWR_453)
def _merge_agents_md_content(workspace_root: Path, *, per_file_limit: int, total_limit: int) -> str:
    remaining_budget = total_limit
    merged_parts: list[str] = []

    for source_path in _discover_agents_md_files(workspace_root):
        raw_content = _read_file_safe(source_path)
        if raw_content is None:
            continue
        if not raw_content.strip():
            continue

        content_bytes = raw_content.encode("utf-8")
        if len(content_bytes) > per_file_limit:
            _log.warning(
                "Truncating AGENTS.md file %s from %d bytes to %d bytes",
                source_path,
                len(content_bytes),
                per_file_limit,
            )
            raw_content = _truncate_to_line_boundary(raw_content, per_file_limit)
            if not raw_content.strip():
                continue

        rendered_block = f"<!-- source: {source_path} -->\n{raw_content}"
        separator = "\n\n" if merged_parts else ""
        block_with_separator = f"{separator}{rendered_block}"
        block_size = len(block_with_separator.encode("utf-8"))

        if block_size <= remaining_budget:
            merged_parts.append(block_with_separator)
            remaining_budget -= block_size
            continue

        if remaining_budget <= 0:
            _log.warning(
                "Dropping AGENTS.md file %s because the total content cap of %d bytes is exhausted",
                source_path,
                total_limit,
            )
            continue

        prefix = separator + f"<!-- source: {source_path} -->\n"
        prefix_size = len(prefix.encode("utf-8"))
        if prefix_size >= remaining_budget:
            _log.warning(
                "Dropping AGENTS.md file %s because only %d bytes remain in the total content cap",
                source_path,
                remaining_budget,
            )
            continue

        remaining_content_budget = remaining_budget - prefix_size
        truncated_content = _truncate_to_line_boundary(raw_content, remaining_content_budget)
        if not truncated_content.strip():
            _log.warning(
                "Dropping AGENTS.md file %s because the remaining total content budget"
                " ends before the next line boundary",
                source_path,
            )
            continue

        _log.warning(
            "Truncating AGENTS.md file %s to fit the remaining total content budget of %d bytes",
            source_path,
            remaining_budget,
        )
        truncated_block = f"{prefix}{truncated_content}"
        truncated_size = len(truncated_block.encode("utf-8"))
        merged_parts.append(truncated_block)
        remaining_budget -= truncated_size

    return "".join(merged_parts)


def _discover_agents_md_files(workspace_root: Path) -> list[Path]:
    resolved_workspace_root = workspace_root.resolve()
    selected = _pick_directory_file(resolved_workspace_root)
    if selected is None:
        return []
    return [selected]


def _pick_user_global_file() -> Path | None:
    home = Path.home()
    codex_dir = home / ".codex"
    codex_override = codex_dir / "AGENTS.override.md"
    if codex_override.exists():
        return codex_override
    codex_file = codex_dir / "AGENTS.md"
    if codex_file.exists():
        return codex_file

    opencode_file = home / ".config" / "opencode" / "AGENTS.md"
    if opencode_file.exists():
        return opencode_file
    return None


@traces(SWR.SWR_445)
def _pick_directory_file(directory: Path) -> Path | None:
    override_file = directory / "AGENTS.override.md"
    if override_file.exists():
        return override_file
    agents_file = directory / "AGENTS.md"
    if agents_file.exists():
        return agents_file
    return None


def _pick_root_fallback_file(directory: Path) -> Path | None:
    for filename in ("CLAUDE.md", "GEMINI.md"):
        candidate = directory / filename
        if candidate.exists():
            return candidate
    return None


def _intermediate_directories(git_root: Path, workspace_root: Path) -> list[Path]:
    if workspace_root == git_root:
        return []
    relative = workspace_root.relative_to(git_root)
    directories: list[Path] = []
    current = git_root
    for part in relative.parts:
        current = current / part
        directories.append(current)
    return directories


def _find_git_root(workspace_root: Path) -> Path:
    current = workspace_root
    while True:
        if (current / ".git").is_dir():
            return current
        if current.parent == current:
            return workspace_root
        current = current.parent


@traces(SWR.SWR_457)
def _read_file_safe(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        _log.warning("Skipping unreadable AGENTS.md file %s: %s", path, exc)
        return None


@traces(SWR.SWR_452)
def _truncate_to_line_boundary(content: str, byte_limit: int) -> str:
    if byte_limit <= 0:
        return ""

    encoded = content.encode("utf-8")
    if len(encoded) <= byte_limit:
        return content

    truncated = encoded[:byte_limit]
    newline_index = truncated.rfind(b"\n")
    if newline_index == -1:
        return ""
    return truncated[:newline_index].decode("utf-8", errors="ignore")
