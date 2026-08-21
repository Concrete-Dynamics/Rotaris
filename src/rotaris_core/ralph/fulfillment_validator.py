"""End-of-run fulfillment checker for relentless mode.

Where ``IntentValidator`` checks alignment of a single iteration, the
``FulfillmentValidator`` decides whether the *cumulative* work performed
across all iterations has fully addressed the user's original request.

It is intentionally strict in the opposite direction from ``IntentValidator``:
when in doubt the validator returns ``fulfilled=True`` (so a transient LLM
hiccup never traps the run in an infinite relentless loop), but it returns a
list of concrete remaining gaps when it can identify any. The ralph loop uses
those gaps to spawn remediation tasks and continue iterating.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import LLM

_log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a fulfillment auditor for an autonomous coding agent.

Given a user's original request and a chronological log of every iteration the \
agent completed, decide whether the request has been FULLY fulfilled.

Rules:
- FULFILLED: every acceptance criterion implied by the request was addressed by \
the completed iterations. Minor cosmetic gaps do NOT count.
- UNFULFILLED: at least one concrete deliverable from the original request is \
missing or only partially done.
- When in doubt, prefer FULFILLED. Only flag clear, concrete gaps.

Output format — exactly this shape:
LINE 1: FULFILLED  (or)  UNFULFILLED
LINE 2: one concise sentence justifying the verdict
If UNFULFILLED, additional lines: each line one remaining gap, prefixed with '- '.
List at most 5 gaps. Each gap must be specific and actionable (a missing file, \
a missing behaviour, a missing test, etc.) — never vague."""

_USER_TEMPLATE = """\
ORIGINAL REQUEST:
{intent}

ITERATION LOG (chronological):
{summaries}"""

_VALIDATION_TIMEOUT = 30.0
_MAX_GAPS = 5


@dataclass
class FulfillmentResult:
    """Outcome of a fulfillment audit."""

    fulfilled: bool
    reason: str
    gaps: list[str] = field(default_factory=list)


@traces(SWR.SWR_361, SWR.SWR_362)
class FulfillmentValidator:
    """LLM-backed audit of cumulative iteration output vs. the original request."""

    def __init__(self, llm: LLM, timeout: float = _VALIDATION_TIMEOUT) -> None:
        self.llm = llm
        self.timeout = timeout

    async def validate(
        self,
        original_intent: str,
        iteration_summaries: list[str],
    ) -> FulfillmentResult:
        """Return ``FulfillmentResult``. Returns ``fulfilled=True`` on any error."""

        async def _run() -> FulfillmentResult:
            from openhands.sdk.llm.message import Message, TextContent

            joined = "\n\n".join(f"#{i + 1}: {s}" for i, s in enumerate(iteration_summaries) if s)
            user_content = _USER_TEMPLATE.format(
                intent=original_intent[:4000],
                summaries=joined[:8000],
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
                "Fulfillment validation timed out after %.0fs; treating as fulfilled",
                self.timeout,
            )
            return FulfillmentResult(fulfilled=True, reason="validation timed out")
        except Exception as exc:  # noqa: BLE001
            _log.warning("Fulfillment validation error (%s); treating as fulfilled", exc)
            return FulfillmentResult(fulfilled=True, reason=f"validation error: {exc}")


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


def _parse_result(text: str) -> FulfillmentResult:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return FulfillmentResult(fulfilled=True, reason="empty validator response")

    verdict = lines[0].upper()
    reason = lines[1] if len(lines) > 1 else lines[0]

    fulfilled = "UNFULFILLED" not in verdict
    gaps: list[str] = []
    if not fulfilled:
        for line in lines[2:]:
            stripped = line.lstrip("-• \t").strip()
            if stripped:
                gaps.append(stripped)
            if len(gaps) >= _MAX_GAPS:
                break
    return FulfillmentResult(fulfilled=fulfilled, reason=reason, gaps=gaps)
