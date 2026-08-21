from __future__ import annotations

import re
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator

from rotaris_core.reqtocode import SWR, traces

# Patterns that almost always indicate the model copied a truncated context
# attachment (VS Code / Copilot / generic chat-snippet renderers) into the
# `content` field instead of writing real source code. Writing these strings
# into a file destroys the original lines they pretend to summarise.
_TRUNCATION_PLACEHOLDER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\.\.\.\s*\(rest of the file\)", re.IGNORECASE),
    re.compile(r"\.\.\.\s*\(\d+\s+more\s+line", re.IGNORECASE),
    re.compile(r"//\s*\.\.\.\s*existing code", re.IGNORECASE),
    re.compile(r"#\s*\.\.\.\s*existing code", re.IGNORECASE),
    re.compile(r"<!--\s*\.\.\.\s*existing code", re.IGNORECASE),
    re.compile(r"/\*\s*\.\.\.\s*existing code", re.IGNORECASE),
    re.compile(
        r"\.\.\.\s*\(rest of (?:the )?(?:code|module|content|class|function)",
        re.IGNORECASE,
    ),
    re.compile(r"\.\.\.\s*\(snip", re.IGNORECASE),
    re.compile(r"\.\.\.\s*\(truncat", re.IGNORECASE),
    re.compile(r"\.\.\.\s*\(omitted", re.IGNORECASE),
    re.compile(r"\.\.\.\s*\(unchanged\)", re.IGNORECASE),
)


def _find_placeholder(content: str) -> str | None:
    for pattern in _TRUNCATION_PLACEHOLDER_PATTERNS:
        match = pattern.search(content)
        if match is not None:
            return match.group(0)
    return None


class HAETOperation(StrEnum):
    INSERT_BEFORE = "insert_before"
    INSERT_AFTER = "insert_after"
    REPLACE = "replace"
    DELETE = "delete"


@traces(SWR.SWR_1814, SWR.SWR_1815)
class HAETHunk(BaseModel):
    operation: HAETOperation
    anchor: str = Field(
        ...,
        min_length=4,
        max_length=4,
        pattern=r"^[0-9A-Za-z]{4}$",
        description=(
            "The 4-character anchor for the target line. "
            "This is the 4-char code inside the square brackets in haet_read output: "
            "for a line shown as '#[Ab12]  5 | return x', the anchor is 'Ab12' "
            "(not '#[Ab12]'). Copy it exactly — anchors are case-sensitive."
        ),
    )
    anchor_line_number: int = Field(
        ...,
        ge=1,
        description=(
            "The line number shown next to the anchor in haet_read output "
            "(the number after the anchor, before the '|'). Required for every hunk."
        ),
    )
    end_anchor: str | None = Field(
        default=None,
        min_length=4,
        max_length=4,
        pattern=r"^[0-9A-Za-z]{4}$",
        description=(
            "Anchor of the last line in a range replacement (replace operation only). "
            "All lines from 'anchor' through 'end_anchor' inclusive are replaced. "
            "Same extraction rule as 'anchor': use just the 4 chars inside [...]."
        ),
    )
    end_anchor_line_number: int | None = Field(
        default=None,
        ge=1,
        description=("Line number for end_anchor. Required whenever end_anchor is given."),
    )
    content: str | None = Field(
        default=None,
        description=(
            "New line content for insert_before, insert_after, and replace operations. "
            "Single line: plain string without trailing newline, e.g. '    return y'. "
            "Multiple lines: join lines with '\\n', e.g. 'line1\\nline2\\nline3'. "
            "Leading whitespace (indentation) is included verbatim. "
            "Omit this field entirely for delete operations."
        ),
    )
    context_before_hash: str | None = Field(
        default=None,
        pattern=r"^(BOF|EOF|[0-9a-f]{1,16})$",
        description=(
            "Optional drift-detection hash for the line immediately above 'anchor'. "
            "When provided, the engine verifies the neighbor still matches before "
            "applying the hunk; mismatch returns a structured context_mismatch error."
        ),
    )
    context_after_hash: str | None = Field(
        default=None,
        pattern=r"^(BOF|EOF|[0-9a-f]{1,16})$",
        description=(
            "Optional drift-detection hash for the line immediately below 'anchor' "
            "(or below 'end_anchor' when set)."
        ),
    )
    end_context_before_hash: str | None = Field(
        default=None,
        pattern=r"^(BOF|EOF|[0-9a-f]{1,16})$",
        description="Optional drift-detection hash for the line above 'end_anchor'.",
    )
    end_context_after_hash: str | None = Field(
        default=None,
        pattern=r"^(BOF|EOF|[0-9a-f]{1,16})$",
        description="Optional drift-detection hash for the line below 'end_anchor'.",
    )

    @model_validator(mode="after")
    def validate_content_rules(self) -> HAETHunk:
        if self.operation == HAETOperation.DELETE and self.content is not None:
            raise ValueError("DELETE hunks must not include content")
        if self.operation != HAETOperation.DELETE and self.content is None:
            raise ValueError(f"{self.operation.value} hunks must include content")
        if self.end_anchor is not None and self.operation != HAETOperation.REPLACE:
            raise ValueError("end_anchor is only valid for REPLACE operations")
        if self.end_anchor is not None and self.end_anchor_line_number is None:
            raise ValueError("end_anchor_line_number is required whenever end_anchor is provided")
        if self.end_anchor is None and self.end_anchor_line_number is not None:
            raise ValueError("end_anchor_line_number must not be set without end_anchor")
        if self.content is not None:
            placeholder = _find_placeholder(self.content)
            if placeholder is not None:
                raise ValueError(
                    "content contains a truncation placeholder "
                    f"({placeholder!r}). HAET writes content verbatim — "
                    "placeholders like '... (rest of the file)' or "
                    "'// ...existing code...' must NOT appear in `content`. "
                    "Write the literal lines you want in the file. To leave "
                    "surrounding lines untouched, narrow your anchor/end_anchor "
                    "range so only the lines you actually want changed are covered.",
                )
        return self


class HAETPatchRequest(BaseModel):
    file_path: str
    snapshot_id: str = Field(
        ...,
        min_length=1,
        description=(
            "Snapshot id returned by the haet_read call whose anchors this "
            "patch references. The engine rejects edits whose snapshot has "
            "gone stale (file changed since the read), then attempts a one-shot "
            "re-anchor before returning a structured snapshot_mismatch error."
        ),
    )
    hunks: list[HAETHunk] = Field(..., min_length=1)
    commit: bool = False


class HAETRecoveryCandidate(BaseModel):
    """A single relocation candidate for a stale anchor."""

    line_number: int
    anchor: str
    content_preview: str


class HAETRecoveryPayload(BaseModel):
    """Structured recovery hint emitted on snapshot/anchor mismatch."""

    fresh_snapshot_id: str
    candidates: list[HAETRecoveryCandidate] = Field(default_factory=list)


class HAETPatchValidationError(BaseModel):
    hunk_index: int
    anchor: str
    error: str
    details: str
    recovery: HAETRecoveryPayload | None = None


class HAETHunkResult(BaseModel):
    """Summary of what a single applied hunk actually changed in the file."""

    hunk_index: int
    operation: str
    line: int  # 1-based line number of the anchor (before edit)
    # lines deleted from the file (0 for insert_before/insert_after)
    lines_removed: int
    lines_added: int  # lines written into the file (0 for delete)


class HAETPatchResult(BaseModel):
    success: bool
    file_path: str
    hunks_applied: int
    hunk_results: list[HAETHunkResult] = Field(default_factory=list)
    errors: list[HAETPatchValidationError] = Field(default_factory=list)
    old_content: str | None = Field(default=None, exclude=True)
    new_content: str | None = None
    # Snapshot id of the file *after* a successful write. Lets the model chain
    # follow-up edits without re-reading. Equal to the request snapshot_id when
    # success is False (the file was not modified).
    new_snapshot_id: str | None = None
    # True when the engine relocated stale anchors via its one-shot re-anchor
    # path. The model should treat anchors from its prior read as untrusted
    # for further edits and re-read.
    relocated: bool = False
