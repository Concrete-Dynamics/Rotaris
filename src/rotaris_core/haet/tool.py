from __future__ import annotations

from typing import TYPE_CHECKING, Any, Self

from openhands.sdk import Action, Observation, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field, ValidationError, field_validator

from rotaris_core.edit_diff import build_edit_diff
from rotaris_core.haet.patch import HAETHunk, HAETPatchRequest, HAETPatchResult
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.haet.engine import HAETEngine

_HAET_READ_DESCRIPTION = """\
Read a file and return its lines tagged with stable 4-character hash anchors.
Use this to obtain the snapshot_id and anchors required by haet_edit.

OUTPUT FORMAT:
  Header line: # haet_read: path (N lines, showing X-Y) snapshot_id=<hex> | ...
  Body lines : #[ANCHOR]  LINE_NUM | content
                - ANCHOR   : 4 chars inside [...] — pass as `anchor`
                - LINE_NUM : 1-based line number — pass as `anchor_line_number`

  Example:
    # haet_read: src/app.py (10 lines, showing 1-10) snapshot_id=ab12cd34ef56...
    #[Ab12]    1 | def greet(name):
    #[0AbC]    2 |
    #[X7Y9]    3 |     return f"hello {name}"

ANCHOR + SNAPSHOT CONTRACT:
  - The same line text always produces the same 4-char anchor (collisions are
    rare but still possible — anchor_line_number is always required, so the
    engine resolves any ambiguity for you).
  - snapshot_id is the file's content fingerprint at read time. Pass it back
    to haet_edit so the engine can detect stale reads.
  - After a successful haet_edit, the response carries a new snapshot_id you
    can use for follow-up edits without re-reading.

PAGINATION:
  Up to 300 lines per call. For larger files pass offset=300, 600, etc.
"""

_HAET_EDIT_DESCRIPTION = """\
Edit a file using HAET hash-anchored line references.

REQUIRED FIELDS — every call:
  file_path     : path you read with haet_read
  snapshot_id   : the snapshot_id from that haet_read header
  hunks         : JSON ARRAY of hunk objects

REQUIRED FIELDS — every hunk:
  operation            : "insert_before" | "insert_after" | "replace" | "delete"
  anchor               : 4-char code from [...] in haet_read
  anchor_line_number   : line number shown beside the anchor
  content              : new text (omit for delete only)

WHEN TO ADD end_anchor (replace only):
  Use end_anchor + end_anchor_line_number whenever the block you want to
  replace spans more than one line. A single-anchor replace touches ONLY
  that one line; lines below remain as orphans. Replacing 1 line with N
  lines (where N > 20) is rejected outright.

EXAMPLE — single-line replace:
  haet_edit(
    file_path="src/app.py",
    snapshot_id="ab12cd34ef56...",
    hunks=[{
      "operation": "replace",
      "anchor": "Ab12",
      "anchor_line_number": 1,
      "content": "def greet(name: str) -> str:"
    }]
  )

EXAMPLE — replace a 3-line block with 1 line:
  hunks=[{
    "operation": "replace",
    "anchor": "Ab12",  "anchor_line_number": 3,
    "end_anchor": "X7Y9",  "end_anchor_line_number": 5,
    "content": "    return f\\"hello {name}\\""
  }]

CONTENT FORMAT:
  Single line   : plain string, no trailing newline.
  Multiple lines: join with "\\n".
  Indentation is verbatim. Truncation placeholders ("... existing code",
  "... (rest of file)", "... (snip)" etc.) are rejected — write the literal
  lines you want or narrow your anchor range.

OPTIONAL DRIFT-DETECTION HASHES:
  context_before_hash / context_after_hash
  end_context_before_hash / end_context_after_hash
  Use the hashes you computed locally over the surrounding lines if you want
  the engine to reject the edit when the surrounding code drifted. Sentinels
  "BOF" / "EOF" are accepted at file boundaries. These are optional; omit
  unless you have a concrete reason to verify.

STALE READS — what happens automatically:
  If the file changed since you read it, the engine attempts a one-shot
  re-anchor by content+line-number proximity. If every hunk relocates
  uniquely, the edit applies and the response sets `relocated=true`.
  Otherwise it returns a `snapshot_mismatch` error with a `recovery` payload
  listing candidate lines and the fresh snapshot_id — re-read and retry.

ERROR CODES:
  snapshot_mismatch              — file changed and re-anchor failed; see recovery
  anchor_line_not_found          — anchor_line_number is past EOF; re-read
  anchor_line_mismatch           — line number does not carry that anchor; re-read
  end_anchor_line_mismatch       — same, for end_anchor
  end_before_start               — end_anchor_line_number < anchor_line_number
  context_mismatch               — optional context hash did not match; re-read
  single_anchor_replace_too_large — replace without end_anchor wrote >20 lines
"""


class HAETReadAction(Action):
    file_path: str = Field(...)
    offset: int = Field(default=0, ge=0, description="Line offset to start reading from (0-based).")


class HAETReadObservation(Observation):
    pass


class HAETReadExecutor(ToolExecutor[HAETReadAction, HAETReadObservation]):
    def __init__(self, engine: HAETEngine) -> None:
        self.engine = engine

    def __call__(self, action: HAETReadAction, conversation: object = None) -> HAETReadObservation:
        del conversation
        try:
            tagged_file = self.engine.read_file(action.file_path)
        except Exception as exc:
            return HAETReadObservation.from_text(str(exc), is_error=True)
        return HAETReadObservation.from_text(tagged_file.render_for_llm(offset=action.offset))


class HAETReadTool(ToolDefinition[HAETReadAction, HAETReadObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        engine: HAETEngine = kwargs["engine"]
        executor = HAETReadExecutor(engine)
        return [
            cls(
                description=_HAET_READ_DESCRIPTION,
                action_type=HAETReadAction,
                observation_type=HAETReadObservation,
                executor=executor,
            ),
        ]


class HAETEditAction(Action):
    file_path: str = Field(...)
    snapshot_id: str = Field(
        ...,
        min_length=1,
        description=(
            "snapshot_id from the haet_read header that produced these anchors. "
            "Required so the engine can detect stale reads."
        ),
    )
    hunks: list[HAETHunk] = Field(
        ...,
        description="List of edit operations, each targeting one line by its 4-char anchor.",
    )
    commit: bool = Field(default=False)

    @field_validator("hunks", mode="before")
    @classmethod
    def normalize_hunks(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return [value]

        if not isinstance(value, list):
            raise ValueError(
                "hunks must be a JSON array of hunk objects. For a single edit, pass "
                '[{"operation":"replace","anchor":"Ab12","anchor_line_number":3,'
                '"content":"..."}] instead of a single object.',
            )

        for index, item in enumerate(value):
            if not isinstance(item, dict):
                raise ValueError(f"hunks[{index}] must be an object")
            if "operation" not in item:
                raise ValueError(f"hunks[{index}] is missing required field 'operation'.")

        return value


class HAETEditObservation(Observation):
    ui_diff: dict[str, Any] | None = Field(default=None, exclude=True)


class HAETEditExecutor(ToolExecutor[HAETEditAction, HAETEditObservation]):
    def __init__(self, engine: HAETEngine) -> None:
        self.engine = engine

    def __call__(self, action: HAETEditAction, conversation: object = None) -> HAETEditObservation:
        del conversation
        try:
            request = HAETPatchRequest(
                file_path=action.file_path,
                snapshot_id=action.snapshot_id,
                hunks=action.hunks,
                commit=action.commit,
            )
            result = self.engine.apply_patch(request)
        except ValidationError as exc:
            return HAETEditObservation.from_text(_format_haet_validation_error(exc), is_error=True)
        except Exception as exc:
            return HAETEditObservation.from_text(str(exc), is_error=True)

        if not result.success:
            return HAETEditObservation.from_text(_render_failure(result), is_error=True)

        return HAETEditObservation.from_text(
            _render_success(result),
            ui_diff=_build_ui_diff(result),
        )


def _render_success(result: HAETPatchResult) -> str:
    header = (
        f"OK: applied {result.hunks_applied} hunk(s) to {result.file_path}"
        f" (new snapshot_id={result.new_snapshot_id})"
    )
    if result.relocated:
        header += " [RELOCATED: file had changed; engine re-anchored uniquely]"
    lines = [header]
    warnings: list[str] = []
    for hr in result.hunk_results:
        if hr.operation in ("insert_before", "insert_after"):
            lines.append(
                f"  hunk {hr.hunk_index}: {hr.operation} at line {hr.line}"
                f" — inserted {hr.lines_added} line(s)",
            )
        elif hr.operation == "replace":
            lines.append(
                f"  hunk {hr.hunk_index}: replace line {hr.line}"
                f" — removed {hr.lines_removed} line(s), inserted {hr.lines_added} line(s)",
            )
            if hr.lines_removed == 1 and hr.lines_added > 1:
                net = hr.lines_added - hr.lines_removed
                warnings.append(
                    f"WARNING hunk {hr.hunk_index}: 1 line replaced with "
                    f"{hr.lines_added} (net +{net}). If you meant to replace a "
                    f"multi-line block, set end_anchor next time.",
                )
        else:  # delete
            lines.append(f"  hunk {hr.hunk_index}: delete line {hr.line}")
    lines.extend(warnings)
    return "\n".join(lines)


def _render_failure(result: HAETPatchResult) -> str:
    out: list[str] = [
        f"FAIL: no hunks applied to {result.file_path} "
        f"(current snapshot_id={result.new_snapshot_id})",
    ]
    for err in result.errors:
        prefix = f"  hunk {err.hunk_index}" if err.hunk_index >= 0 else "  request"
        out.append(f"{prefix}: [{err.error}] {err.details}")
        if err.recovery is not None and err.recovery.candidates:
            out.append(
                f"    recovery: fresh snapshot_id={err.recovery.fresh_snapshot_id}; candidates:",
            )
            for cand in err.recovery.candidates:
                out.append(
                    f"      L{cand.line_number} anchor={cand.anchor!r}"
                    f" content={cand.content_preview!r}",
                )
        elif err.recovery is not None:
            out.append(f"    recovery: fresh snapshot_id={err.recovery.fresh_snapshot_id}")
    return "\n".join(out)


def _format_haet_validation_error(exc: ValidationError) -> str:
    lines = [
        "Invalid haet_edit payload.",
        "Required: file_path, snapshot_id, "
        "hunks=[{operation, anchor, anchor_line_number, content?}]",
    ]
    for error in exc.errors(include_url=False):
        location = ".".join(str(part) for part in error.get("loc", ())) or "payload"
        lines.append(f"- {location}: {error.get('msg', 'invalid value')}")
    lines.append(
        'Example: {"file_path":"src/app.py","snapshot_id":"<from haet_read>",'
        '"hunks":[{"operation":"replace","anchor":"Ab12","anchor_line_number":3,'
        '"content":"return 1"}]}',
    )
    return "\n".join(lines)


@traces(SWR.SWR_639, SWR.SWR_666)
class HAETEditTool(ToolDefinition[HAETEditAction, HAETEditObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        engine: HAETEngine = kwargs["engine"]
        executor = HAETEditExecutor(engine)
        return [
            cls(
                description=_HAET_EDIT_DESCRIPTION,
                action_type=HAETEditAction,
                observation_type=HAETEditObservation,
                executor=executor,
            ),
        ]


def _build_ui_diff(result: HAETPatchResult) -> dict[str, Any] | None:
    if result.old_content is None or result.new_content is None:
        return None
    diff = build_edit_diff(
        path=result.file_path,
        operation="haet_edit",
        before_content=result.old_content,
        after_content=result.new_content,
    )
    if diff is None:
        return None
    return diff.model_dump(mode="json")
