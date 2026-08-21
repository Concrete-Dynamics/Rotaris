# Rotaris Python SDK

Embed a Rotaris run in your own program: start a task, watch it happen, read
its result (SWR-1830). Import surface:

```python
from rotaris_core.sdk import (
    SDK_API_VERSION,
    RotarisClient,
    RotarisEvent,
    RunHandle,
    RunOptions,
    RunResult,
    RunStatus,
)
```

The SDK is not a second implementation of a run. `RotarisClient` builds a
request and calls `rotaris_core.run_host.execute_run` — the same entry point
`rotaris run` uses — so a session the SDK creates is an ordinary session:
listed by `rotaris sessions`, resumable from either side, with the same event
stream, the same `RunResult` and the same exit-code mapping.

Importing `rotaris_core.sdk` is deliberately cheap (about a second, no agent
SDK). The workspace configuration and the session store load on the first run.

## Minimal run

```python
import asyncio
from pathlib import Path

from rotaris_core.sdk import RotarisClient, RunStatus


async def main() -> None:
    async with RotarisClient(Path("/path/to/workspace")) as client:
        result = await client.run("Add a health check endpoint")

    print(result.status, result.summary)
    if result.status is not RunStatus.COMPLETED:
        raise SystemExit(result.exit_code)


asyncio.run(main())
```

A failed run is a **returned result**, not an exception: check
`result.status`. `result.exit_code` is the number the CLI would have exited
with — `0` completed, `1` failed or errored, `2` iteration limit, `130`
interrupted.

Pass a ready configuration when you have one, and skip the workspace load:

```python
client = RotarisClient(workspace, config=my_config)
```

## Streaming events

`client.start()` returns as soon as the run has a session id; the run itself
continues in the background.

```python
async with RotarisClient(workspace) as client:
    handle = await client.start("Refactor the payment adapter")
    print("session:", handle.session_id)

    async for event in handle.events():
        print(event.event, event.model_dump(mode="json"))

    result = await handle.result()
```

The events are the SWR-1829 models, identical to the JSONL that
`rotaris run --output-format stream-json` writes. `session.start` is first,
`result` is last, and the iterator ends after it — including when the run
failed or was cancelled.

Two properties of the stream are worth knowing:

- **Events arrive from agent threads.** They are handed to your event loop and
  read off a bounded queue, so nothing an agent does waits on your consumer.
- **A consumer that stops reading loses events, it does not stall the run.**
  Once the queue is full, further events are dropped and counted in
  `handle.dropped_events` (`0` for a consumer that keeps up). The result is
  unaffected: `await handle.result()` returns the terminal value directly
  rather than reading it off the stream, so it is never incomplete.

`events()` is one queue, not a broadcast. Two consumers split the stream
between them.

## Cancelling

```python
handle = await client.start("Long refactor")
await asyncio.sleep(30)
await handle.cancel()

result = await handle.result()
assert result.status is RunStatus.INTERRUPTED
assert result.exit_code == 130
```

`cancel()` asks the loop to stop the way Ctrl-C does, waits for it to unwind,
and returns once the session lock is released. It is idempotent and safe before
the run has really started. Awaiting `result()` afterwards gives you the
interrupted result rather than raising `CancelledError`.

Leaving the `async with` block cancels anything still running, which is why a
handle you abandon cannot strand a session lock.

## Approvals

A headless run denies every `ask` permission prompt unless you answer it. Pass
a resolver to take those decisions:

```python
def approve_reads(request: Mapping[str, Any]) -> str:
    if request["tool_name"] == "read_file":
        return "approve_session"
    return "deny"


result = await client.run(
    "Audit the config loader",
    options=RunOptions(approval_resolver=approve_reads),
)
```

The resolver is called on the agent's thread with a redacted, JSON-safe payload
(`request_id`, `session_id`, `agent_id`, `persona`, `tool_name`, `command`,
`argument_summary`, `rule_id`, `reason`) and must return `"approve_once"`,
`"approve_session"` or `"deny"`. Anything else — an unknown string, a raised
exception — is a deny: there is no path from a broken resolver to an allow.

## Resuming and inspecting sessions

```python
sessions = client.sessions()            # newest first, SessionState objects
result = await client.run(
    "Continue where you left off",
    options=RunOptions(session_id=sessions[0].session_id),
)
```

The same ids work from the CLI (`rotaris run --session <id> ...`), and a
`rotaris_core.session.SessionManager` pointed at the workspace loads them
without going through the SDK at all.

## Isolated worktrees

```python
RunOptions(isolate=True, worktree_branch="feature/health-check")
RunOptions(worktree_path=Path("/path/to/existing/worktree"))
```

`isolate` creates a fresh git worktree for the session; `worktree_path`
attaches an existing one. They are mutually exclusive, `worktree_branch`
requires `isolate`, and none of them may be combined with `session_id` — a
resumed session already carries the binding it was created with. An impossible
combination comes back as a `RunResult` with `RunStatus.ERROR` and the
diagnostic in `result.error`, not as an exception.

## API

`SDK_API_VERSION: str` — `"1"`.

```python
@dataclass(frozen=True, slots=True)
class RunOptions:
    max_iterations: int | None = None
    isolate: bool = False
    worktree_path: Path | None = None
    worktree_branch: str | None = None
    session_id: str | None = None
    approval_resolver: Callable[[Mapping[str, Any]], str] | None = None


class RotarisClient:
    def __init__(self, workspace: Path, *, config: RotarisConfig | None = None) -> None: ...
    async def __aenter__(self) -> RotarisClient: ...
    async def __aexit__(self, *exc: object) -> None: ...
    async def start(self, task: str, *, options: RunOptions | None = None) -> RunHandle: ...
    async def run(self, task: str, *, options: RunOptions | None = None) -> RunResult: ...
    def sessions(self) -> tuple[SessionState, ...]: ...
    async def aclose(self) -> None: ...


class RunHandle:
    session_id: str
    dropped_events: int
    done: bool
    def events(self) -> AsyncIterator[RotarisEvent]: ...
    async def result(self) -> RunResult: ...
    async def cancel(self) -> None: ...
```

`RunResult`, `RunStatus` and `RotarisEvent` are re-exported unchanged from
`rotaris_core.run_result` and `rotaris_core.events.schema`.

## Stability contract

The names in `rotaris_core.sdk.__all__` are public and stable. **Everything
else in `rotaris_core` is internal** and may change in any release without
notice — including `rotaris_core.run_host`, which the SDK is built on but does
not re-export.

`SDK_API_VERSION` is bumped when one of the public names changes signature or
meaning, or disappears. Adding a name, adding an optional argument, or adding a
field to an event does not bump it. It is independent of the package version
and of `EVENT_SCHEMA_VERSION`: three contracts, three audiences, three
cadences.

```python
from rotaris_core.sdk import SDK_API_VERSION

if SDK_API_VERSION != "1":
    raise RuntimeError("This integration targets Rotaris SDK API 1.")
```
