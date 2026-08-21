"""Shared engine for read_file and write_file tools.

Handles workspace scoping, binary/encoding detection, read-before-write
ledger, undo stacks, atomic writes, and the fallback matching cascade.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools._gitignore import IGNORED_PATH_PARTS


@dataclass(frozen=True, slots=True)
class ReadRecord:
    content_hash: str
    timestamp: float


@dataclass(frozen=True, slots=True)
class MatchResult:
    level: Literal["exact", "whitespace", "indent", "fuzzy"]
    start: int
    end: int
    ratio: float


UNDO_STACK_LIMIT = 10
_BINARY_CHECK_BYTES = 8192
_FUZZY_THRESHOLD = 0.85


@traces(SWR.SWR_657, SWR.SWR_2112)
class FileToolEngine:
    """Shared state for read_file and write_file tools.

    Attributes:
        workspace: Resolved workspace root path.
        read_ledger: Maps resolved path → ReadRecord (content_hash, timestamp).
        undo_stacks: Maps resolved path → list of previous file contents.

    MatchResult fields:
        start/end: 0-based line indices (end is exclusive).
        ratio: 1.0 for exact/whitespace/indent, <1.0 for fuzzy.

    """

    def __init__(
        self,
        workspace_root: Path,
        *,
        extra_read_roots: tuple[Path, ...] = (),
        path_auth: PathAuth | None = None,
    ) -> None:
        self.workspace = workspace_root.resolve()
        self.extra_read_roots = tuple(root.resolve() for root in extra_read_roots)
        self._path_auth = path_auth or PathAuth(self.workspace)
        self.read_ledger: dict[str, ReadRecord] = {}
        self.undo_stacks: dict[str, list[str]] = {}

    def resolve_path(self, raw: str, *, for_write: bool = False) -> Path:
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = self.workspace / candidate
        resolved = candidate.resolve()
        if not for_write:
            for root in self.extra_read_roots:
                if resolved.is_relative_to(root):
                    return resolved
        return self._path_auth.validate(resolved, for_write=for_write)

    def detect_binary(self, path: Path) -> bool:
        try:
            with path.open("rb") as fh:
                chunk = fh.read(_BINARY_CHECK_BYTES)
        except OSError:
            return True
        return b"\0" in chunk

    def detect_encoding(self, path: Path) -> str:
        raw = path.read_bytes()
        try:
            raw.decode("utf-8")
            return "utf-8"
        except UnicodeDecodeError:
            return "latin-1"

    @staticmethod
    def content_hash(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def record_read(self, path: Path, content_hash: str) -> None:
        import time

        key = str(path)
        self.read_ledger[key] = ReadRecord(
            content_hash=content_hash,
            timestamp=time.time(),
        )

    def check_read_before_write(self, path: Path) -> None:
        key = str(path)
        if key not in self.read_ledger:
            rel = self._relative(path)
            raise ValueError(
                f"You must read {rel} before editing it. "
                f'Call read_file(path="{rel}") first, then retry your edit.',
            )

    def push_undo(self, path: Path, content: str) -> None:
        key = str(path)
        stack = self.undo_stacks.setdefault(key, [])
        stack.append(content)
        if len(stack) > UNDO_STACK_LIMIT:
            stack.pop(0)

    def pop_undo(self, path: Path) -> str | None:
        key = str(path)
        stack = self.undo_stacks.get(key)
        if not stack:
            return None
        return stack.pop()

    def atomic_write(self, path: Path, content: str, encoding: str = "utf-8") -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        os.close(fd)
        try:
            Path(tmp).write_text(content, encoding=encoding, newline="")
            os.replace(tmp, path)
        finally:
            tmp_path = Path(tmp)
            if tmp_path.exists():
                tmp_path.unlink()

    def list_directory(self, path: Path) -> str:
        entries: list[str] = []
        try:
            for entry in sorted(path.iterdir(), key=lambda p: p.name):
                if entry.name in IGNORED_PATH_PARTS:
                    continue
                suffix = "/" if entry.is_dir() else ""
                entries.append(f"{entry.name}{suffix}")
        except PermissionError:
            return f"Permission denied: {self._relative(path)}."
        if not entries:
            return "(empty directory)"
        return "\n".join(entries)

    def find_match(
        self,
        content: str,
        old_str: str,
    ) -> tuple[list[MatchResult], int]:
        """Fallback matching cascade: exact → whitespace → indent → fuzzy.

        Returns ``(matches, count)`` at the first level that produces results.
        """
        # Level 1: exact
        exact = self._find_exact(content, old_str)
        if exact:
            return exact, len(exact)

        # Level 2: trailing-whitespace-normalized
        ws = self._find_whitespace_normalized(content, old_str)
        if ws:
            return ws, len(ws)

        # Level 3: relative-indent-adjusted
        indent = self._find_indent_normalized(content, old_str)
        if indent:
            return indent, len(indent)

        # Level 4: fuzzy (SequenceMatcher, threshold >= 0.85)
        fuzzy = self._find_fuzzy(content, old_str)
        if fuzzy:
            return fuzzy, len(fuzzy)

        return [], 0

    def _find_exact(self, content: str, old_str: str) -> list[MatchResult]:
        results: list[MatchResult] = []
        old_lines = old_str.splitlines(keepends=True)
        old_joined = old_str

        start = 0
        while True:
            idx = content.find(old_joined, start)
            if idx == -1:
                break
            line_start = content[:idx].count("\n")
            line_end = line_start + len(old_lines)
            results.append(
                MatchResult(
                    level="exact",
                    start=line_start,
                    end=line_end,
                    ratio=1.0,
                ),
            )
            start = idx + len(old_joined)
        return results

    def _find_whitespace_normalized(self, content: str, old_str: str) -> list[MatchResult]:
        norm_content = self._normalize_trailing_ws(content)
        norm_old = self._normalize_trailing_ws(old_str)

        if norm_content == content and norm_old == old_str:
            return []

        results: list[MatchResult] = []
        old_lines = norm_old.splitlines(keepends=True)

        start = 0
        while True:
            idx = norm_content.find(norm_old, start)
            if idx == -1:
                break
            line_start = norm_content[:idx].count("\n")
            line_end = line_start + len(old_lines)
            results.append(
                MatchResult(
                    level="whitespace",
                    start=line_start,
                    end=line_end,
                    ratio=1.0,
                ),
            )
            start = idx + len(norm_old)
        return results

    def _find_indent_normalized(self, content: str, old_str: str) -> list[MatchResult]:
        """Detects if old_str matches content blocks up to a uniform indent offset."""
        content_lines = content.splitlines()
        old_lines = old_str.splitlines()
        if not old_lines:
            return []

        results: list[MatchResult] = []
        window = len(old_lines)

        for i in range(len(content_lines) - window + 1):
            candidate = content_lines[i : i + window]
            offset = self._detect_indent_offset(old_lines, candidate)
            if offset is not None:
                results.append(
                    MatchResult(
                        level="indent",
                        start=i,
                        end=i + window,
                        ratio=1.0,
                    ),
                )
        return results

    def _find_fuzzy(self, content: str, old_str: str) -> list[MatchResult]:
        content_lines = content.splitlines()
        old_lines = old_str.splitlines()
        if not old_lines:
            return []

        window = len(old_lines)
        best_ratio = 0.0
        best_start = -1

        for i in range(len(content_lines) - window + 1):
            candidate = "\n".join(content_lines[i : i + window])
            ratio = SequenceMatcher(None, old_str, candidate).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_start = i

        if best_ratio >= _FUZZY_THRESHOLD and best_start >= 0:
            return [
                MatchResult(
                    level="fuzzy",
                    start=best_start,
                    end=best_start + window,
                    ratio=best_ratio,
                ),
            ]
        return []

    @staticmethod
    def _normalize_trailing_ws(text: str) -> str:
        return "\n".join(line.rstrip() for line in text.splitlines())

    @staticmethod
    def _detect_indent_offset(old_lines: list[str], candidate_lines: list[str]) -> int | None:
        offset: int | None = None
        for old, cand in zip(old_lines, candidate_lines, strict=True):
            old_stripped = old.lstrip()
            cand_stripped = cand.lstrip()
            if old_stripped != cand_stripped:
                return None
            old_indent = len(old) - len(old_stripped)
            cand_indent = len(cand) - len(cand_stripped)
            line_offset = cand_indent - old_indent
            if offset is None:
                offset = line_offset
            elif line_offset != offset:
                return None
        return offset

    def _relative(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.workspace))
        except ValueError:
            return str(path)

    def find_line_numbers_for_occurrences(self, content: str, old_str: str) -> list[int]:
        results: list[int] = []
        start = 0
        while True:
            idx = content.find(old_str, start)
            if idx == -1:
                break
            line_num = content[:idx].count("\n") + 1
            results.append(line_num)
            start = idx + len(old_str)
        return results

    def apply_replacement(
        self,
        content: str,
        old_str: str,
        new_str: str,
        match: MatchResult,
    ) -> str:
        lines = content.splitlines(keepends=True)
        new_lines_raw = new_str.splitlines(keepends=True)
        if lines and match.end <= len(lines):
            replaced = lines[match.start : match.end]
            if (
                replaced
                and replaced[-1].endswith("\n")
                and new_lines_raw
                and not new_lines_raw[-1].endswith("\n")
            ):
                new_lines_raw[-1] += "\n"

        result_lines = lines[: match.start] + new_lines_raw + lines[match.end :]
        return "".join(result_lines)

    def apply_replacement_all(
        self,
        content: str,
        old_str: str,
        new_str: str,
    ) -> tuple[str, int]:
        count = content.count(old_str)
        if count == 0:
            return content, 0
        return content.replace(old_str, new_str), count

    def count_changed_lines(self, old_content: str, new_content: str) -> int:
        old_lines = old_content.splitlines()
        new_lines = new_content.splitlines()
        changed = 0
        for i in range(max(len(old_lines), len(new_lines))):
            old_line = old_lines[i] if i < len(old_lines) else None
            new_line = new_lines[i] if i < len(new_lines) else None
            if old_line != new_line:
                changed += 1
        return changed

    def grep_file(
        self,
        content: str,
        pattern: str,
        context_lines: int = 3,
    ) -> tuple[str, int]:
        """Search *content* for regex *pattern*, returning matching lines with context.

        The ``>`` prefix marks matching lines; ``---`` separates non-contiguous groups.
        Returns ``(formatted_output, match_count)``.
        """
        compiled = re.compile(pattern)
        lines = content.splitlines()
        match_indices: list[int] = []
        for i, line in enumerate(lines):
            if compiled.search(line):
                match_indices.append(i)

        if not match_indices:
            return "", 0

        show: set[int] = set()
        for idx in match_indices:
            for ctx in range(
                max(0, idx - context_lines),
                min(len(lines), idx + context_lines + 1),
            ):
                show.add(ctx)

        output_lines: list[str] = []
        sorted_show = sorted(show)
        prev = -2
        for i in sorted_show:
            if i > prev + 1 and output_lines:
                output_lines.append("---")
            prefix = ">" if i in match_indices else " "
            output_lines.append(f"{prefix} {i + 1}: {lines[i]}")
            prev = i

        return "\n".join(output_lines), len(match_indices)
