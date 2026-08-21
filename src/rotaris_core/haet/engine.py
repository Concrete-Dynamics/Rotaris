from __future__ import annotations

import errno
import os
import tempfile
from pathlib import Path

from rotaris_core.haet.anchor import TaggedFile, TaggedLine
from rotaris_core.haet.hasher import (
    BOF_SENTINEL,
    EOF_SENTINEL,
    context_hash_for_position,
    file_hashes,
)
from rotaris_core.haet.hasher import (
    snapshot_id as compute_snapshot_id,
)
from rotaris_core.haet.patch import (
    HAETHunk,
    HAETHunkResult,
    HAETOperation,
    HAETPatchRequest,
    HAETPatchResult,
    HAETPatchValidationError,
    HAETRecoveryCandidate,
    HAETRecoveryPayload,
)
from rotaris_core.reqtocode import SWR, traces

# Window for the one-shot re-anchor relocation: search ±N lines around the
# stale anchor_line_number for a content match before giving up.
_REANCHOR_WINDOW = 5


@traces(SWR.SWR_666, SWR.SWR_1814, SWR.SWR_1815, SWR.SWR_1816, SWR.SWR_2113)
class HAETEngine:
    def __init__(self, workspace_root: Path, *, allow_outside_workspace: bool = False) -> None:
        self.workspace_root = workspace_root.resolve()
        self._allow_outside_workspace = allow_outside_workspace

    def resolve_path(self, file_path: str) -> Path:
        candidate = Path(file_path)
        if not candidate.is_absolute():
            candidate = self.workspace_root / candidate
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self.workspace_root) and not self._allow_outside_workspace:
            raise ValueError(f"Path escapes workspace: {file_path}")
        return resolved

    def read_file(self, file_path: str) -> TaggedFile:
        resolved = self.resolve_path(file_path)
        if resolved.is_dir():
            raise IsADirectoryError(errno.EISDIR, f"Cannot haet_read a directory: '{file_path}'. ")
        tagged_file, _, _, _ = self._read_tagged_file(resolved)
        return tagged_file

    def apply_patch(self, request: HAETPatchRequest) -> HAETPatchResult:
        resolved = self.resolve_path(request.file_path)
        tagged_file, lines, ended_with_newline, original_path = self._read_tagged_file(resolved)
        old_content = tagged_file.line_ending.join(lines)
        if lines and ended_with_newline:
            old_content += tagged_file.line_ending
        if not lines:
            old_content = ""

        relocated = False
        effective_hunks: list[HAETHunk] = list(request.hunks)

        # ── Snapshot check ────────────────────────────────────────────────
        if request.snapshot_id != tagged_file.snapshot_id:
            relocation = self._try_reanchor(request.hunks, tagged_file)
            if relocation is None:
                return HAETPatchResult(
                    success=False,
                    file_path=tagged_file.path,
                    hunks_applied=0,
                    errors=[
                        HAETPatchValidationError(
                            hunk_index=-1,
                            anchor="",
                            error="snapshot_mismatch",
                            details=(
                                f"File {tagged_file.path} changed since snapshot "
                                f"{request.snapshot_id} was taken (current snapshot "
                                f"{tagged_file.snapshot_id}). The engine could not "
                                f"unambiguously relocate every hunk; re-read the file "
                                f"and resubmit with fresh anchors."
                            ),
                            recovery=self._build_recovery(tagged_file, request.hunks),
                        ),
                    ],
                    new_content=None,
                    new_snapshot_id=tagged_file.snapshot_id,
                    relocated=False,
                )
            effective_hunks = relocation
            relocated = True

        effective_hunks, current_snapshot_relocated = self._relocate_current_snapshot_hunks(
            effective_hunks,
            tagged_file,
        )
        relocated = relocated or current_snapshot_relocated

        # ── Per-hunk validation (anchors + line numbers + context) ────────
        errors: list[HAETPatchValidationError] = []
        for index, hunk in enumerate(effective_hunks):
            error = self._validate_hunk(hunk, tagged_file, lines, hunk_index=index)
            if error is not None:
                errors.append(error)

        if errors:
            return HAETPatchResult(
                success=False,
                file_path=tagged_file.path,
                hunks_applied=0,
                errors=errors,
                new_content=None,
                new_snapshot_id=tagged_file.snapshot_id,
                relocated=relocated,
            )

        new_lines, hunk_results = self._apply_hunks(lines, effective_hunks, tagged_file)
        new_content = tagged_file.line_ending.join(new_lines)
        if new_lines and ended_with_newline:
            new_content += tagged_file.line_ending
        if not new_lines:
            new_content = ""

        self._atomic_write(original_path, new_content, tagged_file.encoding)
        new_snapshot = compute_snapshot_id(new_content.encode(tagged_file.encoding))
        return HAETPatchResult(
            success=True,
            file_path=tagged_file.path,
            hunks_applied=len(effective_hunks),
            hunk_results=hunk_results,
            errors=[],
            old_content=old_content,
            new_content=new_content,
            new_snapshot_id=new_snapshot,
            relocated=relocated,
        )

    # ───────────────── one-shot re-anchor ─────────────────

    def _relocate_current_snapshot_hunks(
        self,
        hunks: list[HAETHunk],
        tagged_file: TaggedFile,
    ) -> tuple[list[HAETHunk], bool]:
        relocated: list[HAETHunk] = []
        changed = False
        for hunk in hunks:
            updates: dict[str, object] = {}
            start = self._relocate_anchor_ref_if_unique(
                hunk.anchor,
                hunk.anchor_line_number,
                tagged_file,
            )
            if start is not None:
                updates["anchor_line_number"] = start.line_number
                changed = True
            if hunk.end_anchor is not None and hunk.end_anchor_line_number is not None:
                end = self._relocate_anchor_ref_if_unique(
                    hunk.end_anchor,
                    hunk.end_anchor_line_number,
                    tagged_file,
                )
                if end is not None:
                    updates["end_anchor_line_number"] = end.line_number
                    changed = True
            relocated.append(hunk.model_copy(update=updates) if updates else hunk)
        return relocated, changed

    def _relocate_anchor_ref_if_unique(
        self,
        anchor: str,
        anchor_line_number: int,
        tagged_file: TaggedFile,
    ) -> TaggedLine | None:
        line = tagged_file.get_line_by_number(anchor_line_number)
        if line is not None and line.anchor == anchor:
            return None
        return self._locate_unique(anchor, anchor_line_number, tagged_file)

    def _try_reanchor(
        self,
        hunks: list[HAETHunk],
        tagged_file: TaggedFile,
    ) -> list[HAETHunk] | None:
        """Attempt to relocate every hunk in the freshly-read file.

        Returns a new list of hunks with refreshed anchors and line numbers
        when every hunk has *exactly one* candidate; otherwise returns None
        and the caller surfaces a structured ``snapshot_mismatch`` error.
        """
        relocated: list[HAETHunk] = []
        for hunk in hunks:
            new_start = self._locate_unique(hunk.anchor, hunk.anchor_line_number, tagged_file)
            if new_start is None:
                return None
            new_end_anchor = hunk.end_anchor
            new_end_line: int | None = hunk.end_anchor_line_number
            if hunk.end_anchor is not None and hunk.end_anchor_line_number is not None:
                new_end = self._locate_unique(
                    hunk.end_anchor,
                    hunk.end_anchor_line_number,
                    tagged_file,
                )
                if new_end is None:
                    return None
                new_end_anchor = new_end.anchor
                new_end_line = new_end.line_number
            relocated.append(
                hunk.model_copy(
                    update={
                        "anchor": new_start.anchor,
                        "anchor_line_number": new_start.line_number,
                        "end_anchor": new_end_anchor,
                        "end_anchor_line_number": new_end_line,
                        # Drop context hashes after relocation — neighbors may
                        # legitimately differ from the originals.
                        "context_before_hash": None,
                        "context_after_hash": None,
                        "end_context_before_hash": None,
                        "end_context_after_hash": None,
                    },
                ),
            )
        return relocated

    def _locate_unique(
        self,
        anchor: str,
        hint_line: int,
        tagged_file: TaggedFile,
    ) -> TaggedLine | None:
        """Find the unique line carrying ``anchor`` near ``hint_line``."""
        in_window = [
            ln
            for ln in tagged_file.lines
            if ln.anchor == anchor and abs(ln.line_number - hint_line) <= _REANCHOR_WINDOW
        ]
        if len(in_window) == 1:
            return in_window[0]
        all_matches = [ln for ln in tagged_file.lines if ln.anchor == anchor]
        if len(all_matches) == 1:
            return all_matches[0]
        return None

    def _build_recovery(
        self,
        tagged_file: TaggedFile,
        hunks: list[HAETHunk],
    ) -> HAETRecoveryPayload:
        candidates: list[HAETRecoveryCandidate] = []
        seen: set[int] = set()
        for hunk in hunks:
            for line in tagged_file.lines:
                if line.anchor != hunk.anchor:
                    continue
                if line.line_number in seen:
                    continue
                seen.add(line.line_number)
                candidates.append(
                    HAETRecoveryCandidate(
                        line_number=line.line_number,
                        anchor=line.anchor,
                        content_preview=line.content[:80],
                    ),
                )
        candidates = candidates[:20]
        return HAETRecoveryPayload(fresh_snapshot_id=tagged_file.snapshot_id, candidates=candidates)

    # ───────────────── per-hunk validation ─────────────────

    def _validate_anchor_ref(
        self,
        anchor: str,
        anchor_line_number: int,
        tagged_file: TaggedFile,
        hunk_index: int,
        prefix: str = "",
    ) -> HAETPatchValidationError | None:
        field = f"{prefix}anchor"
        line = tagged_file.get_line_by_number(anchor_line_number)
        if line is None:
            return HAETPatchValidationError(
                hunk_index=hunk_index,
                anchor=anchor,
                error=f"{field}_line_not_found",
                details=(
                    f"Line {anchor_line_number} does not exist in {tagged_file.path}. "
                    f"Re-read the file with haet_read for fresh anchors."
                ),
                recovery=self._build_recovery(tagged_file, []),
            )
        if line.anchor != anchor:
            elsewhere = tagged_file.get_line_by_anchor(anchor)
            hint = ""
            if elsewhere:
                lns = ", ".join(str(m.line_number) for m in elsewhere[:5])
                hint = f" Anchor {anchor!r} currently lives at line(s) {lns}."
            return HAETPatchValidationError(
                hunk_index=hunk_index,
                anchor=anchor,
                error=f"{field}_line_mismatch",
                details=(
                    f"Line {anchor_line_number} has anchor {line.anchor!r}, "
                    f"not {anchor!r}.{hint} Re-read with haet_read."
                ),
                recovery=self._build_recovery(tagged_file, []),
            )
        return None

    def _validate_context(
        self,
        hunk: HAETHunk,
        lines: list[str],
        hunk_index: int,
    ) -> HAETPatchValidationError | None:
        start_idx = hunk.anchor_line_number - 1
        if hunk.context_before_hash is not None:
            actual = context_hash_for_position(lines, start_idx - 1, side="before")
            if not _context_matches(hunk.context_before_hash, actual):
                return self._context_error(hunk_index, hunk.anchor, "context_before_hash", actual)
        if hunk.context_after_hash is not None and hunk.end_anchor is None:
            actual = context_hash_for_position(lines, start_idx + 1, side="after")
            if not _context_matches(hunk.context_after_hash, actual):
                return self._context_error(hunk_index, hunk.anchor, "context_after_hash", actual)
        if hunk.end_anchor is not None and hunk.end_anchor_line_number is not None:
            end_idx = hunk.end_anchor_line_number - 1
            if hunk.context_after_hash is not None:
                # When end_anchor is set, context_after_hash refers to the line
                # immediately *after* the replaced range.
                actual = context_hash_for_position(lines, end_idx + 1, side="after")
                if not _context_matches(hunk.context_after_hash, actual):
                    return self._context_error(
                        hunk_index,
                        hunk.anchor,
                        "context_after_hash",
                        actual,
                    )
            if hunk.end_context_before_hash is not None:
                actual = context_hash_for_position(lines, end_idx - 1, side="before")
                if not _context_matches(hunk.end_context_before_hash, actual):
                    return self._context_error(
                        hunk_index,
                        hunk.anchor,
                        "end_context_before_hash",
                        actual,
                    )
            if hunk.end_context_after_hash is not None:
                actual = context_hash_for_position(lines, end_idx + 1, side="after")
                if not _context_matches(hunk.end_context_after_hash, actual):
                    return self._context_error(
                        hunk_index,
                        hunk.anchor,
                        "end_context_after_hash",
                        actual,
                    )
        return None

    def _context_error(
        self,
        hunk_index: int,
        anchor: str,
        field: str,
        actual: str,
    ) -> HAETPatchValidationError:
        return HAETPatchValidationError(
            hunk_index=hunk_index,
            anchor=anchor,
            error="context_mismatch",
            details=(
                f"{field} did not match the file. Current value at that "
                f"position: {actual!r}. The surrounding code drifted since the "
                f"read; re-read with haet_read and resubmit."
            ),
        )

    def _validate_hunk(
        self,
        hunk: HAETHunk,
        tagged_file: TaggedFile,
        lines: list[str],
        hunk_index: int = 0,
    ) -> HAETPatchValidationError | None:
        error = self._validate_anchor_ref(
            hunk.anchor,
            hunk.anchor_line_number,
            tagged_file,
            hunk_index,
        )
        if error:
            return error

        if hunk.end_anchor is not None:
            assert hunk.end_anchor_line_number is not None  # schema guarantees
            error = self._validate_anchor_ref(
                hunk.end_anchor,
                hunk.end_anchor_line_number,
                tagged_file,
                hunk_index,
                prefix="end_",
            )
            if error:
                return error
            if hunk.end_anchor_line_number < hunk.anchor_line_number:
                return HAETPatchValidationError(
                    hunk_index=hunk_index,
                    anchor=hunk.anchor,
                    error="end_before_start",
                    details=(
                        f"end_anchor resolves to line {hunk.end_anchor_line_number}, "
                        f"which is before start line {hunk.anchor_line_number}"
                    ),
                )

        ctx_error = self._validate_context(hunk, lines, hunk_index)
        if ctx_error is not None:
            return ctx_error

        # Orphan-lines guard.
        if (
            hunk.operation == HAETOperation.REPLACE
            and hunk.end_anchor is None
            and hunk.content is not None
        ):
            content_line_count = hunk.content.count("\n") + 1
            single_replace_line_limit = 20
            if content_line_count > single_replace_line_limit:
                return HAETPatchValidationError(
                    hunk_index=hunk_index,
                    anchor=hunk.anchor,
                    error="single_anchor_replace_too_large",
                    details=(
                        f"Single-anchor REPLACE would write {content_line_count} "
                        f"lines while removing only 1 (anchor line). To replace a "
                        f"multi-line block, set `end_anchor` to the last line of "
                        f"the block. To insert lines without removing anything, "
                        f"use `insert_after`/`insert_before`."
                    ),
                )

        return None

    # ───────────────── apply ─────────────────

    def _apply_hunks(
        self,
        lines: list[str],
        hunks: list[HAETHunk],
        tagged_file: TaggedFile,
    ) -> tuple[list[str], list[HAETHunkResult]]:
        updated_lines = list(lines)
        resolved_hunks = []
        for hunk in hunks:
            start_line = hunk.anchor_line_number
            end_line = hunk.end_anchor_line_number or start_line
            resolved_hunks.append((start_line, end_line, hunk))

        hunk_results: list[HAETHunkResult] = []
        for _index, (start_line, end_line, hunk) in enumerate(
            sorted(resolved_hunks, key=lambda item: item[0], reverse=True),
        ):
            original_index = next(
                i
                for i, (sl, el, h) in enumerate(resolved_hunks)
                if h is hunk and sl == start_line and el == end_line
            )
            start_index = start_line - 1
            end_index = end_line - 1
            if hunk.operation == HAETOperation.INSERT_BEFORE:
                new_lines_list = self._split_content(hunk.content)
                updated_lines[start_index:start_index] = new_lines_list
                hunk_results.append(
                    HAETHunkResult(
                        hunk_index=original_index,
                        operation=hunk.operation.value,
                        line=start_line,
                        lines_removed=0,
                        lines_added=len(new_lines_list),
                    ),
                )
            elif hunk.operation == HAETOperation.INSERT_AFTER:
                new_lines_list = self._split_content(hunk.content)
                updated_lines[start_index + 1 : start_index + 1] = new_lines_list
                hunk_results.append(
                    HAETHunkResult(
                        hunk_index=original_index,
                        operation=hunk.operation.value,
                        line=start_line,
                        lines_removed=0,
                        lines_added=len(new_lines_list),
                    ),
                )
            elif hunk.operation == HAETOperation.REPLACE:
                new_lines_list = self._split_content(hunk.content)
                lines_removed = end_index - start_index + 1
                updated_lines[start_index : end_index + 1] = new_lines_list
                hunk_results.append(
                    HAETHunkResult(
                        hunk_index=original_index,
                        operation=hunk.operation.value,
                        line=start_line,
                        lines_removed=lines_removed,
                        lines_added=len(new_lines_list),
                    ),
                )
            else:  # DELETE
                del updated_lines[start_index]
                hunk_results.append(
                    HAETHunkResult(
                        hunk_index=original_index,
                        operation=hunk.operation.value,
                        line=start_line,
                        lines_removed=1,
                        lines_added=0,
                    ),
                )

        hunk_results.sort(key=lambda r: r.hunk_index)
        return updated_lines, hunk_results

    # ───────────────── IO ─────────────────

    def _read_tagged_file(self, resolved_path: Path) -> tuple[TaggedFile, list[str], bool, Path]:
        raw = resolved_path.read_bytes()
        encoding = "utf-8"
        text = raw.decode(encoding)
        line_ending = self._detect_line_ending(raw)
        ended_with_newline = text.endswith(("\r\n", "\n", "\r"))
        lines = text.splitlines()
        anchors = file_hashes(lines)
        tagged_lines = [
            TaggedLine(line_number=index, anchor=anchor, content=line)
            for index, (line, anchor) in enumerate(zip(lines, anchors, strict=False), start=1)
        ]
        return (
            TaggedFile(
                path=str(resolved_path.relative_to(self.workspace_root)),
                lines=tagged_lines,
                encoding=encoding,
                line_ending=line_ending,
                snapshot_id=compute_snapshot_id(raw),
            ),
            lines,
            ended_with_newline,
            resolved_path,
        )

    def _detect_line_ending(self, raw: bytes) -> str:
        if b"\r\n" in raw:
            return "\r\n"
        if b"\n" in raw:
            return "\n"
        if b"\r" in raw:
            return "\r"
        return "\n"

    def _split_content(self, content: str | None) -> list[str]:
        assert content is not None
        normalized = content.replace("\r\n", "\n").replace("\r", "\n")
        return normalized.split("\n")

    def _atomic_write(self, path: Path, content: str, encoding: str) -> None:
        file_descriptor, temporary_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        os.close(file_descriptor)
        try:
            with Path(temporary_path).open("w", encoding=encoding, newline="") as handle:
                handle.write(content)
            os.replace(temporary_path, path)
        finally:
            temp_path = Path(temporary_path)
            if temp_path.exists():
                temp_path.unlink()


def _context_matches(provided: str, actual: str) -> bool:
    """Compare a caller-provided context hash against the freshly-computed one.

    Sentinel values (``BOF`` / ``EOF``) compare exactly; hex hashes compare by
    common prefix so callers can submit a truncated form.
    """
    if provided in (BOF_SENTINEL, EOF_SENTINEL) or actual in (BOF_SENTINEL, EOF_SENTINEL):
        return provided == actual
    return actual.startswith(provided) or provided.startswith(actual)
