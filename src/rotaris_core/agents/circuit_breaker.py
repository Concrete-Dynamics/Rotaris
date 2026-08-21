#!/usr/bin/env python3
"""Circuit Breaker agent — hidden loop supervisor.

The Circuit Breaker is NOT a public persona. It must never be registered with
the SDK's ``register_agent`` and must never appear in persona listings.
The only entry points are :class:`CircuitBreaker` and :class:`CircuitBreakerSession`,
which are used internally by the scheduler.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import PurePath
from typing import TYPE_CHECKING

from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.llm_threads import call_llm_detached
from rotaris_core.orchestrator.report import EscalationSignal
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sdk_text import sanitize_visible_text

if TYPE_CHECKING:
    from collections.abc import Callable

    from openhands.sdk import LLM

    from rotaris_core.config.schema import CircuitBreakerConfig, RotarisConfig

_log = logging.getLogger(__name__)

_PATH_RE = re.compile(r"(?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+")

_SYSTEM_PROMPT = """You are the Circuit Breaker, a hidden supervision layer for an
agent conversation. Review the recent transcript and decide whether the agent is
stuck in an unproductive loop.
DO NOT flag creativity, exploration, or normal troubleshooting cycles.
Only flag if the agent is circling around the SAME FAILED approach without
making progress toward the goal.

Return ONLY valid JSON matching exactly this schema:
{
  "loop_detected": true,
  "reason": "short string",
  "corrective_message": "single natural user message"
}

Rules:
- `loop_detected` must be strictly boolean.
- If `loop_detected` is false, `corrective_message` must be null.
- If `loop_detected` is true, `corrective_message` must:
  - sound like a natural in-context instruction from the user
  - avoid mentioning monitoring, supervision, a circuit breaker, hidden checks,
    external context injection, or loop detection
  - redirect the agent toward a different concrete approach or explicitly ask it
    to assess whether the current path can still achieve the goal
  - use specific context from the transcript when possible
  - stay under 90 words

Do not include markdown fences or any prose outside the JSON object."""


@dataclass(frozen=True, slots=True)
class CircuitBreakerActivation:
    loop_detected: bool
    corrective_message: str | None
    escalation: EscalationSignal | None = None


@dataclass(frozen=True, slots=True)
class _ActivationSnapshot:
    tool_call_count: int
    message_count: int
    trigger_mode: str


@traces(
    SWR.SWR_201,
    SWR.SWR_207,
    SWR.SWR_208,
    SWR.SWR_209,
    SWR.SWR_210,
    SWR.SWR_211,
    SWR.SWR_216,
    SWR.SWR_217,
    SWR.SWR_220,
)
class CircuitBreaker:
    def __init__(self, llm: LLM, config: CircuitBreakerConfig) -> None:
        self._llm = llm
        self._config = config

    async def classify(
        self,
        *,
        events: list[object],
        session_id: str,
        tool_call_count: int,
        message_count: int,
        trigger_mode: str,
    ) -> CircuitBreakerActivation:
        transcript = self._format_transcript(events)
        fallback = self._fallback_activation(
            transcript=transcript,
            tool_call_count=tool_call_count,
            message_count=message_count,
            trigger_mode=trigger_mode,
        )
        if not transcript:
            return fallback

        prompt = (
            f"Session ID: {session_id}\n"
            f"Trigger mode: {trigger_mode}\n"
            f"Tool calls since last reset: {tool_call_count}\n"
            f"Messages since last reset: {message_count}\n\n"
            "Recent transcript:\n"
            f"{transcript}"
        )

        async def _run() -> CircuitBreakerActivation:
            try:
                output = await self._request_completion(prompt)
                return self._parse_output(
                    output,
                    fallback=fallback,
                    trigger_mode=trigger_mode,
                )
            except Exception as exc:  # noqa: BLE001
                _log.warning("Circuit breaker classifier failed, using fallback: %s", exc)
                return fallback

        try:
            return await asyncio.wait_for(_run(), timeout=self._config.timeout_seconds)
        except TimeoutError:
            _log.warning(
                "Circuit breaker timed out after %.2fs; using fallback",
                self._config.timeout_seconds,
            )
            return fallback

    async def _request_completion(self, prompt: str) -> str:
        # Detached so a hung provider cannot outlive the configured timeout and
        # stall the host's loop shutdown; see rotaris_core.llm_threads.
        response = await call_llm_detached(
            self._llm.completion,
            [
                Message(role="system", content=[TextContent(text=_SYSTEM_PROMPT)]),
                Message(role="user", content=[TextContent(text=prompt)]),
            ],
        )
        return _response_text(response)

    def _parse_output(
        self,
        llm_output: str,
        *,
        fallback: CircuitBreakerActivation,
        trigger_mode: str,
    ) -> CircuitBreakerActivation:
        cleaned_output = llm_output.strip()
        if cleaned_output.startswith("```"):
            cleaned_output = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", cleaned_output)
            cleaned_output = re.sub(r"\n?```$", "", cleaned_output).strip()

        try:
            payload = json.loads(cleaned_output)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned_output, re.DOTALL)
            if match is None:
                raise
            payload = json.loads(match.group())

        if not isinstance(payload, dict):
            msg = "Circuit breaker result must be a JSON object"
            raise TypeError(msg)

        loop_detected = payload.get("loop_detected")
        if not isinstance(loop_detected, bool):
            msg = "Circuit breaker result must contain boolean loop_detected"
            raise TypeError(msg)

        corrective_message = payload.get("corrective_message")
        if corrective_message is not None and not isinstance(corrective_message, str):
            msg = "Circuit breaker corrective_message must be a string or null"
            raise ValueError(msg)

        if trigger_mode == "terminal-stuck" and not loop_detected:
            return fallback

        if loop_detected and not corrective_message:
            return fallback

        return CircuitBreakerActivation(
            loop_detected=loop_detected,
            corrective_message=corrective_message if loop_detected else None,
        )

    def _format_transcript(self, events: list[object]) -> str:
        if not events:
            return ""

        recent_events = events[-self._config.max_recent_events :]
        lines: list[str] = []
        for event in recent_events:
            role = self._event_role(event)
            if hasattr(event, "llm_message") and getattr(event, "llm_message", None):
                text = _message_text(event.llm_message)
                if text:
                    lines.append(f"[message:{role}] {text}")
                continue

            if hasattr(event, "tool_name") and hasattr(event, "tool_call_id"):
                tool_name = str(getattr(event, "tool_name", "unknown"))
                if hasattr(event, "action"):
                    action = getattr(event, "action", None)
                    lines.append(f"[tool:{tool_name}] {action}")
                    continue

                observation = getattr(event, "observation", None)
                if observation is not None:
                    lines.append(f"[tool-result:{tool_name}] {observation}")
                    continue

            lines.append(f"[event:{role}] {event}")

        transcript = "\n".join(line.strip() for line in lines if line.strip())
        if len(transcript) <= self._config.max_transcript_chars:
            return transcript
        return transcript[: self._config.max_transcript_chars - 1].rstrip() + "…"

    def _fallback_activation(
        self,
        *,
        transcript: str,
        tool_call_count: int,
        message_count: int,
        trigger_mode: str,
    ) -> CircuitBreakerActivation:
        if trigger_mode == "terminal-stuck":
            return CircuitBreakerActivation(
                loop_detected=True,
                corrective_message=(
                    "Pause and reassess before continuing. You are stuck repeating the same "
                    "cycle. State the blocker plainly. If you are stuck on a file edit: call "
                    "`read_file` to read the current file content, then construct a correct "
                    "edit with `write_file`, or use `write_file` with `command=create` to "
                    "overwrite the file entirely. Never write files via the terminal. "
                    "Pick exactly one concrete next action."
                ),
            )

        if trigger_mode in ("repeated-action", "repeated-cycle"):
            repeated_tool = _find_repetitive_tool_pattern(transcript)
            file_hint = _first_path_hint(transcript)
            message_parts = ["Pause and reassess before continuing."]
            if repeated_tool:
                message_parts.append(
                    "The recent attempts keep circling around "
                    f"`{repeated_tool}` without closing the task.",
                )
            else:
                message_parts.append("You are repeating the same actions without making progress.")
            if file_hint:
                message_parts.append(f"Use `{file_hint}` as the concrete anchor for the next step.")
            message_parts.append(
                "State the current blocker plainly, then decide whether "
                "the present path can still work. If not, switch to a "
                "different concrete approach.",
            )
            return CircuitBreakerActivation(
                loop_detected=True,
                corrective_message=" ".join(message_parts),
            )

        loop_detected = bool(
            _has_repeated_assistant_message(transcript)
            or _find_repetitive_tool_pattern(transcript),
        )

        if not loop_detected:
            return CircuitBreakerActivation(
                loop_detected=False,
                corrective_message=None,
            )

        repeated_tool = _find_repetitive_tool_pattern(transcript)
        last_assistant = _last_transcript_line(
            transcript,
            prefix="[message:assistant]",
        )
        file_hint = _first_path_hint(transcript)

        message_parts = ["Pause and reassess before continuing."]
        if repeated_tool:
            message_parts.append(
                "The recent attempts keep circling around "
                f"`{repeated_tool}` without closing the task.",
            )
        if file_hint:
            message_parts.append(
                f"Use `{file_hint}` as the concrete anchor for the next step.",
            )
        if last_assistant:
            message_parts.append(
                "State the current blocker plainly, then decide whether "
                "the present path can still work.",
            )
        else:
            message_parts.append(
                "State the blocker plainly, then decide whether the present path can still work.",
            )
        if message_count >= self._config.message_count_threshold:
            message_parts.append(
                "If not, switch to a different concrete approach.",
            )

        return CircuitBreakerActivation(
            loop_detected=True,
            corrective_message=" ".join(message_parts),
        )

    @staticmethod
    def _event_role(event: object) -> str:
        source = getattr(event, "source", None)
        return str(source or "unknown")


@traces(SWR.SWR_131, SWR.SWR_132, SWR.SWR_133, SWR.SWR_134, SWR.SWR_135, SWR.SWR_136)
@traces(
    SWR.SWR_201,
    SWR.SWR_202,
    SWR.SWR_203,
    SWR.SWR_204,
    SWR.SWR_205,
    SWR.SWR_212,
    SWR.SWR_213,
    SWR.SWR_214,
    SWR.SWR_215,
    SWR.SWR_221,
    SWR.SWR_222,
)
class CircuitBreakerSession:
    def __init__(self, config: CircuitBreakerConfig) -> None:
        self._config = config
        self._tool_call_count = 0
        self._message_count = 0
        self._consecutive_activation_count = 0
        self._pending_activation: _ActivationSnapshot | None = None
        self._action_fingerprints: list[str] = []

    def mark_new_user_instruction(self) -> None:
        self._consecutive_activation_count = 0

    def observe_event(self, event: object, *, pause: Callable[[], None]) -> None:
        if self._pending_activation is not None:
            return

        if hasattr(event, "llm_message") and getattr(event, "llm_message", None):
            self._message_count += 1

        if hasattr(event, "action") and hasattr(event, "tool_call_id"):
            self._tool_call_count += 1
            tool_name = str(getattr(event, "tool_name", "unknown"))
            # Fingerprint the full action, not a truncated prefix: a
            # ``write_file`` edit's path/metadata alone can exceed a prefix
            # window, making *different* edits to the same file collide and
            # read as a repeated-action/cycle loop while the agent is in a
            # productive edit→test iteration.
            action_str = str(getattr(event, "action", ""))
            self._action_fingerprints.append(
                _action_fingerprint(tool_name, action_str),
            )
            cap = self._config.max_recent_events
            if len(self._action_fingerprints) > cap:
                self._action_fingerprints = self._action_fingerprints[-cap:]

        trigger_mode = self._trigger_mode()
        if trigger_mode is None:
            return

        self._consecutive_activation_count += 1
        self._pending_activation = _ActivationSnapshot(
            tool_call_count=self._tool_call_count,
            message_count=self._message_count,
            trigger_mode=trigger_mode,
        )
        pause()

    def schedule_terminal_stuck_activation(self) -> None:
        if self._pending_activation is not None:
            return

        self._consecutive_activation_count += 1
        self._pending_activation = _ActivationSnapshot(
            tool_call_count=self._tool_call_count,
            message_count=self._message_count,
            trigger_mode="terminal-stuck",
        )

    async def activate(
        self,
        breaker: CircuitBreaker,
        *,
        events: list[object],
        session_id: str,
    ) -> CircuitBreakerActivation | None:
        snapshot = self._pending_activation
        if snapshot is None:
            return None

        try:
            if self._consecutive_activation_count > 2:
                return CircuitBreakerActivation(
                    loop_detected=False,
                    corrective_message=None,
                    escalation=EscalationSignal(
                        session_id=session_id,
                        consecutive_activation_count=self._consecutive_activation_count,
                        reason="repeated_loop_detection",
                    ),
                )

            return await breaker.classify(
                events=events,
                session_id=session_id,
                tool_call_count=snapshot.tool_call_count,
                message_count=snapshot.message_count,
                trigger_mode=snapshot.trigger_mode,
            )
        finally:
            self._pending_activation = None
            self._tool_call_count = 0
            self._message_count = 0
            self._action_fingerprints.clear()

    def _trigger_mode(self) -> str | None:
        repetition = self._detect_repetition()
        if repetition is not None:
            return repetition

        if self._config.activation_mode == "weighted":
            score = (
                self._tool_call_count / self._config.tool_call_threshold
            ) * self._config.tool_weight + (
                self._message_count / self._config.message_count_threshold
            ) * self._config.message_weight
            if score >= self._config.target_score:
                return "weighted"
            return None

        if self._tool_call_count >= self._config.tool_call_threshold:
            return "independent-tools"
        if self._message_count >= self._config.message_count_threshold:
            return "independent-messages"
        return None

    def _detect_repetition(self) -> str | None:
        """Detect repeated actions or cycles in recent fingerprints."""
        fps = self._action_fingerprints
        n = self._config.repetition_threshold

        # Same action N consecutive times
        if len(fps) >= n and len(set(fps[-n:])) == 1:
            return "repeated-action"

        # Cycle detection (lengths 2-4): e.g. A-B-A-B-A-B
        cycle_reps = self._config.cycle_threshold
        for cycle_len in (2, 3, 4):
            needed = cycle_len * cycle_reps
            if len(fps) < needed:
                continue
            window = fps[-needed:]
            cycle = window[:cycle_len]
            if all(window[i] == cycle[i % cycle_len] for i in range(needed)):
                return "repeated-cycle"

        return None


@traces(SWR.SWR_224)
def build_circuit_breaker(config: RotarisConfig) -> CircuitBreaker | None:
    if config.circuit_breaker.enabled is False:
        return None

    from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model

    llm = load_llm_for_model(
        config,
        config.circuit_breaker.model,
        usage_id=build_llm_usage_id(
            "circuit-breaker",
            model_name=config.circuit_breaker.model,
        ),
    )
    return CircuitBreaker(llm=llm, config=config.circuit_breaker)


def _action_fingerprint(tool_name: str, action: str) -> str:
    raw = f"{tool_name}:{action}"
    return hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()[:12]


def _response_text(response: object) -> str:
    message = getattr(response, "message", None)
    if message is None:
        msg = "LLM response did not include a message"
        raise ValueError(msg)

    parts: list[str] = []
    for item in getattr(message, "content", []) or []:
        if isinstance(item, TextContent):
            parts.append(item.text)
            continue

        text = getattr(item, "text", None)
        if isinstance(text, str):
            parts.append(text)

    text = "\n".join(part for part in parts if part).strip()
    if not text:
        msg = "LLM response message was empty"
        raise ValueError(msg)
    return text


def _message_text(message: object) -> str:
    parts: list[str] = []
    for item in getattr(message, "content", []) or []:
        cleaned = sanitize_visible_text(getattr(item, "text", None)).strip()
        if cleaned:
            parts.append(cleaned.replace("\n", " "))
    return " ".join(part for part in parts if part).strip()


def _find_repetitive_tool_pattern(transcript: str) -> str | None:
    """Find a tool used 4+ times consecutively in the transcript."""
    tool_names: list[str] = re.findall(r"\[tool:([^\]]+)\]", transcript)
    if len(tool_names) < 4:
        return None

    run_count = 1
    for i in range(1, len(tool_names)):
        if tool_names[i] == tool_names[i - 1]:
            run_count += 1
            if run_count >= 4:
                return tool_names[i]
        else:
            run_count = 1

    return None


def _last_transcript_line(transcript: str, *, prefix: str) -> str | None:
    for line in reversed(transcript.splitlines()):
        if line.startswith(prefix):
            return line[len(prefix) :].strip()
    return None


def _has_repeated_assistant_message(transcript: str) -> bool:
    assistant_lines = [
        line.split("]", 1)[1].strip()
        for line in transcript.splitlines()
        if line.startswith("[message:assistant]")
    ]
    if len(assistant_lines) < 3:
        return False

    normalized = [re.sub(r"\s+", " ", line.lower()) for line in assistant_lines[-3:]]
    return len(set(normalized)) == 1


def _first_path_hint(transcript: str) -> str | None:
    for match in _PATH_RE.finditer(transcript):
        try:
            candidate = PurePath(match.group())
        except ValueError:
            continue
        if len(candidate.parts) >= 2:
            return match.group()
    return None
