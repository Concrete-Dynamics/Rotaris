from __future__ import annotations

import difflib
import re
from typing import TYPE_CHECKING, Any, Self

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field, model_validator

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.tools.file_engine import FileToolEngine


_READ_FILE_DESCRIPTION = """\
Read file content or list directory entries.

IMPORTANT: You MUST call read_file before editing any file with write_file.
Edits to files that have not been read are rejected. Always re-read immediately
before editing to ensure you have current content — never rely on stale reads.

Returns line-numbered content: "1: line content", "2: line content", ...
Use offset and limit to paginate large files (default: first 2000 lines).
For directories, returns a listing of entries (with trailing / for subdirs).

Use the grep parameter to search within a file by regex without reading the entire file.
Binary files are detected and rejected.\
"""

_READ_FILE_PATH_DESCRIPTION = (
    "Path to the file or directory to read. Use `path` as the parameter name "
    "(not `file_path`). Accepts relative or absolute paths, for example "
    "`src/main.py` or `src/`."
)

_MAX_TOOL_OUTPUT_CHARS = 30_000


class ReadFileAction(Action):
    path: str = Field(description=_READ_FILE_PATH_DESCRIPTION)
    offset: int = Field(default=1, ge=1, description="Start line (1-indexed)")
    limit: int = Field(default=2000, ge=1, description="Max lines to return")
    grep: str | None = Field(default=None, description="Regex pattern to filter content")
    grep_context: int = Field(default=3, ge=0, description="Context lines around grep matches")

    @model_validator(mode="before")
    @classmethod
    def _remap_file_path_alias(cls, data: Any) -> Any:
        """Accept ``file_path`` as an alias for ``path``."""
        if isinstance(data, dict) and "file_path" in data and "path" not in data:
            data = dict(data)
            data["path"] = data.pop("file_path")
        return data


class ReadFileObservation(Observation):
    path: str = Field(default="")
    total_lines: int = Field(default=0)
    shown_start: int = Field(default=0)
    shown_end: int = Field(default=0)
    encoding: str = Field(default="utf-8")
    content_hash: str = Field(default="")
    truncated: bool = Field(default=False)

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        meta_parts: list[str] = []
        if self.path:
            meta_parts.append(f"path: {self.path}")
        if self.total_lines:
            meta_parts.append(f"total_lines: {self.total_lines}")
        if self.shown_start and self.shown_end:
            meta_parts.append(f"shown: lines {self.shown_start}-{self.shown_end}")
        if self.truncated:
            meta_parts.append("truncated: true")

        text = self.text or ""
        if meta_parts:
            header = " | ".join(meta_parts)
            text = f"[{header}]\n{text}"
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_562)
class ReadFileExecutor(ToolExecutor[ReadFileAction, ReadFileObservation]):
    def __init__(self, engine: FileToolEngine) -> None:
        self.engine = engine

    def __call__(
        self,
        action: ReadFileAction,
        conversation: object = None,
    ) -> ReadFileObservation:
        try:
            resolved = self.engine.resolve_path(action.path)
        except ValueError as exc:
            return ReadFileObservation.from_text(str(exc), is_error=True, path=action.path)

        if not resolved.exists():
            return ReadFileObservation.from_text(
                self._missing_path_message(action.path, resolved),
                is_error=True,
                path=action.path,
            )

        if resolved.is_dir():
            listing = self.engine.list_directory(resolved)
            return ReadFileObservation.from_text(
                listing,
                path=action.path,
            )

        if self.engine.detect_binary(resolved):
            size = resolved.stat().st_size
            return ReadFileObservation.from_text(
                f"Binary file ({size} bytes). Cannot display content.",
                is_error=True,
                path=action.path,
            )

        encoding = self.engine.detect_encoding(resolved)
        try:
            content = resolved.read_text(encoding=encoding)
        except PermissionError:
            return ReadFileObservation.from_text(
                f"Permission denied: {action.path}.",
                is_error=True,
                path=action.path,
            )

        chash = self.engine.content_hash(content)
        self.engine.record_read(resolved, chash)
        lines = content.splitlines()
        total = len(lines)

        if action.grep is not None:
            try:
                re.compile(action.grep)
            except re.error as exc:
                return ReadFileObservation.from_text(
                    f"Invalid grep pattern: {exc}",
                    is_error=True,
                    path=action.path,
                )
            grep_output, match_count = self.engine.grep_file(
                content,
                action.grep,
                action.grep_context,
            )
            if match_count == 0:
                grep_output = f"No matches for pattern '{action.grep}' in {action.path}."
            else:
                grep_output = f"{match_count} match(es) for '{action.grep}':\n{grep_output}"
            return ReadFileObservation.from_text(
                grep_output,
                path=action.path,
                total_lines=total,
                encoding=encoding,
                content_hash=chash,
            )

        start_idx = action.offset - 1
        end_idx = min(start_idx + action.limit, total)
        selected = lines[start_idx:end_idx]
        truncated = end_idx < total

        numbered = [f"{i}: {line}" for i, line in enumerate(selected, start=action.offset)]
        body = "\n".join(numbered)

        if len(body) > _MAX_TOOL_OUTPUT_CHARS:
            cut = body.rfind("\n", 0, _MAX_TOOL_OUTPUT_CHARS)
            if cut <= 0:
                cut = _MAX_TOOL_OUTPUT_CHARS
            body = body[:cut]
            truncated = True
            lines_shown = body.count("\n") + 1
            end_idx = start_idx + lines_shown
            remaining = total - end_idx
            body += (
                f"\n\n(Output capped at ~{_MAX_TOOL_OUTPUT_CHARS} chars. "
                f"{remaining} more lines. Use offset={end_idx + 1} to continue.)"
            )
        elif truncated:
            remaining = total - end_idx
            body += f"\n\n({remaining} more lines. Use offset={end_idx + 1} to continue.)"

        return ReadFileObservation.from_text(
            body,
            path=action.path,
            total_lines=total,
            shown_start=action.offset,
            shown_end=end_idx,
            encoding=encoding,
            content_hash=chash,
            truncated=truncated,
        )

    def _missing_path_message(self, requested_path: str, resolved: Any) -> str:
        parent = resolved.parent
        message = (
            f"File not found: {requested_path}. "
            "Use read_file on the parent directory to see available files."
        )
        if not parent.exists() or not parent.is_dir():
            return message
        try:
            entries = sorted(
                [entry.name + ("/" if entry.is_dir() else "") for entry in parent.iterdir()],
            )
        except OSError:
            return message
        if not entries:
            return message
        target = resolved.name
        close = difflib.get_close_matches(
            target, [e.rstrip("/") for e in entries], n=5, cutoff=0.45
        )
        suggestions = close or entries[:5]
        parent_display = self.engine._relative(parent)
        return (
            f"{message}\nParent directory: {parent_display}\n"
            f"Nearby entries: {', '.join(suggestions[:5])}"
        )


@traces(SWR.SWR_658)
class ReadFileTool(ToolDefinition[ReadFileAction, ReadFileObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        engine: FileToolEngine = kwargs["engine"]
        return [
            cls(
                description=_READ_FILE_DESCRIPTION,
                action_type=ReadFileAction,
                observation_type=ReadFileObservation,
                executor=ReadFileExecutor(engine),
            ),
        ]
