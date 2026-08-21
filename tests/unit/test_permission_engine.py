"""Productive use: an operator can constrain which tool calls an agent may run.
Expected outcome: every dispatch resolves to exactly one decision, and no error
path ever produces 'allow'."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ALLOW_ALL_POLICY,
    Decision,
    DecisionSource,
    MalformedPolicyError,
    PermissionDecision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRequest,
    PermissionRule,
    default_permission_engine,
    discard_permission_engine,
    register_permission_engine,
    reset_permission_registry,
    resolve_permission_engine,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


class RecordingSink:
    """Audit sink stand-in until SWR-2506 ships the real writer."""

    def __init__(self) -> None:
        self.entries: list[tuple[PermissionRequest, PermissionDecision]] = []

    def record(self, request: PermissionRequest, decision: PermissionDecision) -> None:
        self.entries.append((request, decision))


class ApproveResolver:
    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        del request
        return PermissionDecision(Decision.ALLOW, pending.rule_id, "approved by test")


class NeverAnsweringResolver:
    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        del request
        return pending


class ExplodingResolver:
    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        del request, pending
        raise RuntimeError("approval UI crashed")


def _engine(
    tmp_path: Path,
    policy: PermissionPolicy,
    *,
    persona: str = "coder",
    headless: bool = True,
    audit_sink: object | None = None,
    approval_resolver: object | None = None,
) -> PermissionEngine:
    return PermissionEngine(
        policy=policy,
        path_auth=PathAuth(tmp_path),
        persona=persona,
        headless=headless,
        audit_sink=audit_sink,  # type: ignore[arg-type]
        approval_resolver=approval_resolver,  # type: ignore[arg-type]
    )


def _request(tool: str = "terminal", **kwargs: object) -> PermissionRequest:
    return PermissionRequest(
        tool_name=tool,
        persona=str(kwargs.pop("persona", "coder")),
        arguments=kwargs.pop("arguments", {}),  # type: ignore[arg-type]
        command=kwargs.pop("command", None),  # type: ignore[arg-type]
    )


@pytest.fixture(autouse=True)
def _clean_registry() -> None:
    reset_permission_registry()


@verifies(SWR.SWR_2501)
def test_default_policy_allows_every_call(tmp_path: Path) -> None:
    engine = _engine(tmp_path, ALLOW_ALL_POLICY)

    decision = engine.resolve(_request(command="rm -rf /"))

    assert decision.decision is Decision.ALLOW
    assert decision.rule_id == "preset:unrestricted"


@verifies(SWR.SWR_2501)
def test_first_matching_rule_wins(tmp_path: Path) -> None:
    policy = PermissionPolicy(
        rules=(
            PermissionRule("allow-terminal", Decision.ALLOW, tools=frozenset({"terminal"})),
            PermissionRule("deny-everything", Decision.DENY),
        ),
        default_decision=Decision.DENY,
        preset_name="restricted",
    )
    engine = _engine(tmp_path, policy)

    assert engine.resolve(_request("terminal")).rule_id == "allow-terminal"
    assert engine.resolve(_request("write_file")).rule_id == "deny-everything"


@verifies(SWR.SWR_2501)
def test_rule_narrows_to_persona(tmp_path: Path) -> None:
    policy = PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-researcher-shell",
                Decision.DENY,
                tools=frozenset({"terminal"}),
                personas=frozenset({"researcher"}),
            ),
        ),
    )
    engine = _engine(tmp_path, policy)

    assert engine.resolve(_request("terminal", persona="researcher")).decision is Decision.DENY
    assert engine.resolve(_request("terminal", persona="coder")).decision is Decision.ALLOW


@verifies(SWR.SWR_2501)
def test_unmatched_call_falls_through_to_preset_default(tmp_path: Path) -> None:
    policy = PermissionPolicy(
        rules=(PermissionRule("allow-reads", Decision.ALLOW, tools=frozenset({"read_file"})),),
        default_decision=Decision.DENY,
        preset_name="restricted",
    )

    decision = _engine(tmp_path, policy).resolve(_request("write_file"))

    assert decision.decision is Decision.DENY
    assert decision.rule_id == "preset:restricted"
    assert "restricted" in decision.reason


@verifies(SWR.SWR_2501)
def test_path_scoped_rule_matches_only_paths_outside_the_workspace(tmp_path: Path) -> None:
    policy = PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-escapes",
                Decision.DENY,
                path_scope="outside_workspace",
            ),
        ),
    )
    engine = _engine(tmp_path, policy)

    inside = engine.resolve(_request("write_file", arguments={"path": "src/app.py"}))
    outside = engine.resolve(
        _request("write_file", arguments={"path": str(tmp_path.parent / "elsewhere.py")}),
    )

    assert inside.decision is Decision.ALLOW
    assert outside.decision is Decision.DENY


@verifies(SWR.SWR_2501)
def test_command_matcher_slot_gates_terminal_calls(tmp_path: Path) -> None:
    policy = PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-force-push",
                Decision.DENY,
                tools=frozenset({"terminal"}),
                matcher=lambda command: "--force" in command,
                description="force push",
            ),
        ),
    )
    engine = _engine(tmp_path, policy)

    denied = engine.resolve(_request("terminal", command="git push --force"))

    assert denied.decision is Decision.DENY
    assert "force push" in denied.reason
    assert engine.resolve(_request("terminal", command="git status")).decision is Decision.ALLOW


@verifies(SWR.SWR_2501)
def test_meta_tools_are_never_gated(tmp_path: Path) -> None:
    policy = PermissionPolicy(default_decision=Decision.DENY, preset_name="restricted")
    engine = _engine(tmp_path, policy)

    for tool in ("finish", "FinishTool", "think"):
        decision = engine.resolve(_request(tool))
        assert decision.decision is Decision.ALLOW, tool
        assert decision.rule_id == "builtin:meta-tool"


@verifies(SWR.SWR_2501)
def test_malformed_policy_fails_closed_to_deny_when_headless(tmp_path: Path) -> None:
    policy = PermissionPolicy(
        rules=(
            PermissionRule("dup", Decision.ALLOW),
            PermissionRule("dup", Decision.ALLOW),
        ),
    )

    decision = _engine(tmp_path, policy, headless=True).resolve(_request())

    assert decision.decision is Decision.DENY
    assert decision.rule_id == "failclosed:unresolvable-policy"


@verifies(SWR.SWR_2501)
def test_malformed_policy_fails_closed_to_ask_when_interactive(tmp_path: Path) -> None:
    policy = PermissionPolicy(rules=(PermissionRule("", Decision.ALLOW),))

    decision = _engine(
        tmp_path,
        policy,
        headless=False,
        approval_resolver=ApproveResolver(),
    ).resolve(_request())

    # The fail-closed outcome is `ask`; the resolver then turns it terminal.
    assert decision.decision is Decision.ALLOW
    assert decision.rule_id == "failclosed:unresolvable-policy"


@verifies(SWR.SWR_2501)
def test_a_matcher_that_raises_never_yields_allow(tmp_path: Path) -> None:
    def boom(command: str) -> bool:
        raise RuntimeError(f"bad pattern for {command}")

    policy = PermissionPolicy(rules=(PermissionRule("boom", Decision.ALLOW, matcher=boom),))

    decision = _engine(tmp_path, policy).resolve(_request(command="ls"))

    assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2501)
def test_policy_validate_rejects_duplicate_rule_ids() -> None:
    policy = PermissionPolicy(
        rules=(PermissionRule("dup", Decision.DENY), PermissionRule("dup", Decision.ALLOW)),
    )

    with pytest.raises(MalformedPolicyError, match="Duplicate"):
        policy.validate()


@verifies(SWR.SWR_2501)
def test_ask_is_routed_through_the_approval_resolver(tmp_path: Path) -> None:
    policy = PermissionPolicy(default_decision=Decision.ASK, preset_name="ask")

    approved = _engine(tmp_path, policy, approval_resolver=ApproveResolver()).resolve(_request())

    assert approved.decision is Decision.ALLOW


@verifies(SWR.SWR_2501)
def test_ask_denies_fail_safe_without_an_approval_ui(tmp_path: Path) -> None:
    policy = PermissionPolicy(default_decision=Decision.ASK, preset_name="ask")

    decision = _engine(tmp_path, policy).resolve(_request())

    assert decision.decision is Decision.DENY
    assert "fail-safe" in decision.reason


@verifies(SWR.SWR_2501)
def test_resolve_never_returns_ask(tmp_path: Path) -> None:
    policy = PermissionPolicy(default_decision=Decision.ASK, preset_name="ask")

    for resolver in (NeverAnsweringResolver(), ExplodingResolver()):
        decision = _engine(tmp_path, policy, approval_resolver=resolver).resolve(_request())
        assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2501)
def test_every_decision_reaches_the_audit_sink(tmp_path: Path) -> None:
    sink = RecordingSink()
    policy = PermissionPolicy(
        rules=(PermissionRule("deny-shell", Decision.DENY, tools=frozenset({"terminal"})),),
    )
    engine = _engine(tmp_path, policy, audit_sink=sink)

    engine.resolve(_request("terminal", command="ls"))
    engine.resolve(_request("read_file"))

    assert [entry[1].rule_id for entry in sink.entries] == ["deny-shell", "preset:unrestricted"]
    assert [entry[1].decision for entry in sink.entries] == [Decision.DENY, Decision.ALLOW]


@verifies(SWR.SWR_2501)
def test_a_failing_audit_sink_does_not_break_dispatch(tmp_path: Path) -> None:
    class BrokenSink:
        def record(self, request: PermissionRequest, decision: PermissionDecision) -> None:
            del request, decision
            raise OSError("disk full")

    decision = _engine(tmp_path, ALLOW_ALL_POLICY, audit_sink=BrokenSink()).resolve(_request())

    assert decision.decision is Decision.ALLOW


@verifies(SWR.SWR_2501)
def test_registry_resolves_the_engine_registered_for_a_key(tmp_path: Path) -> None:
    engine = _engine(tmp_path, ALLOW_ALL_POLICY, persona="coder")
    register_permission_engine("session/coder", engine)

    assert resolve_permission_engine("session/coder") is engine

    discard_permission_engine("session/coder")
    assert resolve_permission_engine("session/coder") is not engine


@verifies(SWR.SWR_2501)
def test_unknown_key_never_resolves_to_another_agents_engine(tmp_path: Path) -> None:
    strict_engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.DENY, preset_name="restricted"),
        persona="researcher",
    )
    register_permission_engine("session/researcher", strict_engine)

    resolved = resolve_permission_engine("session/unknown-persona")

    assert resolved is not strict_engine
    assert resolved is default_permission_engine()
    assert resolved.resolve(_request()).decision is Decision.ALLOW


@verifies(SWR.SWR_2501)
def test_missing_key_resolves_to_the_default_engine() -> None:
    assert resolve_permission_engine(None) is default_permission_engine()


@verifies(SWR.SWR_2501)
def test_redacted_summary_omits_argument_values() -> None:
    request = _request("write_file", arguments={"path": "/etc/passwd", "content": "secret"})

    summary = request.redacted_summary()

    assert "secret" not in summary
    assert "/etc/passwd" not in summary
    assert "write_file" in summary


@verifies(SWR.SWR_2503)
def test_set_policy_takes_effect_on_the_next_dispatch(tmp_path: Path) -> None:
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ALLOW, preset_name="ask"),
    )
    assert engine.resolve(_request("write_file")).decision is Decision.ALLOW

    engine.set_policy(PermissionPolicy(default_decision=Decision.DENY, preset_name="restricted"))

    decision = engine.resolve(_request("write_file"))
    assert decision.decision is Decision.DENY
    assert decision.rule_id == "preset:restricted"


@verifies(SWR.SWR_2503)
def test_set_policy_revalidates_the_new_policy(tmp_path: Path) -> None:
    engine = _engine(tmp_path, ALLOW_ALL_POLICY)
    engine.resolve(_request())  # force initial validation to run and cache clean

    engine.set_policy(
        PermissionPolicy(
            rules=(
                PermissionRule("dup", Decision.ALLOW),
                PermissionRule("dup", Decision.DENY),
            ),
            preset_name="broken",
        ),
    )

    decision = engine.resolve(_request())
    assert decision.decision is Decision.DENY  # headless fail-closed
    assert decision.rule_id == "failclosed:unresolvable-policy"


class SessionApproveResolver:
    """Stands in for the user picking 'approve for this session' in Rotaris."""

    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        del request
        self.calls = getattr(self, "calls", 0) + 1
        return PermissionDecision(
            Decision.ALLOW,
            pending.rule_id,
            "approved for the session by test",
            session_scoped=True,
        )


@verifies(SWR.SWR_2504)
def test_session_approval_allows_the_same_command_without_asking_again(tmp_path: Path) -> None:
    resolver = SessionApproveResolver()
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        approval_resolver=resolver,
    )

    first = engine.resolve(_request(command="git push"))
    second = engine.resolve(_request(command="git push"))

    assert first.decision is Decision.ALLOW
    assert second.decision is Decision.ALLOW
    assert second.rule_id.startswith("session:allow:")
    # The user was asked exactly once.
    assert resolver.calls == 1


@verifies(SWR.SWR_2504)
def test_session_approval_does_not_widen_to_other_commands(tmp_path: Path) -> None:
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        approval_resolver=SessionApproveResolver(),
    )
    engine.resolve(_request(command="git push"))

    engine._approval_resolver = NeverAnsweringResolver()  # noqa: SLF001
    decision = engine.resolve(_request(command="git push --force"))

    assert decision.decision is Decision.DENY


@verifies(SWR.SWR_2504)
def test_session_approval_of_an_argument_call_pins_those_arguments(tmp_path: Path) -> None:
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        approval_resolver=SessionApproveResolver(),
    )
    engine.resolve(_request("write_file", arguments={"path": "src/app.py"}))

    engine._approval_resolver = NeverAnsweringResolver()  # noqa: SLF001
    same = engine.resolve(_request("write_file", arguments={"path": "src/app.py"}))
    other = engine.resolve(_request("write_file", arguments={"path": "/etc/passwd"}))

    assert same.decision is Decision.ALLOW
    assert other.decision is Decision.DENY


@verifies(SWR.SWR_2504)
def test_session_approval_survives_a_mid_session_mode_change(tmp_path: Path) -> None:
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        approval_resolver=SessionApproveResolver(),
    )
    engine.resolve(_request(command="git push"))

    engine.set_policy(PermissionPolicy(default_decision=Decision.DENY, preset_name="restricted"))

    decision = engine.resolve(_request(command="git push"))
    assert decision.decision is Decision.ALLOW
    assert decision.rule_id.startswith("session:allow:")


@verifies(SWR.SWR_2504)
def test_approve_once_leaves_no_standing_rule(tmp_path: Path) -> None:
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        approval_resolver=ApproveResolver(),
    )

    engine.resolve(_request(command="git push"))

    assert engine.session_rules == ()


@verifies(SWR.SWR_2506)
def test_each_decision_carries_the_source_that_produced_it(tmp_path: Path) -> None:
    """The audit log (SWR-2506) needs the resolution source, and ``rule_id`` alone
    cannot supply it: several distinct resolutions share one id."""
    policy = PermissionPolicy(
        rules=(PermissionRule("deny-terminal", Decision.DENY, tools=frozenset({"terminal"})),),
        default_decision=Decision.ALLOW,
        preset_name="autonomous",
    )
    engine = _engine(tmp_path, policy)

    assert engine.resolve(_request()).source is DecisionSource.RULE
    assert engine.resolve(_request(tool="grep")).source is DecisionSource.PRESET
    assert engine.resolve(_request(tool="finish")).source is DecisionSource.BUILTIN


@verifies(SWR.SWR_2506)
def test_a_session_approval_is_distinguishable_from_a_policy_rule(tmp_path: Path) -> None:
    engine = _engine(
        tmp_path,
        PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
        approval_resolver=SessionApproveResolver(),
    )

    engine.resolve(_request(command="git push"))
    repeated = engine.resolve(_request(command="git push"))

    assert repeated.source is DecisionSource.SESSION_RULE


@verifies(SWR.SWR_2506)
def test_an_unresolvable_policy_is_audited_as_fail_closed(tmp_path: Path) -> None:
    broken = PermissionPolicy(
        rules=(PermissionRule("", Decision.DENY),),
        preset_name="restricted",
    )

    decision = _engine(tmp_path, broken).resolve(_request())

    assert decision.decision is Decision.DENY
    assert decision.source is DecisionSource.FAIL_CLOSED
