"""Seams between units that no unit could test on its own.

Each unit of the SWR-1828/2507 epic shipped with a green suite while the
composed behaviour was still broken: the egress policy was enforced only in its
own tests because the tool factory never passed it, and the loop reported a
sandbox as active from configuration alone.  These tests drive the joins.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _reset_fetch_registration() -> Iterator[None]:
    """Clear the process-global factory memo around each test."""
    import rotaris_core.agents.tool_registration as registration

    saved = registration._fetch_registered_config_id  # noqa: SLF001
    registration._fetch_registered_config_id = None  # noqa: SLF001
    yield
    registration._fetch_registered_config_id = saved  # noqa: SLF001


class _Runtime:
    """A ``RuntimePolicy``-shaped stand-in; the real one drags in the SDK."""

    def __init__(self, **fields: Any) -> None:
        self.tool_timeout = 10.0
        self.network_egress_policy = "deny"
        self.network_allowed_hosts: list[str] = []
        self.network_denied_hosts: list[str] = []
        self.__dict__.update(fields)


class _Config:
    def __init__(self, runtime: _Runtime) -> None:
        self.runtime = runtime


def _register_and_capture_fetch_executor(config: _Config, monkeypatch: Any) -> Any:
    """Drive the real registration path and return the executor it produced.

    The factory goes into the SDK's process-global tool registry, which has no
    read-back accessor; capturing at the ``_register_tool_factory`` boundary
    keeps the memoization and policy construction under test.
    """
    import rotaris_core.agents.tool_registration as registration

    captured: dict[str, Any] = {}

    def _capture(name: str, factory: Any) -> None:
        captured[name] = factory

    monkeypatch.setattr(registration, "_register_tool_factory", _capture)
    registration._register_fetch_tool_factory(config)  # type: ignore[arg-type]  # noqa: SLF001
    if "fetch" not in captured:
        return None
    return captured["fetch"]()[0].executor


@verifies(SWR.SWR_2505)
def test_registered_fetch_tool_enforces_the_configured_egress_policy(monkeypatch: Any) -> None:
    """Productive use: an operator's configured host allow/deny lists apply to the
    fetch tool the agent is actually handed, not just to a hand-built executor.
    Expected outcome: the factory-produced executor carries the configured policy,
    so a denied host is refused on a real run rather than only in unit tests."""
    config = _Config(
        _Runtime(
            network_egress_policy="deny",
            network_allowed_hosts=["example.com"],
            network_denied_hosts=["evil.test"],
        ),
    )

    executor = _register_and_capture_fetch_executor(config, monkeypatch)
    assert executor is not None

    policy = executor.egress_policy
    assert policy.disposition == "deny"
    assert policy.classify("https://evil.test/x") == "deny"
    assert policy.classify("https://example.com/x") == "allow"
    # The pre-reconciliation bug: a permissive default silently replacing the
    # configured policy would have classified every host as "allow".
    assert policy.classify("https://unlisted.test/x") == "deny"


@verifies(SWR.SWR_2505)
def test_tightening_the_host_list_re_registers_the_fetch_tool(monkeypatch: Any) -> None:
    """Productive use: an operator who tightens the denied-host list mid-process
    gets the tighter policy on the next session.
    Expected outcome: the factory memo keys on the egress settings, so the stale
    looser executor is not reused for a config object of the same identity."""
    runtime = _Runtime(network_egress_policy="allow")
    config = _Config(runtime)

    first = _register_and_capture_fetch_executor(config, monkeypatch)
    assert first is not None
    assert first.egress_policy.classify("https://evil.test/x") == "allow"

    # Same config object, tightened settings: identity-only memoization would
    # skip re-registration here and leave the permissive executor in place.
    runtime.network_denied_hosts = ["evil.test"]
    second = _register_and_capture_fetch_executor(config, monkeypatch)
    assert second is not None
    assert second.egress_policy.classify("https://evil.test/x") == "deny"


@verifies(SWR.SWR_2507)
def test_unavailable_sandbox_is_not_reported_as_active(monkeypatch: Any) -> None:
    """Productive use: a CI consumer reading the event stream can trust
    ``session.start.sandboxed`` to mean commands were actually confined.
    Expected outcome: a configured-but-unavailable sandbox reports inactive, so
    the flag never overstates the confinement the run really had."""
    from rotaris_core.sandbox.session import sandbox_status
    from rotaris_core.sandbox.spec import SandboxAvailability

    config = _Config(_Runtime())
    config.runtime.sandbox_mode = "workspace-write"
    config.runtime.sandbox_writable_roots = []
    config.runtime.sandbox_allow_network = False

    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: SandboxAvailability(
            available=False,
            backend="bubblewrap",
            reason="bwrap not found",
            remediation="install bubblewrap",
        ),
    )
    assert sandbox_status(config) == (False, "")

    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: SandboxAvailability(available=True, backend="bubblewrap"),
    )
    assert sandbox_status(config) == (True, "bubblewrap")


@verifies(SWR.SWR_1829)
def test_stream_observer_is_importable_without_a_fallback() -> None:
    """Productive use: a streaming run gets iteration and child events, not just
    the lifecycle events the CLI emits by itself.
    Expected outcome: the composite observer resolves for real, so the removed
    ImportError fallback cannot silently reduce the stream to lifecycle-only."""
    from rotaris_core.cli.background import _with_stream_observer
    from rotaris_core.events.observer import CompositeIterationObserver
    from rotaris_core.ralph.iteration_observer import RalphIterationObserver

    base = RalphIterationObserver()
    composed = _with_stream_observer(base, "session-abc")

    assert isinstance(composed, CompositeIterationObserver)
    assert base in composed.observers


@verifies(SWR.SWR_2504)
def test_one_redactor_owns_both_the_approval_dialog_and_the_event_stream() -> None:
    """Productive use: an approver sees a masked secret whichever surface renders
    the command, and the audit log stores the masked form.
    Expected outcome: both entry points mask the env-var shapes that previously
    leaked, so neither surface can drift back to showing a real credential."""
    from rotaris_core.events.schema import redact_text
    from rotaris_core.permissions.approval import redact_secrets

    leaky = "GITHUB_TOKEN=ghp_realvalue123 ANTHROPIC_API_KEY=sk-abc123"
    for masked in (redact_secrets(leaky), redact_text(leaky)):
        assert "ghp_realvalue123" not in masked
        assert "sk-abc123" not in masked

    # Readable text must survive both.
    innocuous = "pytest task-force --skip-tests"
    assert redact_secrets(innocuous) == innocuous
    assert redact_text(innocuous) == innocuous


@verifies(SWR.SWR_2507)
def test_the_session_dialog_default_matches_what_the_run_will_use() -> None:
    """Productive use: a user who sets the sandbox in Settings sees that choice
    pre-selected when they start the next session.
    Expected outcome: the dialog default and the run config are read from the
    same place, so the checkbox cannot promise a mode the run will not apply."""
    from rotaris.services.config_service import SECURITY_POLICY_FIELDS
    from rotaris.views.main_window import MainWindow

    # ``build_run_config`` pushes the store onto the run's RuntimePolicy, so an
    # unsaved Settings change is what the run applies.
    assert "sandbox_mode" in SECURITY_POLICY_FIELDS

    class _Store:
        def __init__(self, mode: str) -> None:
            self.runtime = _Runtime(sandbox_mode=mode)

    class _Service:
        def __init__(self, store_mode: str, saved_mode: str) -> None:
            self.store = _Store(store_mode)
            self.config = _Config(_Runtime(sandbox_mode=saved_mode))

    class _Host:
        """Only ``config_service`` is touched, so no Qt window is needed."""

        def __init__(self, service: _Service) -> None:
            self.config_service = service

    # Store says workspace-write, the last saved file still says off.  Reading
    # the saved config would offer "off" and then launch a sandboxed run.
    host = _Host(_Service("workspace-write", "off"))
    mode, _unavailable = MainWindow._sandbox_offer(host)  # type: ignore[arg-type]  # noqa: SLF001
    assert mode == "workspace-write"
