from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Self

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.edit_diff import build_edit_diff
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.tools.file_engine import FileToolEngine


_WRITE_FILE_DESCRIPTION = """\
Create, edit, overwrite, insert, or undo file changes.

IMPORTANT: You MUST call read_file on a file before editing it. Blind edits are rejected.
NEVER write source files via the terminal tool — only write_file may write source code.

## Command Selection Guide

| Command   | When to use                                          | Required params          |
|-----------|------------------------------------------------------|--------------------------|
| create    | New file (fails if file already exists)              | content                  |
| edit      | Targeted find-and-replace (best for <30% of file)   | old_str, new_str         |
| overwrite | Replace entire file (or after 2+ failed edits)       | content                  |
| insert    | Add lines after a specific line number               | insert_line, new_str     |
| undo      | Revert the last write to this file                   | (none)                   |

## How to Use the edit Command

1. Call read_file immediately before editing to get current content.
2. Copy old_str EXACTLY from the read_file output — same indentation, whitespace, line breaks.
3. Include 2-3 surrounding context lines in old_str to ensure a unique match.
4. new_str fully replaces old_str — include the context lines in new_str too.
5. If old_str matches multiple locations, add more surrounding lines for uniqueness,
   or set replace_all=true to replace every occurrence.

The edit engine tries 4 match levels: exact → whitespace-normalized → indent-adjusted → fuzzy.
Exact match is strongly preferred. Fuzzy matches are flagged for manual verification.

## Recovery When edit Fails

- "old_str not found": The file content doesn't match your old_str. Call read_file again
  to get fresh content, then rebuild old_str from that output. Do NOT retry the same old_str.
- "Found N occurrences": Your old_str is ambiguous. Add more surrounding context lines to
  make it unique, or set replace_all=true if you want all occurrences replaced.
- After 2 failed edits on the same region: switch to overwrite with the full corrected content.\
"""

_WRITE_FILE_PATH_DESCRIPTION = (
    "Path to the file to write. Use `path` as the parameter name (not "
    "`file_path`). Accepts relative or absolute paths, for example "
    "`src/main.py`."
)

_WRITE_FILE_COMMAND_DESCRIPTION = (
    "Operation to perform. One of: `create`, `edit`, `overwrite`, `insert`, or `undo`."
)


class WriteFileAction(Action):
    path: str = Field(description=_WRITE_FILE_PATH_DESCRIPTION)
    command: Literal["create", "edit", "overwrite", "insert", "undo"] = Field(
        description=_WRITE_FILE_COMMAND_DESCRIPTION,
    )
    content: str | None = Field(default=None, description="File content for create/overwrite")
    old_str: str | None = Field(default=None, description="Text to find (edit command)")
    new_str: str | None = Field(default=None, description="Replacement text (edit/insert)")
    replace_all: bool = Field(default=False, description="Replace all occurrences (edit)")
    insert_line: int | None = Field(
        default=None,
        ge=0,
        description="Line number to insert after (0=beginning)",
    )


class WriteFileObservation(Observation):
    path: str = Field(default="")
    success: bool = Field(default=False)
    lines_changed: int = Field(default=0)
    content_hash: str = Field(default="")
    match_level: str | None = Field(default=None)
    occurrences_replaced: int | None = Field(default=None)
    ui_diff: dict[str, Any] | None = Field(default=None, exclude=True)

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        text = self.text or ""
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_659)
class WriteFileExecutor(ToolExecutor[WriteFileAction, WriteFileObservation]):
    def __init__(self, engine: FileToolEngine) -> None:
        self.engine = engine

    def __call__(
        self,
        action: WriteFileAction,
        conversation: object = None,
    ) -> WriteFileObservation:
        try:
            resolved = self.engine.resolve_path(action.path, for_write=True)
        except ValueError as exc:
            return self._error(str(exc), action.path)

        handler = {
            "create": self._handle_create,
            "edit": self._handle_edit,
            "overwrite": self._handle_overwrite,
            "insert": self._handle_insert,
            "undo": self._handle_undo,
        }.get(action.command)

        if handler is None:
            return self._error(f"Unknown command: {action.command}", action.path)

        return handler(action, resolved)

    def _handle_create(
        self,
        action: WriteFileAction,
        resolved: Any,
    ) -> WriteFileObservation:
        if resolved.exists():
            return self._error(
                f"File already exists: {action.path}. Use 'overwrite' or 'edit'.",
                action.path,
            )
        if action.content is None:
            return self._error("'content' is required for create.", action.path)

        self.engine.atomic_write(resolved, action.content)
        chash = self.engine.content_hash(action.content)
        self.engine.record_read(resolved, chash)
        line_count = len(action.content.splitlines())
        return WriteFileObservation.from_text(
            f"Created {action.path} ({line_count} lines).",
            path=action.path,
            success=True,
            lines_changed=line_count,
            content_hash=chash,
            ui_diff=self._build_ui_diff(
                path=action.path,
                operation=action.command,
                before_content=None,
                after_content=action.content,
                created=True,
            ),
        )

    def _handle_edit(
        self,
        action: WriteFileAction,
        resolved: Any,
    ) -> WriteFileObservation:
        try:
            self.engine.check_read_before_write(resolved)
        except ValueError as exc:
            return self._error(str(exc), action.path)

        if action.old_str is None:
            return self._error("'old_str' is required for edit.", action.path)
        if action.new_str is None:
            return self._error("'new_str' is required for edit.", action.path)
        if action.old_str == action.new_str:
            return self._error("old_str and new_str are identical.", action.path)

        encoding = self.engine.detect_encoding(resolved)
        content = resolved.read_text(encoding=encoding)

        if action.replace_all:
            return self._handle_replace_all(action, resolved, content, encoding)

        matches, count = self.engine.find_match(content, action.old_str)

        if count == 0:
            total = len(content.splitlines())
            return self._error(
                f"old_str not found in {action.path} "
                f"(checked: exact, whitespace-normalized, indent-adjusted, fuzzy). "
                f"The file has {total} lines. "
                f'Call read_file(path="{action.path}") to get fresh content, '
                f"then copy old_str exactly from that output. "
                f"If this keeps failing, use command='overwrite' with the full corrected content.",
                action.path,
            )

        if count > 1:
            line_nums = self.engine.find_line_numbers_for_occurrences(content, action.old_str)
            if not line_nums:
                line_nums_str = "(multiple, detected via fallback matching)"
            else:
                line_nums_str = ", ".join(str(n) for n in line_nums)
            return self._error(
                f"Found {count} occurrences of old_str at lines {line_nums_str}. "
                "Add more surrounding context lines to old_str to match uniquely, "
                "or set replace_all=true to replace every occurrence.",
                action.path,
            )

        match = matches[0]
        self.engine.push_undo(resolved, content)
        new_content = self.engine.apply_replacement(content, action.old_str, action.new_str, match)
        self.engine.atomic_write(resolved, new_content, encoding)
        chash = self.engine.content_hash(new_content)
        self.engine.record_read(resolved, chash)
        lines_changed = self.engine.count_changed_lines(content, new_content)

        msg = f"Applied edit to {action.path} ({lines_changed} lines changed)."
        if match.level != "exact":
            msg += f" Match level: {match.level}"
            if match.level == "fuzzy":
                msg += f" (similarity: {match.ratio:.2f})"
            msg += ". Verify the result."

        return WriteFileObservation.from_text(
            msg,
            path=action.path,
            success=True,
            lines_changed=lines_changed,
            content_hash=chash,
            match_level=match.level,
            occurrences_replaced=1,
            ui_diff=self._build_ui_diff(
                path=action.path,
                operation=action.command,
                before_content=content,
                after_content=new_content,
            ),
        )

    def _handle_replace_all(
        self,
        action: WriteFileAction,
        resolved: Any,
        content: str,
        encoding: str,
    ) -> WriteFileObservation:
        assert action.old_str is not None
        assert action.new_str is not None
        new_content, count = self.engine.apply_replacement_all(
            content,
            action.old_str,
            action.new_str,
        )
        if count == 0:
            return self._error(
                f"old_str not found in {action.path} (replace_all mode). "
                f'Call read_file(path="{action.path}") to get fresh content, '
                f"then copy old_str exactly from that output.",
                action.path,
            )
        self.engine.push_undo(resolved, content)
        self.engine.atomic_write(resolved, new_content, encoding)
        chash = self.engine.content_hash(new_content)
        self.engine.record_read(resolved, chash)
        lines_changed = self.engine.count_changed_lines(content, new_content)
        return WriteFileObservation.from_text(
            f"Replaced {count} occurrence(s) in {action.path} ({lines_changed} lines changed).",
            path=action.path,
            success=True,
            lines_changed=lines_changed,
            content_hash=chash,
            match_level="exact",
            occurrences_replaced=count,
            ui_diff=self._build_ui_diff(
                path=action.path,
                operation=action.command,
                before_content=content,
                after_content=new_content,
            ),
        )

    def _handle_overwrite(
        self,
        action: WriteFileAction,
        resolved: Any,
    ) -> WriteFileObservation:
        if not resolved.exists():
            return self._error(
                f"File not found: {action.path}. Use 'create' for new files.",
                action.path,
            )
        try:
            self.engine.check_read_before_write(resolved)
        except ValueError as exc:
            return self._error(str(exc), action.path)

        if action.content is None:
            return self._error("'content' is required for overwrite.", action.path)

        encoding = self.engine.detect_encoding(resolved)
        old_content = resolved.read_text(encoding=encoding)
        self.engine.push_undo(resolved, old_content)
        self.engine.atomic_write(resolved, action.content, encoding)
        chash = self.engine.content_hash(action.content)
        self.engine.record_read(resolved, chash)
        lines_changed = self.engine.count_changed_lines(old_content, action.content)
        return WriteFileObservation.from_text(
            f"Overwrote {action.path} ({lines_changed} lines changed).",
            path=action.path,
            success=True,
            lines_changed=lines_changed,
            content_hash=chash,
            ui_diff=self._build_ui_diff(
                path=action.path,
                operation=action.command,
                before_content=old_content,
                after_content=action.content,
            ),
        )

    def _handle_insert(
        self,
        action: WriteFileAction,
        resolved: Any,
    ) -> WriteFileObservation:
        if not resolved.exists():
            return self._error(f"File not found: {action.path}.", action.path)
        try:
            self.engine.check_read_before_write(resolved)
        except ValueError as exc:
            return self._error(str(exc), action.path)

        if action.insert_line is None:
            return self._error("'insert_line' is required for insert.", action.path)
        if action.new_str is None:
            return self._error("'new_str' is required for insert.", action.path)

        encoding = self.engine.detect_encoding(resolved)
        content = resolved.read_text(encoding=encoding)
        lines = content.splitlines(keepends=True)
        total = len(lines)

        if action.insert_line > total:
            return self._error(
                f"insert_line {action.insert_line} exceeds file length ({total} lines).",
                action.path,
            )

        new_lines = action.new_str.splitlines(keepends=True)
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines[-1] += "\n"

        insert_idx = action.insert_line
        result_lines = lines[:insert_idx] + new_lines + lines[insert_idx:]
        new_content = "".join(result_lines)

        self.engine.push_undo(resolved, content)
        self.engine.atomic_write(resolved, new_content, encoding)
        chash = self.engine.content_hash(new_content)
        self.engine.record_read(resolved, chash)
        inserted_count = len(new_lines)
        return WriteFileObservation.from_text(
            f"Inserted {inserted_count} line(s) after line {action.insert_line} in {action.path}.",
            path=action.path,
            success=True,
            lines_changed=inserted_count,
            content_hash=chash,
            ui_diff=self._build_ui_diff(
                path=action.path,
                operation=action.command,
                before_content=content,
                after_content=new_content,
            ),
        )

    def _handle_undo(
        self,
        action: WriteFileAction,
        resolved: Any,
    ) -> WriteFileObservation:
        previous = self.engine.pop_undo(resolved)
        if previous is None:
            return self._error(f"No edit history for {action.path}.", action.path)

        encoding = self.engine.detect_encoding(resolved) if resolved.exists() else "utf-8"
        current = resolved.read_text(encoding=encoding) if resolved.exists() else ""
        self.engine.atomic_write(resolved, previous, encoding)
        chash = self.engine.content_hash(previous)
        self.engine.record_read(resolved, chash)
        lines_changed = self.engine.count_changed_lines(current, previous)
        return WriteFileObservation.from_text(
            f"Undid last edit to {action.path} ({lines_changed} lines changed).",
            path=action.path,
            success=True,
            lines_changed=lines_changed,
            content_hash=chash,
            ui_diff=self._build_ui_diff(
                path=action.path,
                operation=action.command,
                before_content=current,
                after_content=previous,
            ),
        )

    @staticmethod
    def _error(msg: str, path: str) -> WriteFileObservation:
        return WriteFileObservation.from_text(msg, is_error=True, path=path)

    @staticmethod
    def _build_ui_diff(
        *,
        path: str,
        operation: str,
        before_content: str | None,
        after_content: str,
        created: bool = False,
    ) -> dict[str, Any] | None:
        diff = build_edit_diff(
            path=path,
            operation=operation,
            before_content=before_content,
            after_content=after_content,
            created=created,
        )
        if diff is None:
            return None
        return diff.model_dump(mode="json")


class WriteFileTool(ToolDefinition[WriteFileAction, WriteFileObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        engine: FileToolEngine = kwargs["engine"]
        return [
            cls(
                description=_WRITE_FILE_DESCRIPTION,
                action_type=WriteFileAction,
                observation_type=WriteFileObservation,
                executor=WriteFileExecutor(engine),
            ),
        ]
