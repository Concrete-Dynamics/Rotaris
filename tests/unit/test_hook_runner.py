"""Hook execution (SWR-2702, SWR-2703, SWR-2704) against real child processes.

Every hook here is an actual script run through the user's shell, because the
behaviour under test *is* the process boundary: exit codes, the JSON that
arrives on stdin, a kill after a timeout, a command that does not exist. A
mocked ``subprocess`` would assert the mock, not the contract.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import threading
from pathlib import Path
from textwrap import dedent
from typing import TYPE_CHECKING

import pytest
import yaml

from rotaris_core.config import loader
from rotaris_core.hooks import runner as hook_runner_module
from rotaris_core.hooks.models import (
    MAX_HOOK_OUTPUT_BYTES,
    ResolvedHook,
    resolve_hooks,
)
from rotaris_core.hooks.registry import (
    discard_hook_runner,
    register_hook_runner,
    reset_hook_registry,
    resolve_hook_runner,
)
from rotaris_core.hooks.runner import HookOutcome, HookRunner
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import SessionDiagnostics

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _isolated_hook_registry() -> Iterator[None]:
    """No runner may survive one test into the next."""
    reset_hook_registry()
    yield
    reset_hook_registry()


def _shell(*parts: str) -> str:
    """Quote *parts* the way the shell this platform hands hooks to expects."""
    if os.name == "nt":
        return subprocess.list2cmdline(parts)
    return shlex.join(parts)


def _shorten_reap_grace(monkeypatch: pytest.MonkeyPatch, seconds: float = 0.5) -> None:
    """Stop the timeout path spending its full reap budget in these tests.

    After the kill, the runner gives the child ``_REAP_GRACE_SECONDS`` (5s) to be
    reaped so an unreapable one cannot turn the timeout into a second unbounded wait.
    The scripts here sleep for a minute through a shell, so that bound is reached in
    full every time -- 5s per test, 10s of a 722s serial run, spent proving a bound
    neither test is about. What they assert is that the hook was killed at *its*
    budget and the call carried on, and both still do.
    """
    monkeypatch.setattr(hook_runner_module, "_REAP_GRACE_SECONDS", seconds)


def _script(tmp_path: Path, name: str, body: str, *args: str) -> str:
    """Write a hook script and return the shell command line that runs it."""
    path = tmp_path / name
    path.write_text(dedent(body).lstrip(), encoding="utf-8")
    return _shell(sys.executable, str(path), *args)


#: Prelude every payload-reading script starts with: read stdin as bytes, so the
#: hook decodes UTF-8 rather than the console code page.  Written unindented
#: because it is concatenated into scripts rather than embedded in one.
_READ_PAYLOAD = (
    "import json, pathlib, sys\npayload = json.loads(sys.stdin.buffer.read().decode('utf-8'))\n"
)

#: Records the payload the hook was actually handed, for the test to read back.
_WRITE_PAYLOAD = _READ_PAYLOAD + (
    "pathlib.Path(sys.argv[1]).write_text(json.dumps(payload), encoding='utf-8')\n"
)


def _hook(
    command: str,
    *,
    event: str = "pre_tool",
    matcher: str = "",
    name: str = "test-hook",
    timeout_seconds: float = 30.0,
    required: bool = False,
    index: int = 0,
) -> ResolvedHook:
    return ResolvedHook(
        name=name,
        event=event,
        matcher=matcher,
        command=command,
        timeout_seconds=timeout_seconds,
        required=required,
        source="workspace",
        index=index,
    )


def _runner(tmp_path: Path, *hooks: ResolvedHook, session_id: str = "s1") -> HookRunner:
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)
    return HookRunner(session_id=session_id, workspace=workspace, hooks=hooks)


@verifies(SWR.SWR_2702)
def test_pre_tool_exit_two_blocks_the_call_with_the_hooks_own_reason(tmp_path: Path) -> None:
    """Productive use: a developer stops the agent force-pushing by exiting 2 from a hook
    and explaining why on stderr.
    Expected outcome: the call is blocked and the agent is handed the hook's own sentence,
    in the same refusal shape a denied permission produces."""
    command = _script(
        tmp_path,
        "guard.py",
        """
        import sys
        sys.stderr.write("force pushes are banned on this repository")
        sys.exit(2)
        """,
    )
    runner = _runner(tmp_path, _hook(command, name="no-force-push"))

    outcomes = runner.run_pre_tool(
        tool_name="terminal",
        arguments={"command": "git push --force"},
        command="git push --force",
    )

    assert len(outcomes) == 1
    outcome = outcomes[0]
    assert outcome.blocked is True
    assert outcome.exit_code == 2
    assert "force pushes are banned on this repository" in outcome.feedback
    assert "no-force-push" in outcome.feedback
    assert "'terminal' call was not executed" in outcome.feedback
    # Working as designed, so no warning is shown to the user.
    assert outcome.warning == ""
    assert outcome.timed_out is False
    assert HookRunner.blocking_outcome(outcomes) is outcome


@verifies(SWR.SWR_2702)
def test_the_hook_reads_the_call_context_as_redacted_json_on_stdin(tmp_path: Path) -> None:
    """Productive use: a hook author inspects the real tool call — its name, arguments,
    session and workspace — without ever seeing the credentials inside it.
    Expected outcome: the JSON the hook actually read carries the call context, and the
    token buried three levels down in the arguments is masked."""
    seen = tmp_path / "seen.json"
    command = _script(tmp_path, "inspect.py", _WRITE_PAYLOAD, str(seen))
    runner = _runner(tmp_path, _hook(command), session_id="session-77")

    outcomes = runner.run_pre_tool(
        tool_name="fetch",
        arguments={
            "request": {"auth": {"headers": {"token": "ghp_deadbeefdeadbeefdead"}}},
            "url": "https://example.test",
        },
    )

    assert outcomes[0].exit_code == 0
    payload = json.loads(seen.read_text(encoding="utf-8"))
    assert payload["event"] == "pre_tool"
    assert payload["tool_name"] == "fetch"
    assert payload["session_id"] == "session-77"
    assert payload["workspace"] == str(runner.workspace)
    assert payload["arguments"]["url"] == "https://example.test"
    assert "ghp_deadbeefdeadbeefdead" not in seen.read_text(encoding="utf-8")


@verifies(SWR.SWR_2702)
def test_pre_tool_exit_other_than_zero_or_two_warns_and_lets_the_call_through(
    tmp_path: Path,
) -> None:
    """Productive use: a hook that is itself broken must not stop the agent working.
    Expected outcome: the call proceeds, and the user is told which hook misbehaved and
    what it said."""
    command = _script(
        tmp_path,
        "broken.py",
        """
        import sys
        sys.stderr.write("ModuleNotFoundError: no module named 'lint'")
        sys.exit(1)
        """,
    )
    runner = _runner(tmp_path, _hook(command, name="lint-guard"))

    outcome = runner.run_pre_tool(tool_name="terminal", arguments={})[0]

    assert outcome.blocked is False
    assert outcome.feedback == ""
    assert outcome.exit_code == 1
    assert "lint-guard" in outcome.warning
    assert "exited 1" in outcome.warning
    assert "no module named 'lint'" in outcome.warning


@verifies(SWR.SWR_2702)
def test_post_tool_exit_two_feeds_the_agent_back_without_blocking(tmp_path: Path) -> None:
    """Productive use: a formatting hook tells the agent it reformatted the file it just
    wrote, so the agent works from the new content.
    Expected outcome: the hook's stderr comes back as conversation feedback, and nothing
    is blocked — the call already happened."""
    command = _script(
        tmp_path,
        "formatter.py",
        """
        import sys
        sys.stderr.write("ruff reformatted main.py; re-read it before editing again")
        sys.exit(2)
        """,
    )
    runner = _runner(tmp_path, _hook(command, event="post_tool", name="format-after-edit"))

    outcomes = runner.run_post_tool(
        tool_name="str_replace_editor",
        arguments={"path": "main.py"},
        result={"ok": True},
    )

    outcome = outcomes[0]
    assert outcome.blocked is False
    assert HookRunner.blocking_outcome(outcomes) is None
    assert "re-read it before editing again" in outcome.feedback
    assert "format-after-edit" in outcome.feedback
    assert outcome.warning == ""


@verifies(SWR.SWR_2703)
def test_a_failing_lifecycle_hook_can_never_block_the_loop(tmp_path: Path) -> None:
    """Productive use: a user's end-of-session notification script fails, and the run still
    finishes normally.
    Expected outcome: a non-zero lifecycle exit is a warning and nothing more — not even
    when the entry asks to be required, which is a tool-hook concept."""
    command = _script(
        tmp_path,
        "notify.py",
        """
        import sys
        sys.stderr.write("notify-send is not installed")
        sys.exit(3)
        """,
    )
    runner = _runner(
        tmp_path,
        _hook(command, event="session_end", name="notify", required=True),
    )

    outcomes = runner.run_lifecycle("session_end", status="completed")

    outcome = outcomes[0]
    assert outcome.blocked is False
    assert outcome.feedback == ""
    assert outcome.exit_code == 3
    assert "notify" in outcome.warning
    assert HookRunner.blocking_outcome(outcomes) is None


@verifies(SWR.SWR_2703)
def test_lifecycle_fields_reach_the_hook_and_cannot_spoof_the_session(tmp_path: Path) -> None:
    """Productive use: an iteration_end hook receives the iteration's own data alongside the
    session it belongs to.
    Expected outcome: caller fields land in the payload, and one named like a fixed key is
    dropped instead of raising or overwriting the real session id."""
    seen = tmp_path / "lifecycle.json"
    command = _script(tmp_path, "record.py", _WRITE_PAYLOAD, str(seen))
    runner = _runner(tmp_path, _hook(command, event="iteration_end"), session_id="real-session")

    runner.run_lifecycle("iteration_end", iteration=4, session_id="spoofed")

    payload = json.loads(seen.read_text(encoding="utf-8"))
    assert payload["event"] == "iteration_end"
    assert payload["session_id"] == "real-session"
    assert payload["iteration"] == 4


@verifies(SWR.SWR_2703)
def test_an_unknown_lifecycle_event_fires_nothing(tmp_path: Path) -> None:
    """Productive use: a future call site can fire an event before any hook point exists
    for it, without a crash.
    Expected outcome: the runner silently reports no outcomes."""
    command = _script(tmp_path, "never.py", "raise SystemExit(0)\n")
    runner = _runner(tmp_path, _hook(command, event="session_end"))

    assert runner.run_lifecycle("not_a_real_event") == ()


@verifies(SWR.SWR_2704)
def test_a_hook_that_overruns_its_timeout_is_killed_and_the_call_proceeds(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a hook that hangs must not hang the agent with it.
    Expected outcome: the process is terminated at its budget, the tool call proceeds, and
    the user is warned that the hook timed out."""
    command = _script(
        tmp_path,
        "sleeper.py",
        """
        import time
        time.sleep(60)
        """,
    )
    runner = _runner(tmp_path, _hook(command, name="slow-hook", timeout_seconds=0.3))
    _shorten_reap_grace(monkeypatch)

    outcome = runner.run_pre_tool(tool_name="terminal", arguments={})[0]

    assert outcome.timed_out is True
    assert outcome.blocked is False
    assert outcome.feedback == ""
    assert "slow-hook" in outcome.warning
    assert "timed out" in outcome.warning
    # Killed at the budget rather than run to completion: nowhere near 60 s.
    assert outcome.duration_ms < 30_000


@verifies(SWR.SWR_2704)
def test_a_required_pre_tool_hook_that_times_out_blocks_the_call(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a security gate marked required must fail closed — if it never
    reached a verdict, the call does not happen.
    Expected outcome: the timeout blocks, and the agent is told why."""
    command = _script(
        tmp_path,
        "slow_gate.py",
        """
        import time
        time.sleep(60)
        """,
    )
    runner = _runner(
        tmp_path,
        _hook(command, name="security-gate", timeout_seconds=0.3, required=True),
    )
    _shorten_reap_grace(monkeypatch)

    outcomes = runner.run_pre_tool(tool_name="terminal", arguments={"command": "rm -rf /"})

    outcome = outcomes[0]
    assert outcome.timed_out is True
    assert outcome.blocked is True
    assert HookRunner.blocking_outcome(outcomes) is outcome
    assert "security-gate" in outcome.feedback
    assert "timed out" in outcome.feedback


@verifies(SWR.SWR_2704)
def test_a_hook_that_cannot_run_warns_instead_of_raising(tmp_path: Path) -> None:
    """Productive use: a typo in a hook command, or a workspace that has been deleted under
    the run, must not take the session down.
    Expected outcome: both produce a warning-carrying outcome and no exception."""
    runner = _runner(tmp_path, _hook("rotaris-no-such-command-xyz --nope", name="typo"))

    outcome = runner.run_pre_tool(tool_name="terminal", arguments={})[0]

    assert outcome.blocked is False
    assert outcome.warning != ""
    assert "typo" in outcome.warning

    vanished = HookRunner(
        session_id="s2",
        workspace=tmp_path / "gone",
        hooks=(_hook(_script(tmp_path, "ok.py", "raise SystemExit(0)\n"), name="orphan"),),
    )
    crashed = vanished.run_pre_tool(tool_name="terminal", arguments={})[0]

    assert crashed.blocked is False
    assert crashed.exit_code == -1
    assert "orphan" in crashed.warning
    assert "could not run" in crashed.warning


@verifies(SWR.SWR_2704)
def test_hook_output_is_captured_but_size_bounded(tmp_path: Path) -> None:
    """Productive use: a chatty hook — a full test run, say — must not blow up the session
    evidence or block on a full pipe buffer.
    Expected outcome: the beginning of the output is kept, the rest is dropped with a
    visible marker, and the hook still completes normally."""
    command = _script(
        tmp_path,
        "chatty.py",
        f"""
        import sys
        sys.stdout.write("x" * {MAX_HOOK_OUTPUT_BYTES * 3})
        sys.stderr.write("e" * {MAX_HOOK_OUTPUT_BYTES * 3})
        """,
    )
    runner = _runner(tmp_path, _hook(command))

    outcome = runner.run_pre_tool(tool_name="terminal", arguments={})[0]

    assert outcome.exit_code == 0
    assert outcome.stdout.startswith("x" * 100)
    assert "truncated" in outcome.stdout
    assert "truncated" in outcome.stderr
    assert len(outcome.stdout) < MAX_HOOK_OUTPUT_BYTES + 200
    assert len(outcome.stderr) < MAX_HOOK_OUTPUT_BYTES + 200


@verifies(SWR.SWR_2704)
def test_three_failures_disable_the_hook_after_exactly_one_notice(tmp_path: Path) -> None:
    """Productive use: a hook that is broken rather than unlucky stops costing the user a
    process per tool call, and stops nagging.
    Expected outcome: the third failure disables it with a single visible notice; later
    calls run nothing at all and say nothing more."""
    command = _script(tmp_path, "always_fails.py", "raise SystemExit(1)\n")
    hook = _hook(command, name="flaky")
    runner = _runner(tmp_path, hook)

    rounds = [runner.run_pre_tool(tool_name="terminal", arguments={}) for _ in range(5)]

    assert [len(outcomes) for outcomes in rounds] == [1, 1, 1, 0, 0]
    warnings = [outcomes[0].warning for outcomes in rounds[:3]]
    assert all(warning for warning in warnings)
    notices = [warning for warning in warnings if "disabled" in warning]
    assert len(notices) == 1
    assert "flaky" in notices[0]
    assert notices[0] is warnings[2]

    assert runner.disabled_hook_ids == frozenset({hook.hook_id})
    assert runner.has_hooks("pre_tool") is False


@verifies(SWR.SWR_2704)
def test_a_blocking_hook_is_never_disabled_for_doing_its_job(tmp_path: Path) -> None:
    """Productive use: a policy hook that legitimately blocks four calls in a row must keep
    blocking the fifth.
    Expected outcome: an exit 2 is not counted as a failure, so the hook stays enabled."""
    command = _script(
        tmp_path,
        "always_blocks.py",
        """
        import sys
        sys.stderr.write("not allowed")
        sys.exit(2)
        """,
    )
    runner = _runner(tmp_path, _hook(command, name="policy"))

    for _ in range(5):
        outcome = runner.run_pre_tool(tool_name="terminal", arguments={})[0]
        assert outcome.blocked is True

    assert runner.disabled_hook_ids == frozenset()
    assert runner.has_hooks("pre_tool") is True


@verifies(SWR.SWR_2704)
def test_the_failure_budget_is_shared_safely_across_agent_threads(tmp_path: Path) -> None:
    """Productive use: sibling agents dispatch tools on their own threads, and the hook they
    share must be disabled once, not once per thread.
    Expected outcome: concurrent runs produce exactly one disable notice and one disabled
    hook, with no lost or double counting."""
    command = _script(tmp_path, "thread_fail.py", "raise SystemExit(1)\n")
    hook = _hook(command, name="shared")
    runner = _runner(tmp_path, hook)
    collected: list[HookOutcome] = []
    guard = threading.Lock()

    def fire() -> None:
        outcomes = runner.run_pre_tool(tool_name="terminal", arguments={})
        with guard:
            collected.extend(outcomes)

    threads = [threading.Thread(target=fire) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)

    assert not any(thread.is_alive() for thread in threads)
    assert len([o for o in collected if "disabled" in o.warning]) == 1
    assert runner.disabled_hook_ids == frozenset({hook.hook_id})


@verifies(SWR.SWR_2702)
def test_only_the_hooks_whose_matcher_applies_are_run(tmp_path: Path) -> None:
    """Productive use: a user scopes an expensive hook to pushes and leaves a cheap audit
    hook on everything.
    Expected outcome: an unrelated command runs only the catch-all; the push runs both, in
    declaration order."""
    push_log = tmp_path / "push.log"
    all_log = tmp_path / "all.log"
    push_command = _script(
        tmp_path,
        "on_push.py",
        """
        import pathlib, sys
        sys.stdin.buffer.read()
        pathlib.Path(sys.argv[1]).write_text("fired", encoding="utf-8")
        """,
        str(push_log),
    )
    all_command = _script(
        tmp_path,
        "on_all.py",
        """
        import pathlib, sys
        sys.stdin.buffer.read()
        pathlib.Path(sys.argv[1]).write_text("fired", encoding="utf-8")
        """,
        str(all_log),
    )
    runner = _runner(
        tmp_path,
        _hook(push_command, matcher="git push *", name="on-push", index=0),
        _hook(all_command, matcher="", name="on-everything", index=1),
    )

    quiet = runner.run_pre_tool(
        tool_name="terminal",
        arguments={"command": "git status"},
        command="git status",
    )

    assert [outcome.name for outcome in quiet] == ["on-everything"]
    assert not push_log.exists()
    assert all_log.read_text(encoding="utf-8") == "fired"

    loud = runner.run_pre_tool(
        tool_name="terminal",
        arguments={"command": "git push origin main"},
        command="git push origin main",
    )

    assert [outcome.name for outcome in loud] == ["on-push", "on-everything"]
    assert push_log.read_text(encoding="utf-8") == "fired"


@verifies(SWR.SWR_2702)
def test_a_session_without_hooks_costs_nothing(tmp_path: Path) -> None:
    """Productive use: the overwhelming majority of runs declare no hooks and must not pay
    for the feature.
    Expected outcome: every entry point reports nothing to do, without starting a process."""
    runner = _runner(tmp_path)

    assert runner.has_hooks("pre_tool") is False
    assert runner.run_pre_tool(tool_name="terminal", arguments={}) == ()
    assert runner.run_post_tool(tool_name="terminal", arguments={}) == ()
    assert runner.run_lifecycle("session_start") == ()
    assert HookRunner.blocking_outcome(()) is None


@verifies(SWR.SWR_2702)
def test_hooks_run_in_the_workspace_with_the_runners_environment(tmp_path: Path) -> None:
    """Productive use: a hook can call repo-relative tooling and read a variable the host
    put there for it.
    Expected outcome: the process starts in the workspace and sees both the inherited
    environment and the runner's overrides."""
    seen = tmp_path / "env.json"
    command = _script(
        tmp_path,
        "environment.py",
        """
        import json, os, pathlib, sys
        sys.stdin.buffer.read()
        pathlib.Path(sys.argv[1]).write_text(
            json.dumps({"cwd": os.getcwd(), "marker": os.environ.get("ROTARIS_HOOK_MARKER", "")}),
            encoding="utf-8",
        )
        """,
        str(seen),
    )
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)
    runner = HookRunner(
        session_id="s1",
        workspace=workspace,
        hooks=(_hook(command),),
        env={"ROTARIS_HOOK_MARKER": "set-by-the-host"},
    )

    runner.run_pre_tool(tool_name="terminal", arguments={})

    observed = json.loads(seen.read_text(encoding="utf-8"))
    assert Path(observed["cwd"]).resolve() == workspace.resolve()
    assert observed["marker"] == "set-by-the-host"


@verifies(SWR.SWR_2702)
def test_the_runner_registry_binds_one_runner_per_session(tmp_path: Path) -> None:
    """Productive use: the tool-dispatch gate finds the right session's hooks without having
    a runner threaded through its constructor.
    Expected outcome: a registered runner resolves by session id only, an unregistered
    session resolves to nothing, and discarding one leaves the others alone."""
    first = _runner(tmp_path, session_id="alpha")
    second = _runner(tmp_path, session_id="beta")

    register_hook_runner("alpha", first)
    register_hook_runner("beta", second)

    assert resolve_hook_runner("alpha") is first
    assert resolve_hook_runner("beta") is second
    assert resolve_hook_runner("gamma") is None
    assert resolve_hook_runner(None) is None
    assert resolve_hook_runner("") is None

    discard_hook_runner("alpha")
    assert resolve_hook_runner("alpha") is None
    assert resolve_hook_runner("beta") is second

    with pytest.raises(ValueError, match="non-empty session id"):
        register_hook_runner("", first)

    reset_hook_registry()
    assert resolve_hook_runner("beta") is None


@verifies(SWR.SWR_2702, SWR.SWR_2703, SWR.SWR_2704)
def test_configured_hooks_govern_a_real_session_end_to_end(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer declares three hooks in their workspace config and runs a
    session — a push guard, an audit log, and an end-of-session notifier.
    Expected outcome: the guard blocks only the pushes, the audit hook actually writes its
    line from the redacted payload it was given, the failing notifier warns without
    blocking, and every invocation is in the session's evidence."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    workspace = tmp_path / "workspace"
    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir(parents=True)

    audit_log = tmp_path / "audit.jsonl"
    guard = _script(
        tmp_path,
        "e2e_guard.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("force pushing is not allowed on this branch")
        sys.exit(2)
        """,
    )
    auditor = _script(
        tmp_path,
        "e2e_audit.py",
        _READ_PAYLOAD
        + "with pathlib.Path(sys.argv[1]).open('a', encoding='utf-8') as handle:\n"
        + "    handle.write(json.dumps(payload) + '\\n')\n",
        str(audit_log),
    )
    ender = _script(tmp_path, "e2e_end.py", "raise SystemExit(7)\n")

    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        yaml.safe_dump(
            {
                "hooks": {
                    "entries": [
                        {
                            "name": "block-force-push",
                            "event": "pre_tool",
                            "matcher": "git push *",
                            "command": guard,
                            "timeout_seconds": 30,
                        },
                        {
                            "name": "audit-every-call",
                            "event": "post_tool",
                            "command": auditor,
                            "timeout_seconds": 30,
                        },
                        {
                            "name": "session-notifier",
                            "event": "session_end",
                            "command": ender,
                            "timeout_seconds": 30,
                        },
                    ],
                },
            },
        ),
        encoding="utf-8",
    )

    config = loader.load_config(workspace)
    hooks = resolve_hooks(config)
    assert [hook.name for hook in hooks] == [
        "block-force-push",
        "audit-every-call",
        "session-notifier",
    ]

    session_dir = tmp_path / "session"
    session_dir.mkdir()
    runner = HookRunner(
        session_id="sess-e2e",
        workspace=workspace,
        hooks=hooks,
        diagnostics=SessionDiagnostics(session_dir, "sess-e2e"),
    )
    register_hook_runner("sess-e2e", runner)
    assert resolve_hook_runner("sess-e2e") is runner

    blocked = runner.run_pre_tool(
        tool_name="terminal",
        arguments={"command": "git push --force"},
        command="git push --force",
    )
    blocking = HookRunner.blocking_outcome(blocked)
    assert blocking is not None
    assert "force pushing is not allowed on this branch" in blocking.feedback

    allowed = runner.run_pre_tool(
        tool_name="terminal",
        arguments={"command": "git status"},
        command="git status",
    )
    assert allowed == ()
    assert HookRunner.blocking_outcome(allowed) is None

    after = runner.run_post_tool(
        tool_name="terminal",
        arguments={"command": "git status", "api_key": "hunter2-in-the-clear"},
        command="git status",
        result={"exit_code": 0},
    )
    assert [outcome.name for outcome in after] == ["audit-every-call"]
    assert after[0].warning == ""
    logged = json.loads(audit_log.read_text(encoding="utf-8").strip())
    assert logged["event"] == "post_tool"
    assert logged["session_id"] == "sess-e2e"
    assert logged["workspace"] == str(workspace)
    assert logged["arguments"]["command"] == "git status"
    assert logged["arguments"]["api_key"] == "***"
    assert "hunter2-in-the-clear" not in audit_log.read_text(encoding="utf-8")

    finished = runner.run_lifecycle("session_end", status="completed")
    assert len(finished) == 1
    assert finished[0].blocked is False
    assert finished[0].exit_code == 7
    assert "session-notifier" in finished[0].warning

    timeline = [
        json.loads(line)
        for line in (session_dir / "timeline.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    hook_runs = [entry for entry in timeline if entry["type"] == "hook_run"]
    assert [entry["metadata"]["hook_name"] for entry in hook_runs] == [
        "block-force-push",
        "audit-every-call",
        "session-notifier",
    ]

    issues = json.loads((session_dir / "issues.json").read_text(encoding="utf-8"))["issues"]
    assert [issue["kind"] for issue in issues] == ["hook_failure"]
    assert "session-notifier" in issues[0]["message"]
