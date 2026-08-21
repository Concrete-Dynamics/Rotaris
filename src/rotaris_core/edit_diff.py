from __future__ import annotations

from difflib import SequenceMatcher
from typing import Literal, cast

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces

DiffLineKind = Literal["context", "add", "delete"]

DEFAULT_DIFF_CONTEXT_LINES = 3
DEFAULT_DIFF_MAX_CHANGED_LINES = 50


class EditDiffLine(BaseModel):
    kind: DiffLineKind
    line_number: int = Field(ge=1)
    text: str


class EditDiffArtifact(BaseModel):
    diff_id: str = ""
    agent_name: str = ""
    tool_name: str = ""
    tool_event_key: str | None = None
    path: str
    operation: str
    created: bool = False
    added_lines: int = 0
    removed_lines: int = 0
    entries: list[EditDiffLine] = Field(default_factory=list)
    truncated: bool = False
    remaining_changed_lines: int = 0


@traces(SWR.SWR_1233, SWR.SWR_1238)
def build_edit_diff(
    *,
    path: str,
    operation: str,
    before_content: str | None,
    after_content: str,
    created: bool = False,
    max_changed_lines: int = DEFAULT_DIFF_MAX_CHANGED_LINES,
    context_lines: int = DEFAULT_DIFF_CONTEXT_LINES,
) -> EditDiffArtifact | None:
    before_lines = _split_lines(before_content)
    after_lines = _split_lines(after_content)
    matcher = SequenceMatcher(a=before_lines, b=after_lines)
    opcodes = matcher.get_opcodes()

    added_lines = 0
    removed_lines = 0
    for tag, i1, i2, j1, j2 in opcodes:
        if tag in {"replace", "insert"}:
            added_lines += j2 - j1
        if tag in {"replace", "delete"}:
            removed_lines += i2 - i1

    total_changed_lines = added_lines + removed_lines
    if total_changed_lines == 0:
        return None

    entries: list[EditDiffLine] = []
    rendered_changed_lines = 0
    truncated = False
    include_context = total_changed_lines <= max_changed_lines
    grouped_opcodes = matcher.get_grouped_opcodes(context_lines)

    for group in grouped_opcodes:
        if truncated:
            break
        for raw_tag, i1, i2, j1, j2 in group:
            tag = cast('Literal["replace", "delete", "insert", "equal"]', raw_tag)
            if tag == "equal":
                if not include_context:
                    continue
                if rendered_changed_lines >= max_changed_lines:
                    truncated = True
                    break
                for offset, line in enumerate(after_lines[j1:j2], start=j1 + 1):
                    entries.append(EditDiffLine(kind="context", line_number=offset, text=line))
                continue

            if tag in {"replace", "delete"}:
                for index in range(i1, i2):
                    if rendered_changed_lines >= max_changed_lines:
                        truncated = True
                        break
                    entries.append(
                        EditDiffLine(
                            kind="delete",
                            line_number=index + 1,
                            text=before_lines[index],
                        ),
                    )
                    rendered_changed_lines += 1
                if truncated:
                    break

            if tag in {"replace", "insert"}:
                for index in range(j1, j2):
                    if rendered_changed_lines >= max_changed_lines:
                        truncated = True
                        break
                    entries.append(
                        EditDiffLine(
                            kind="add",
                            line_number=index + 1,
                            text=after_lines[index],
                        ),
                    )
                    rendered_changed_lines += 1
                if truncated:
                    break

    return EditDiffArtifact(
        path=path,
        operation=operation,
        created=created,
        added_lines=added_lines,
        removed_lines=removed_lines,
        entries=entries,
        truncated=truncated,
        remaining_changed_lines=max(0, total_changed_lines - rendered_changed_lines),
    )


def _split_lines(content: str | None) -> list[str]:
    if not content:
        return []
    return content.splitlines()
