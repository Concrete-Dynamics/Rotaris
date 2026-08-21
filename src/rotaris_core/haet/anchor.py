from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_1814)
class TaggedLine(BaseModel):
    line_number: int = Field(..., ge=1)
    anchor: str = Field(..., min_length=4, max_length=4, pattern=r"^[0-9A-Za-z]{4}$")
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if value.endswith(("\n", "\r")):
            raise ValueError("content must not contain a trailing newline")
        return value


class TaggedFile(BaseModel):
    path: str
    lines: list[TaggedLine]
    encoding: str = "utf-8"
    line_ending: str = "\n"
    snapshot_id: str = Field(
        ...,
        description=(
            "Content-derived id for this read. Pass it back to haet_edit so the "
            "engine can detect stale reads."
        ),
    )

    def get_line_by_anchor(self, anchor: str) -> list[TaggedLine]:
        return [line for line in self.lines if line.anchor == anchor]

    def get_line_by_number(self, line_number: int) -> TaggedLine | None:
        for line in self.lines:
            if line.line_number == line_number:
                return line
        return None

    _MAX_LLM_LINES = 300

    def render_for_llm(self, offset: int = 0) -> str:
        total = len(self.lines)
        window = self.lines[offset : offset + self._MAX_LLM_LINES]

        if offset >= total > 0:
            return (
                f"# haet_read: {self.path} ({total} line{'s' if total != 1 else ''})"
                f" | no more lines at offset={offset}"
            )

        end_shown = min(offset + self._MAX_LLM_LINES, total)
        header = (
            f"# haet_read: {self.path}"
            f" ({total} line{'s' if total != 1 else ''},"
            f" showing {offset + 1}–{end_shown})"
            f" snapshot_id={self.snapshot_id}"
            f' | anchor = 4-char code inside []; e.g. "#[Ab12]" → anchor="Ab12"'
        )
        body = "\n".join(
            f"#[{line.anchor}] {line.line_number:>5} | {line.content}" for line in window
        )
        rendered = header + ("\n" + body if body else "")
        if total > offset + self._MAX_LLM_LINES:
            remaining = total - (offset + self._MAX_LLM_LINES)
            rendered += (
                f"\n... ({remaining} more line{'s' if remaining != 1 else ''} not shown"
                f" — re-read with offset={offset + self._MAX_LLM_LINES} to continue)"
            )
        return rendered
