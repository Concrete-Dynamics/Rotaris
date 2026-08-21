"""LLM-based completion classifier for the RalphLoop.

After each iteration that the orchestrator reports as "succeeded", this
classifier makes a single cheap LLM call — using the ``small_model`` alias —
to determine whether the task is genuinely done or needs another round.

This replaces fragile keyword-based heuristics with semantic understanding.
The classifier is intentionally lenient: UNCLEAR always counts as COMPLETE so
a transient LLM failure never blocks a run.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, cast

from rotaris_core.llm_threads import call_llm_detached
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import LLM

    from rotaris_core.orchestrator.report import ChildReportArtifact

_log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a task completion classifier for an AI agent system.

Given a task description and a summary of what the agent accomplished, \
determine whether the task is complete or needs another iteration.

Return ONLY a JSON object — no prose, no markdown fences:
{"verdict": "COMPLETE" | "NEEDS_ITERATION" | "UNCLEAR", "reason": "One concise sentence."}

Rules:
- COMPLETE: the task was fully addressed. Minor suggestions, a recommendation to \
rebuild/verify, or open housekeeping todos do NOT prevent COMPLETE.
- NEEDS_ITERATION: there is CLEAR evidence of unfinished required work — e.g. the \
agent explicitly states a required step was skipped, a required file was not created, \
a required fix was not applied, or blocking errors were not resolved.
- UNCLEAR: you cannot determine from the summary alone. When in doubt, use UNCLEAR.

UNCLEAR always counts as COMPLETE. Only use NEEDS_ITERATION for unmistakable failures.\
"""

_USER_TEMPLATE = """\
TASK:
{intent}

AGENT SUMMARY:
{summary}

OPEN TODOS (if any):
{open_todos}\
"""

_CLASSIFIER_TIMEOUT = 15.0


@dataclass
class CompletionVerdict:
    """Result of a completion classification call."""

    verdict: Literal["COMPLETE", "NEEDS_ITERATION", "UNCLEAR"]
    reason: str


@traces(SWR.SWR_123)
class CompletionClassifier:
    """Classifies whether a completed iteration is done or needs another round.

    Uses a small/cheap LLM to avoid burning expensive tokens on a meta-task.
    Instantiate with any ``LLM`` — typically the ``small_model``-aliased one.
    """

    def __init__(self, llm: LLM, timeout: float = _CLASSIFIER_TIMEOUT) -> None:
        self.llm = llm
        self.timeout = timeout

    async def classify(
        self,
        report: ChildReportArtifact,
        intent: str,
        open_todos: list[str],
    ) -> CompletionVerdict:
        """Return a :class:`CompletionVerdict`.

        Timeouts and LLM errors always return UNCLEAR so the run is never
        blocked by a transient classifier failure.
        """

        async def _run() -> CompletionVerdict:
            from openhands.sdk.llm.message import Message, TextContent

            todos_text = "\n".join(f"- {t}" for t in open_todos) if open_todos else "None"
            user_content = _USER_TEMPLATE.format(
                intent=intent[:2000],
                summary=(report.summary or "")[:1500],
                open_todos=todos_text,
            )
            # Detached so a hung provider cannot outlive self.timeout and stall
            # the host's loop shutdown; see rotaris_core.llm_threads.
            response = await call_llm_detached(
                self.llm.completion,
                [
                    Message(role="system", content=[TextContent(text=_SYSTEM_PROMPT)]),
                    Message(role="user", content=[TextContent(text=user_content)]),
                ],
            )
            text = _extract_text(response).strip()
            return _parse_verdict(text)

        try:
            return await asyncio.wait_for(_run(), timeout=self.timeout)
        except TimeoutError:
            _log.warning(
                "CompletionClassifier timed out after %.0fs; treating as UNCLEAR",
                self.timeout,
            )
            return CompletionVerdict(verdict="UNCLEAR", reason="classification timed out")
        except Exception as exc:  # noqa: BLE001
            _log.warning("CompletionClassifier error (%s); treating as UNCLEAR", exc)
            return CompletionVerdict(verdict="UNCLEAR", reason=f"classification error: {exc}")


def _extract_text(response: object) -> str:
    from openhands.sdk.llm.message import TextContent

    message = getattr(response, "message", None)
    if message is None:
        return ""
    parts: list[str] = []
    for item in getattr(message, "content", []) or []:
        if isinstance(item, TextContent):
            parts.append(item.text)
        else:
            text = getattr(item, "text", None)
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(p for p in parts if p)


def _parse_verdict(text: str) -> CompletionVerdict:
    """Parse the JSON verdict from the classifier response."""
    if not text:
        return CompletionVerdict(verdict="UNCLEAR", reason="empty classifier response")

    # Strip markdown fences if the model added them despite instructions.
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        stripped = "\n".join(line for line in lines if not line.startswith("```")).strip()

    try:
        data = json.loads(stripped)
        raw_verdict = str(data.get("verdict", "")).upper()
        reason = str(data.get("reason", "no reason given"))
        if raw_verdict in ("COMPLETE", "NEEDS_ITERATION", "UNCLEAR"):
            verdict = cast("Literal['COMPLETE', 'NEEDS_ITERATION', 'UNCLEAR']", raw_verdict)
            return CompletionVerdict(verdict=verdict, reason=reason)
        return CompletionVerdict(verdict="UNCLEAR", reason=f"unknown verdict: {raw_verdict}")
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: plain-text scan for the verdict keyword.
    upper = stripped.upper()
    if "NEEDS_ITERATION" in upper:
        lines = [ln.strip() for ln in stripped.splitlines() if ln.strip()]
        reason = lines[1] if len(lines) > 1 else stripped[:200]
        return CompletionVerdict(verdict="NEEDS_ITERATION", reason=reason)
    if "COMPLETE" in upper:
        return CompletionVerdict(verdict="COMPLETE", reason=stripped[:200])
    return CompletionVerdict(verdict="UNCLEAR", reason="could not parse classifier response")
