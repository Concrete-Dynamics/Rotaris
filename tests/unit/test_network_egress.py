"""Productive use: an operator restricts which hosts an agent may contact and
which shell commands may reach the network, and reviews an approval prompt whose
credentials are masked.
Expected outcome: host patterns resolve exactly as configured (deny beating
allow), network-reaching commands are classifiable per mode, and no
screaming-snake-case secret reaches the approval dialog or the audit log."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.core.path_auth import PathAuth
from rotaris_core.events.schema import redact_text
from rotaris_core.permissions.approval import redact_secrets
from rotaris_core.permissions.engine import (
    Decision,
    PermissionEngine,
    PermissionRequest,
)
from rotaris_core.permissions.network import (
    EGRESS_ALLOW,
    EGRESS_ASK,
    EGRESS_DENY,
    NetworkEgressPolicy,
    classify_host,
    host_matches,
    is_loopback_host,
    network_command_matcher,
    normalize_host,
    remote_url_matcher,
)
from rotaris_core.permissions.presets import PRESETS, resolve_preset
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _engine(tmp_path: Path, mode: str) -> PermissionEngine:
    return PermissionEngine(
        policy=resolve_preset(mode),
        path_auth=PathAuth(tmp_path),
        persona="coder",
    )


def _decide(engine: PermissionEngine, command: str) -> tuple[Decision, str]:
    decision = engine.resolve(
        PermissionRequest(
            tool_name="terminal",
            persona="coder",
            arguments={"command": command},
            command=command,
        ),
    )
    return decision.decision, decision.rule_id


def _decide_fetch(engine: PermissionEngine, url: str) -> tuple[Decision, str]:
    decision = engine.resolve(
        PermissionRequest(
            tool_name="fetch",
            persona="coder",
            arguments={"url": url},
            command=url,
        ),
    )
    return decision.decision, decision.rule_id


# --------------------------------------------------------------------------
# normalize_host
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://Example.COM/path?q=1", "example.com"),
        ("http://user:pw@api.example.com:8443/x", "api.example.com"),
        ("Example.com", "example.com"),
        ("example.com:8080", "example.com"),
        ("example.com.", "example.com"),
        ("http://[::1]:9000/", "::1"),
        ("127.0.0.1", "127.0.0.1"),
        ("", ""),
        ("   ", ""),
    ],
)
@verifies(SWR.SWR_2505)
def test_normalize_host_reduces_a_url_or_host_to_one_comparable_key(
    raw: str,
    expected: str,
) -> None:
    """Productive use: an operator writes 'github.com' and the agent fetches
    'https://GitHub.com:443/org/repo'.
    Expected outcome: both sides reduce to the same host key, so the entry the
    operator wrote is the entry that matches."""
    assert normalize_host(raw) == expected


@verifies(SWR.SWR_2505)
def test_normalize_host_idna_encodes_an_international_name() -> None:
    """Productive use: an operator allowlists a non-ASCII host.
    Expected outcome: the unicode spelling and its punycode spelling compare
    equal, so an allowlist entry cannot be dodged by writing the other one."""
    assert normalize_host("https://bücher.example/") == "xn--bcher-kva.example"
    assert normalize_host("XN--BCHER-KVA.example") == "xn--bcher-kva.example"


# --------------------------------------------------------------------------
# host_matches
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("host", "pattern", "expected"),
    [
        ("example.com", "example.com", True),
        ("EXAMPLE.com", "example.com", True),
        # Substring matching would be a hole: a lookalike domain must not match.
        ("evil-example.com", "example.com", False),
        ("example.com.evil.test", "example.com", False),
        ("notexample.com", "example.com", False),
        ("api.example.com", "*.example.com", True),
        ("a.b.example.com", "*.example.com", True),
        # Documented choice: the wildcard stands for one or more labels, so it
        # does not cover the bare apex.
        ("example.com", "*.example.com", False),
        ("evilexample.com", "*.example.com", False),
        ("", "example.com", False),
    ],
)
@verifies(SWR.SWR_2505)
def test_host_matches_is_label_wise_never_substring_wise(
    host: str,
    pattern: str,
    expected: bool,
) -> None:
    """Productive use: an operator allowlists 'example.com' and '*.example.com'.
    Expected outcome: only the intended hosts match — a lookalike registration
    such as 'evil-example.com' never satisfies either pattern."""
    assert host_matches(host, pattern) is expected


@pytest.mark.parametrize("pattern", ["api.*.com", "exa*ple.com", "*", "*.*.com", "example.*"])
@verifies(SWR.SWR_2505)
def test_unsupported_wildcard_patterns_are_rejected_not_taken_literally(pattern: str) -> None:
    """Productive use: an operator mistypes a host pattern.
    Expected outcome: the mistake is reported instead of silently matching
    nothing, which would look like a working allowlist that allows nobody."""
    with pytest.raises(ValueError, match="not supported"):
        host_matches("api.example.com", pattern)


# --------------------------------------------------------------------------
# classify_host
# --------------------------------------------------------------------------


@verifies(SWR.SWR_2505)
def test_denied_host_wins_over_a_broader_allow_wildcard() -> None:
    """Productive use: an operator allows '*.example.com' but blocks the one
    metadata endpoint inside it.
    Expected outcome: the explicit deny wins, so the broad convenience entry
    cannot re-open the host that was deliberately blocked."""
    verdict = classify_host(
        "metadata.example.com",
        allowed=["*.example.com"],
        denied=["metadata.example.com"],
        default=EGRESS_ALLOW,
    )

    assert verdict == EGRESS_DENY


@verifies(SWR.SWR_2505)
def test_allowlisted_host_is_allowed_even_when_the_default_denies() -> None:
    """Productive use: an operator runs deny-by-default and allows only the
    package registry the build needs.
    Expected outcome: the registry resolves to allow and everything else to
    deny, without listing the whole internet."""
    assert (
        classify_host(
            "registry.npmjs.org",
            allowed=["*.npmjs.org"],
            denied=[],
            default=EGRESS_DENY,
        )
        == EGRESS_ALLOW
    )
    assert (
        classify_host("evil.test", allowed=["*.npmjs.org"], denied=[], default=EGRESS_DENY)
        == EGRESS_DENY
    )


@verifies(SWR.SWR_2505)
def test_unreadable_host_and_unknown_default_both_resolve_to_deny() -> None:
    """Productive use: a malformed URL or a corrupted setting reaches the check.
    Expected outcome: the request is refused rather than allowed — there is no
    path from confusion to network access."""
    assert classify_host("", allowed=[], denied=[], default=EGRESS_ALLOW) == EGRESS_DENY
    assert classify_host("example.com", allowed=[], denied=[], default="whatever") == EGRESS_DENY


@verifies(SWR.SWR_2505)
def test_unmatched_host_falls_through_to_the_configured_default() -> None:
    """Productive use: an operator leaves the default at 'ask'.
    Expected outcome: a host on neither list is neither allowed nor blocked
    outright; it is routed to the approval path."""
    assert classify_host("example.com", allowed=[], denied=[], default=EGRESS_ASK) == EGRESS_ASK


@verifies(SWR.SWR_2505)
def test_policy_reads_the_runtime_settings_and_classifies_a_url() -> None:
    """Productive use: an operator's runtime settings drive the fetch check.
    Expected outcome: the policy object built from those settings classifies a
    full URL, so the tool never has to parse hosts itself."""

    class _Runtime:
        network_egress_policy = "deny"
        network_allowed_hosts = ["github.com"]
        network_denied_hosts = ["*.internal.test"]

    policy = NetworkEgressPolicy.from_runtime(_Runtime())

    assert policy.classify("https://github.com/org/repo") == EGRESS_ALLOW
    assert policy.classify("https://metadata.internal.test/creds") == EGRESS_DENY
    assert policy.classify("https://example.com/") == EGRESS_DENY
    assert NetworkEgressPolicy.permissive().classify("https://example.com/") == EGRESS_ALLOW


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("localhost", True),
        ("http://127.0.0.1:8080/x", True),
        ("::1", True),
        ("example.com", False),
        # A private or link-local address is not "this machine": the cloud
        # metadata endpoint lives on one.
        ("169.254.169.254", False),
        ("10.0.0.5", False),
    ],
)
@verifies(SWR.SWR_2505)
def test_only_loopback_counts_as_this_machine(host: str, expected: bool) -> None:
    """Productive use: an agent reads a local dev server without a prompt.
    Expected outcome: loopback is treated as local, while an internal or
    metadata address still counts as remote and is gated."""
    assert is_loopback_host(host) is expected


@verifies(SWR.SWR_2505)
def test_an_unreadable_fetch_target_counts_as_remote() -> None:
    """Productive use: the agent sends a target the tool cannot parse.
    Expected outcome: the gate treats it as remote, so an unparseable URL asks
    instead of slipping past the host check."""
    matcher = remote_url_matcher()

    assert matcher("https://example.com/") is True
    assert matcher("") is True
    assert matcher("not a url at all") is True
    assert matcher("http://localhost:5173/index.html") is False


# --------------------------------------------------------------------------
# network command classification
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "command",
    [
        "curl https://example.com",
        "wget https://example.com/file.tar.gz",
        "git push origin main",
        "git clone https://example.com/repo.git",
        "pip install requests",
        "npm install left-pad",
        "uv add httpx",
        "echo hi && curl https://example.com",
    ],
)
@verifies(SWR.SWR_2505, SWR.SWR_2502)
def test_network_reaching_commands_are_classifiable(command: str) -> None:
    """Productive use: an operator wants shell commands that leave the machine
    gated separately from local ones.
    Expected outcome: each of them is recognized as network-reaching, including
    the one hiding in the second half of a compound command line."""
    assert network_command_matcher()(command) is True


@pytest.mark.parametrize(
    "command",
    ["ls -la", "pytest tests/unit", "git status", "cat README.md", "python -c 'print(1)'"],
)
@verifies(SWR.SWR_2505)
def test_local_commands_are_not_classified_as_network_reaching(command: str) -> None:
    """Productive use: an operator does not want routine local work to prompt.
    Expected outcome: a purely local command is not swept up by the network
    classification."""
    assert network_command_matcher()(command) is False


# --------------------------------------------------------------------------
# preset wiring
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("mode", "command", "expected_rule"),
    [
        ("restricted", "rm -rf /", "starter:deny-recursive-delete"),
        ("restricted", "sudo apt install x", "starter:deny-privilege-escalation"),
        ("restricted", "git push --force origin main", "starter:deny-force-push"),
        ("restricted", "npm publish", "starter:deny-package-publish"),
        ("restricted", "curl https://example.com", "restricted:network-command"),
        ("restricted", "pip install requests", "starter:ask-dependency-install"),
        ("ask", "rm -rf /", "starter:deny-recursive-delete"),
        ("ask", "sudo apt install x", "starter:deny-privilege-escalation"),
        ("ask", "git push --force origin main", "starter:deny-force-push"),
        ("ask", "curl https://example.com", "ask:network-command"),
        ("ask", "pip install requests", "starter:ask-dependency-install"),
        ("autonomous", "rm -rf /", "starter:deny-recursive-delete"),
        ("autonomous", "sudo apt install x", "starter:deny-privilege-escalation"),
        ("autonomous", "git push --force origin main", "starter:deny-force-push"),
    ],
)
@verifies(SWR.SWR_2502, SWR.SWR_2505)
def test_destructive_and_network_command_rules_are_live_in_every_mode(
    tmp_path: Path,
    mode: str,
    command: str,
    expected_rule: str,
) -> None:
    """Productive use: an operator picks a permission mode and expects it to
    actually stop a destructive or network-reaching command.
    Expected outcome: the named starter rule — not the preset default — is the
    one that decides, so the refusal explains itself."""
    _, rule_id = _decide(_engine(tmp_path, mode), command)

    assert rule_id == expected_rule


@verifies(SWR.SWR_2502, SWR.SWR_2505)
def test_autonomous_keeps_the_denies_and_never_asks(tmp_path: Path) -> None:
    """Productive use: an unattended run has nobody to answer a prompt.
    Expected outcome: it still refuses the destructive commands outright, and
    routine network work runs instead of stalling on an unanswerable ask."""
    engine = _engine(tmp_path, "autonomous")

    for command in ("rm -rf /", "sudo rm x", "git push --force origin main"):
        decision, _ = _decide(engine, command)
        assert decision is Decision.DENY

    for command in ("curl https://example.com", "pip install requests", "ls -la"):
        decision, rule_id = _decide(engine, command)
        assert decision is Decision.ALLOW, command
        assert rule_id == "preset:autonomous"

    assert not [
        rule for rule in PRESETS["autonomous"].rules if rule.rule_id.startswith("starter:ask-")
    ]


@pytest.mark.parametrize("mode", ["restricted", "ask"])
@verifies(SWR.SWR_2505)
def test_a_remote_fetch_is_gated_ahead_of_the_read_only_allow(tmp_path: Path, mode: str) -> None:
    """Productive use: an operator expects 'fetch' to be governed by the target
    host, not waved through because fetching is a read.
    Expected outcome: a remote fetch resolves through the host rule (which asks,
    and with no approval host available fails safe to deny) while a fetch to
    this machine is still allowed."""
    engine = _engine(tmp_path, mode)

    decision, rule_id = _decide_fetch(engine, "https://example.com/page")
    assert rule_id == f"{mode}:fetch-remote-host"
    assert decision is Decision.DENY  # fail-safe resolution of the ask

    decision, rule_id = _decide_fetch(engine, "http://127.0.0.1:5173/index.html")
    assert rule_id == f"{mode}:fetch-local-host"
    assert decision is Decision.ALLOW


@pytest.mark.parametrize("mode", ["restricted", "ask"])
@verifies(SWR.SWR_2505)
def test_fetch_rules_are_ordered_ahead_of_the_read_only_tool_rule(mode: str) -> None:
    """Productive use: the ordering is the whole protection — first match wins.
    Expected outcome: the host-scoped fetch rules precede the blanket read-only
    allow, so they cannot become dead rules by accident."""
    rule_ids = [rule.rule_id for rule in PRESETS[mode].rules]

    assert rule_ids.index(f"{mode}:fetch-remote-host") < rule_ids.index(f"{mode}:read-only-tool")
    assert rule_ids.index(f"{mode}:fetch-local-host") < rule_ids.index(f"{mode}:read-only-tool")


@verifies(SWR.SWR_2503, SWR.SWR_2508)
def test_preset_defaults_are_unchanged_by_the_new_rules() -> None:
    """Productive use: the unsandboxed-autonomous downgrade keys off the
    autonomous preset's allow-by-default.
    Expected outcome: wiring the command rules in leaves every preset default
    exactly as it was, so that downgrade still triggers."""
    assert PRESETS["restricted"].default_decision is Decision.DENY
    assert PRESETS["ask"].default_decision is Decision.ASK
    assert PRESETS["autonomous"].default_decision is Decision.ALLOW


# --------------------------------------------------------------------------
# redaction (SWR-2504 / SWR-1829)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("GITHUB_TOKEN=ghp_realvalue123", "GITHUB_TOKEN=***"),
        ("ANTHROPIC_API_KEY=sk-abc123", "ANTHROPIC_API_KEY=***"),
        ("export AWS_SECRET_ACCESS_KEY=wJalr", "export AWS_SECRET_ACCESS_KEY=***"),
        ("MY_PASSWORD=hunter2", "MY_PASSWORD=***"),
        ("token=abc123", "token=***"),
        ("--token abc123", "--token ***"),
        ("Authorization: Bearer xyz", "Authorization: Bearer ***"),
    ],
)
@verifies(SWR.SWR_2504, SWR.SWR_1829)
def test_environment_variable_secrets_never_reach_the_approver(raw: str, expected: str) -> None:
    """Productive use: a reviewer reads an approval prompt for a command that
    carries a credential in an environment variable.
    Expected outcome: the value is masked — the underscore-joined names that a
    word-boundary match used to miss are covered."""
    assert redact_secrets(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "task-force",
        "--skip-tests",
        "https://example.com/docs/page",
        "sky_blue",
        "git commit -m 'ship it'",
        "uv run pytest tests/unit -k network",
    ],
)
@verifies(SWR.SWR_2504)
def test_redaction_leaves_the_command_readable(raw: str) -> None:
    """Productive use: a reviewer must still see which program is about to run.
    Expected outcome: nothing that only looks vaguely credential-shaped is
    masked, so the prompt keeps the information the decision needs."""
    assert redact_secrets(raw) == raw


@verifies(SWR.SWR_2504, SWR.SWR_1829)
def test_redaction_is_idempotent_and_shared_with_the_event_stream() -> None:
    """Productive use: the same text is masked once for the approval prompt and
    again on its way into the event stream and the audit log.
    Expected outcome: one implementation, and a second pass changes nothing —
    so a round-trip through the stream cannot corrupt a payload."""
    raw = "run --token ghp_abcdef GITHUB_TOKEN=ghp_zzz Authorization: Bearer sk-9"

    once = redact_secrets(raw)

    assert redact_secrets(once) == once
    assert redact_text(raw) == once
    assert redact_text(once) == once
    assert "ghp_" not in once
    assert "sk-9" not in once


@verifies(SWR.SWR_2504, SWR.SWR_1829)
def test_a_bare_token_value_is_masked_even_under_an_innocent_key() -> None:
    """Productive use: a credential is pasted into an argument whose name gives
    nothing away.
    Expected outcome: the value shape alone is enough to mask it, so the leak
    the key-name rules miss is closed."""
    assert redact_secrets("deploy --to ghp_abc123def") == "deploy --to ***"
    assert redact_secrets("id=eyJhbGciOi.body.sig") == "id=***"
