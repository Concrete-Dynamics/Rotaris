"""Lightweight post-iteration intent alignment checker for the RalphLoop.

After each iteration that the orchestrator reports as "succeeded", the validator
makes a cheap LLM call to verify that the work actually addressed the user's
original request.  False-positive validation errors are better than silently
accepting clearly wrong results (e.g. researching a topic instead of creating a
file), so the validator is intentionally lenient: when in doubt it returns
ALIGNED.  Only unambiguous misalignments — where the work delivered a clearly
different outcome than what was asked — are flagged.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import LLM

_log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an intent alignment checker.

Given a user's original request and a summary of what was actually done, \
determine whether the completed work addressed the request.

Rules:
- ALIGNED: the work delivered what was asked, even if interpreted broadly or split into steps
- MISALIGNED: the work clearly failed to do what was asked \
(e.g. researched instead of creating, created the wrong type of artefact, \
solved a different problem entirely)
- When in doubt, prefer ALIGNED — only flag unmistakable failures

Output format — exactly two lines:
ALIGNED   (or)   MISALIGNED
One concise sentence explaining your verdict."""

_USER_TEMPLATE = """\
ORIGINAL REQUEST:
{intent}

WHAT WAS DONE:
{summary}"""

_VALIDATION_TIMEOUT = 20.0


@dataclass
class IntentAlignmentResult:
    """Result of an intent alignment check."""

    aligned: bool
    reason: str


@traces(SWR.SWR_156)
class IntentValidator:
    """Checks whether a completed iteration actually addressed the original task.

    Instantiate with any ``LLM`` instance — typically reusing the summary
    model so no extra model configuration is needed.
    """

    def __init__(self, llm: LLM, timeout: float = _VALIDATION_TIMEOUT) -> None:
        self.llm = llm
        self.timeout = timeout

    async def validate(
        self,
        original_intent: str,
        report_summary: str,
    ) -> IntentAlignmentResult:
        """Return ``IntentAlignmentResult(aligned=True/False, reason=…)``.

        On timeout or unexpected LLM error the method logs a warning and returns
        ``aligned=True`` so a transient validator failure never blocks the run.
        """

        async def _run() -> IntentAlignmentResult:
            from openhands.sdk.llm.message import Message, TextContent

            user_content = _USER_TEMPLATE.format(
                intent=original_intent[:2000],
                summary=report_summary[:1000],
            )
            response = await asyncio.to_thread(
                self.llm.completion,
                [
                    Message(role="system", content=[TextContent(text=_SYSTEM_PROMPT)]),
                    Message(role="user", content=[TextContent(text=user_content)]),
                ],
            )
            text = _extract_text(response).strip()
            return _parse_result(text)

        try:
            return await asyncio.wait_for(_run(), timeout=self.timeout)
        except TimeoutError:
            _log.warning(
                "Intent validation timed out after %.0fs; treating as aligned",
                self.timeout,
            )
            return IntentAlignmentResult(aligned=True, reason="validation timed out")
        except Exception as exc:  # noqa: BLE001
            _log.warning("Intent validation error (%s); treating as aligned", exc)
            return IntentAlignmentResult(aligned=True, reason=f"validation error: {exc}")


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


def _parse_result(text: str) -> IntentAlignmentResult:
    """Parse the two-line validator response into an ``IntentAlignmentResult``."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return IntentAlignmentResult(aligned=True, reason="empty validator response")

    verdict = lines[0].upper()
    reason = lines[1] if len(lines) > 1 else lines[0]

    if "MISALIGNED" in verdict:
        return IntentAlignmentResult(aligned=False, reason=reason)
    return IntentAlignmentResult(aligned=True, reason=reason)
