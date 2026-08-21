"""The two tools the gatekeeper persona holds, and nobody else (SWR-2614).

Authoring a quality gate is judgement work — which command represents this
project's tests, which tooling is real and which is vestigial — and it must not
be done by the persona whose completion the gate constrains. So it is done by a
dedicated persona, and this is its whole reach into the workspace:

``verifier_probe``       ask whether a candidate command resolves here and finds
                         work, through SWR-2613's probe forms. It cannot run a
                         real suite: the form table decides what executes, and a
                         command with no known cheap form answers ``undecidable``
                         without running anything at all.
``verifier_gate_write``  replace ``verifier.checks``, subject to
                         :func:`~rotaris_core.verifier.gate_writer.authorize_gate_write`.

**The authority lives in the tool.** ``verifier_gate_write`` calls the authority
rule before it calls anything else and refuses *in band*, handing the persona a
sentence that says the change has to go through an approval instead. That is what
makes it safe to give an agent the pen: a prompt instruction not to weaken the
gate is an instruction a model can lose track of, and this one it cannot reach.

**These tools are internal.** They are deliberately absent from
``agents.factory.TOOL_NAME_MAP`` — which *is* ``ALLOWED_PUBLIC_TOOL_NAMES`` — so
no configuration can grant them to another persona, the same arrangement the
Researcher's ``file_viewer`` uses. They are attached to the gatekeeper's agent by
the authoring run and by nothing else.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Self

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from rotaris_core.verifier.gate_writer import GateWrite

__all__ = [
    "GATE_WRITE_TOOL_NAME",
    "PROBE_TOOL_NAME",
    "GateWriteAction",
    "GateWriteExecutor",
    "GateWriteObservation",
    "VerifierGateWriteTool",
    "ProbeAction",
    "ProbeExecutor",
    "ProbeObservation",
    "VerifierProbeTool",
]

PROBE_TOOL_NAME = "verifier_probe"
GATE_WRITE_TOOL_NAME = "verifier_gate_write"

_PROBE_DESCRIPTION = (
    "Check whether a candidate verification command actually resolves in this "
    "workspace and finds work to do, without running it for real. Give the "
    "command you are considering (e.g. 'uv run pytest -q', 'make test', "
    "'npm run lint') and the role it would fill ('test', 'typecheck', 'lint' or "
    "'other'). Answers with one verdict:\n"
    "  verified    — it resolves and reports work. Bind it.\n"
    "  empty       — it resolves and finds nothing (a test command collecting "
    "zero tests). Bind it, but it cannot be trusted to verify anything yet.\n"
    "  unavailable — it does not resolve here. Do NOT bind it.\n"
    "  undecidable — there is no cheap way to pre-check this command. Binding it "
    "is still correct; it simply could not be confirmed in advance.\n"
    "Probe every command before you write it into the gate."
)

_GATE_WRITE_DESCRIPTION = (
    "Replace this workspace's check suite (`verifier.checks`). Pass the complete "
    "suite you want, as a list of objects with 'name', 'command', and optionally "
    "'role' ('test'|'typecheck'|'lint'|'other'), 'severity' "
    "('blocking'|'advisory', default blocking), 'cwd' (a workspace-relative "
    "directory for a sub-project) and 'timeout' (seconds).\n"
    "You may add a check, and you may replace a command inside a role at the same "
    "severity. You may NOT remove a role's only check, lower a check from "
    "blocking to advisory, or empty the suite — those need a person's approval "
    "and this tool will refuse them and tell you so. A refusal is not an error to "
    "work around: report it and stop.\n"
    "Always state 'reason' — one sentence on why the gate is changing. It is "
    "shown to the user."
)


@traces(SWR.SWR_2613, SWR.SWR_2614)
class ProbeAction(Action):
    command: str = Field(description="The candidate verification command to pre-check.")
    role: str = Field(
        default="other",
        description="What this command would verify: test, typecheck, lint, or other.",
    )
    cwd: str = Field(
        default="",
        description="Workspace-relative directory the command would run in; empty for the root.",
    )


@traces(SWR.SWR_2613)
class ProbeObservation(Observation):
    verdict: str = ""
    note: str = ""

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        text = self.text or "the probe said nothing"
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_2613, SWR.SWR_2614)
class ProbeExecutor(ToolExecutor[ProbeAction, ProbeObservation]):
    """Runs SWR-2613's probe form for one candidate command.

    Bound to a workspace and a permission engine at construction, so the persona
    cannot redirect it: the directory it probes in is derived from the workspace
    root, and a ``cwd`` that escapes is simply ignored.
    """

    def __init__(
        self,
        workspace_root: Path,
        *,
        engine: Any | None = None,
        persona: str = "gatekeeper",
        timeout: int = 30,
    ) -> None:
        self._root = workspace_root
        self._engine = engine
        self._persona = persona
        self._timeout = timeout

    def __call__(self, action: ProbeAction, conversation: object = None) -> ProbeObservation:
        del conversation
        from rotaris_core.verifier.calibration import probe_check  # noqa: PLC0415
        from rotaris_core.verifier.execution import CommandRunner  # noqa: PLC0415
        from rotaris_core.verifier.suite import ResolvedCheck  # noqa: PLC0415

        role = action.role if action.role in {"test", "typecheck", "lint", "other"} else "other"
        directory = _inside(self._root, action.cwd)
        candidate = ResolvedCheck(
            name="candidate",
            command=action.command,
            role=role,  # type: ignore[arg-type]
        )
        runner = CommandRunner(directory, timeout=float(self._timeout))
        try:
            probe = probe_check(
                candidate,
                runner,
                engine=self._engine,
                persona=self._persona,
            )
        finally:
            runner.close()
        said = f"{action.command!r}: {probe.verdict}" + (f" — {probe.note}" if probe.note else "")
        return ProbeObservation.from_text(said).model_copy(
            update={"verdict": probe.verdict, "note": probe.note},
        )


@traces(SWR.SWR_2614)
class GateWriteAction(Action):
    checks: list[dict[str, Any]] = Field(
        default_factory=list,
        description="The complete check suite to write.",
    )
    reason: str = Field(
        default="",
        description="One sentence on why the gate is changing. Shown to the user.",
    )


@traces(SWR.SWR_2614)
class GateWriteObservation(Observation):
    written: bool = False
    refusal: str = ""

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        text = self.text or "nothing was written"
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_2614)
class GateWriteExecutor(ToolExecutor[GateWriteAction, GateWriteObservation]):
    """The gate's only writer, refusing in band what it may not do.

    Records every write it makes on itself, so the run that owns this executor
    can report what the persona changed without trusting the persona to say.
    """

    def __init__(self, workspace_root: Path) -> None:
        self._root = workspace_root
        self.writes: list[GateWrite] = []

    def __call__(
        self,
        action: GateWriteAction,
        conversation: object = None,
    ) -> GateWriteObservation:
        del conversation
        from pydantic import ValidationError  # noqa: PLC0415

        from rotaris_core.config.schema import CheckConfig  # noqa: PLC0415
        from rotaris_core.verifier.gate_writer import write_verifier_section  # noqa: PLC0415

        if not action.reason.strip():
            return GateWriteObservation.from_text(
                "State a reason: it is what the user is shown when their gate changes.",
                is_error=True,
            ).model_copy(update={"refusal": "no reason was given"})
        try:
            checks = [CheckConfig.model_validate(entry) for entry in action.checks]
        except ValidationError as error:
            return GateWriteObservation.from_text(
                f"That is not a valid check suite: {error}",
                is_error=True,
            ).model_copy(update={"refusal": str(error)})

        outcome = write_verifier_section(self._root, checks, reason=action.reason.strip())
        self.writes.append(outcome)
        if not outcome.written:
            # Not an error the persona should retry around: it is a routing
            # instruction. Saying so in band is the whole safety property.
            return GateWriteObservation.from_text(
                f"Refused: {outcome.refusal}. This change has to go through an "
                "approval-gated proposal instead. Report it and stop; do not "
                "try to achieve it another way.",
            ).model_copy(update={"written": False, "refusal": outcome.refusal})
        return GateWriteObservation.from_text(outcome.describe()).model_copy(
            update={"written": True},
        )


def _inside(root: Path, relative: str) -> Path:
    """*root* joined with *relative*, or *root* when that would leave the tree."""
    candidate = relative.strip()
    if not candidate:
        return root
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        return root
    return resolved if resolved.is_dir() else root


class VerifierProbeTool(ToolDefinition[ProbeAction, ProbeObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        return [
            cls(
                description=_PROBE_DESCRIPTION,
                action_type=ProbeAction,
                observation_type=ProbeObservation,
                executor=kwargs["executor"],
            ),
        ]


class VerifierGateWriteTool(ToolDefinition[GateWriteAction, GateWriteObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        return [
            cls(
                description=_GATE_WRITE_DESCRIPTION,
                action_type=GateWriteAction,
                observation_type=GateWriteObservation,
                executor=kwargs["executor"],
            ),
        ]
