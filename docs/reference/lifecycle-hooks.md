# Lifecycle hooks

Run your own shell commands at defined points in a Rotaris run: before and
after a tool call, and at five session lifecycle events (SWR-2701–2704). A hook
is user code, not agent code — it runs on the host, outside the agent's
permission policy and outside the sandbox — and a `pre_tool` hook can stop a
tool call the agent was about to make.

Hooks are declared in the layered configuration and read at load time, so a
typo'd event or an unreadable matcher is a config error with a field name on
it, not a hook that silently never fires.

## The seven events

| Event | Fires | Can it steer the run? |
| --- | --- | --- |
| `pre_tool` | before an allowed tool call executes | yes — exit 2 blocks the call |
| `post_tool` | after a tool call executed | yes — exit 2 feeds text back to the agent |
| `session_start` | once, when the loop takes over the run, before the first iteration | no |
| `session_end` | once, however the run ends — including a failure or a Ctrl-C | no |
| `iteration_end` | after every Ralph iteration | no |
| `child_completed` | when a child agent reaches a terminal state | no |
| `verifier_finished` | after each verifier run (SWR-2602) | no |

`pre_tool` and `post_tool` are the **tool hooks**; the other five are the
**lifecycle hooks**. The split matters: a lifecycle hook is informational by
definition and can never block the loop, whatever it exits with.

`pre_tool` fires only for calls the permission policy already allowed. A call
the policy denied never happened, so no hook observes it — and `post_tool`
therefore only ever sees calls that really executed, never a policy denial and
never a `pre_tool` block.

## Declaring hooks

Hooks live under `hooks:` in `agents.yaml`, in either config scope:

- **global** — `agents.yaml` in the per-user config directory
  (`~/.config/rotaris/` on Linux; the platform's user-config directory
  elsewhere). These always run.
- **workspace** — `<workspace>/.rotaris/agents.yaml`. These are gated behind a
  trust verdict; see [Workspace hooks are untrusted](#workspace-hooks-are-untrusted).

```yaml
hooks:
  enabled: true
  entries:
    - name: block-release-tags
      event: pre_tool
      matcher: git tag *
      command: python3 ~/.config/rotaris/hooks/refuse.py
      timeout_seconds: 10
      required: false
      enabled: true
```

The list shorthand means exactly the same thing — use it when you never need
the master switch:

```yaml
hooks:
  - name: block-release-tags
    event: pre_tool
    matcher: git tag *
    command: python3 ~/.config/rotaris/hooks/refuse.py
```

`hooks:` follows the same overlay rule as the rest of the layered config: a
scope that declares `entries` **replaces** the inherited list outright rather
than appending to it. A scope that only sets `enabled` leaves the inherited
list alone.

### Every field

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `event` | string | *required* | One of the seven events above. Anything else is a load-time error. |
| `command` | string | *required* | The shell one-liner to run. Must not be blank. |
| `name` | string | `""` | Label shown in warnings and diagnostics. Empty means the generated id `<source>:<index>:<event>` is used instead. |
| `matcher` | string | `""` | Which calls this hook applies to. Empty means all of them. Ignored for lifecycle events. |
| `timeout_seconds` | float | `60` | Wall-clock budget for the process. Must be greater than zero. |
| `required` | bool | `false` | For `pre_tool` only: a hook that reached *no verdict* blocks the call instead of warning. See [`required`](#required-blocks-only-when-there-was-no-verdict). |
| `enabled` | bool | `true` | Set `false` to keep the entry but switch it off. A disabled entry still holds its position, so its neighbours' ids do not shift. |
| `source` | string | — | Stamped by the loader (`global`, `workspace` or `default`). **Never write this by hand.** |

`hooks.enabled: false` at the section level runs no hooks at all without
deleting their declarations.

## Exit codes

The exit code is the whole interface back from a hook. What it means depends on
which class of event fired it.

### `pre_tool`

| Exit | Effect |
| --- | --- |
| `0` | The call proceeds. |
| `2` | The call is **blocked**. The hook's stderr is fed back to the agent as the tool result, in the same shape as a permission `deny`, and the agent re-plans. |
| anything else | Non-blocking warning. The call proceeds. |

The refusal the agent sees is built from the hook's stderr:

```
Blocked by hook '<name>'. <the hook's stderr> The '<tool>' call was not
executed. Choose a different approach or ask the user to adjust the hook
configuration.
```

A hook that exits 2 without writing to stderr gets `The hook gave no reason.`
in place of its text — say why you blocked.

### `post_tool`

| Exit | Effect |
| --- | --- |
| `0` | Nothing. |
| `2` | The hook's stderr is injected into the conversation as feedback, appended to the tool's own result. The call already happened and stands; the agent sees both. |
| anything else | Non-blocking warning. |

A `post_tool` hook can never block. Exit 2 there is steering, not a refusal:
the agent reads "Hook '<name>' reported after the '<tool>' call: …" *next to*
what the tool returned, not instead of it.

### The five lifecycle events

Informational, always. A non-zero exit — any non-zero exit — is a non-blocking
warning and can never stop the loop. Blocking control flow belongs to tool
hooks, the permission policy and the verifier gate.

### `required` blocks only when there was no verdict

`required: true` does **not** mean "a non-zero exit blocks". A `pre_tool` hook
that exits 1, 3 or 127 is a broken hook, and a broken hook never stands between
the agent and its work — that is a warning whether or not `required` is set.

What `required: true` changes is the case where the hook reached **no verdict at
all**: it timed out and was killed, or it could not be spawned. Without
`required` those proceed with a warning; with `required` they block the call,
and the agent is told the hook timed out or could not be started.

`required` has no effect on `post_tool` or on the lifecycle events.

## Matchers

A matcher decides which tool calls a tool hook applies to. An empty matcher
matches every call. Matchers are ignored for lifecycle events, which have no
call to select on.

When the call carries a shell command, the matcher is read as an **SWR-2502
command pattern** and tried against every segment of the command line — so a
matcher still catches the destructive half of `git status && rm -rf /`. When
the call carries no command, the matcher is a case-sensitive `fnmatch` glob
over the **tool name** (`edit`, `str_replace_*`, …).

A command pattern is tokenised like a shell line. Every token must glob-match
the token at the same position, and by default the token counts must be equal.
A **trailing `*` as its own token** additionally absorbs any number of remaining
arguments, including none.

### The `git push *` trap

The space before the `*` is load-bearing. These two are not the same pattern:

| Matcher | `git push` | `git push --force` | Why |
| --- | --- | --- | --- |
| `git push *` | matches | **matches** | `*` is a separate token, so it absorbs the remaining arguments |
| `git push*` | matches | **does not match** | `push*` is one glob token; the pattern is exactly two tokens long and `git push --force` is three |

Write `git push *` — with the space — whenever you mean "`git push` and
whatever comes after it". `git push*` guards only a bare `git push` with no
arguments at all, which is almost never what a guard hook wants.

## The payload

Everything a hook is allowed to know arrives as **one JSON object on stdin**.
Nothing is interpolated into the command line, ever: a tool argument containing
`; rm -rf /` is inert data on stdin and would be a shell injection if it were
spliced into the command. Read stdin to EOF and parse it.

Strings are redacted **structurally, at every depth** — a token buried three
levels down in a request body is masked exactly as a top-level `--token` flag
is, and a value hanging off a credential-shaped key (`api_key`, `password`, …)
is replaced with `***` whole.

The hook process starts with the run's working tree as its working directory
(the isolated worktree, in a worktree-isolated session) and inherits the host's
environment.

### Tool events

```json
{
  "event": "pre_tool",
  "tool_name": "deploy",
  "arguments": {"data": {"target": "production", "api_key": "***"}},
  "session_id": "20260808-101500-abcdef123456",
  "workspace": "/home/you/project",
  "command": ""
}
```

`event`, `tool_name`, `arguments`, `session_id`, `workspace` and `command` are
always present, so a hook can read any of them unconditionally. `command` is
`""` for a tool that is not shell-shaped. `arguments` is the tool action's own
fields — an MCP tool nests them under `data`, a terminal tool puts the command
line in `command`.

`post_tool` adds `result` when the call produced something to report: a small,
capped rendering of what the agent was shown, either `{"observation": "…"}` or
`{"error": "…"}`. A `pre_tool` payload never carries it — the call has not
happened yet.

### Lifecycle events

Every lifecycle payload carries `event`, `session_id` and `workspace`, plus the
event's own fields:

| Event | Extra fields |
| --- | --- |
| `session_start` | `task` |
| `session_end` | `status` |
| `iteration_end` | `iteration`, `outcome`, `child_name`, `status`, `summary` |
| `child_completed` | `child_id`, `child_name`, `persona`, `state`, `status`, `summary` |
| `verifier_finished` | `iteration`, `executed`, `passed`, `skip_reason`, `failed_checks` |

```json
{
  "event": "session_end",
  "session_id": "20260808-101500-abcdef123456",
  "workspace": "/home/you/project",
  "status": "completed"
}
```

`event`, `session_id` and `workspace` are reserved: an event's own data can
never overwrite them, because branching on `event` is the first thing a shared
hook script does.

## Bounds, failures and the disable rule

- **Timeouts.** Every hook is spawned with its `timeout_seconds` budget and
  killed when it expires. The default is 60 s — a bound, not a target.
- **Output.** stdout and stderr are captured and truncated at 16 KiB each for
  the diagnostics record. Beyond that a `[truncated: N bytes of output, …]`
  marker is appended.
- **Nothing raises.** A missing interpreter, an unwritable workspace, a hook
  killed by a signal — each becomes a warning, never an exception into the run.
- **Three failures disable a hook** for the rest of the session, with one
  notice on the invocation that crosses the line. Later events skip it
  silently, because a hook the user has already been told about should not warn
  on every call for the rest of the run.

A **`pre_tool` exit 2 is not a failure.** It is the hook working exactly as
designed, and it does not count towards the disable threshold — otherwise a
correctly blocking guard would switch itself off after three legitimate blocks.
The same goes for a `post_tool` exit 2. What counts is a timeout, a spawn
failure, or an exit code with no defined meaning.

Every invocation is written to the session's diagnostics timeline as a
`hook_run` entry, and every warning as a `hook_failure` issue. Hooks bypass the
permission policy, so that trail is the only record that they ran.

### Lifecycle hooks run inline

Lifecycle hooks run on the loop's own thread, so a hook that uses its whole
budget stalls the run for that long. That is deliberate: dispatching to a
background thread would make a `session_end` notification hook unreliable,
because the run's teardown would race it. The knob is your own
`timeout_seconds`.

## Workspace hooks are untrusted

`<workspace>/.rotaris/agents.yaml` is an ordinary file inside a repository, so
it travels with a clone. Without a gate, cloning a repository and opening it in
Rotaris would run whatever its author wrote, with no user action beyond opening
the project. That is remote code execution.

So:

- Hooks from the **global** scope and the built-in defaults always run. You
  wrote those on your own machine.
- Hooks from the **workspace** scope run only after an explicit verdict
  recorded for *that* workspace and *that exact hook set*. Until then they are
  skipped and a notice says so.
- An unrecognised scope is treated as untrusted. There is no "unknown means
  fine" branch.

The verdict is stored in `<workspace>/.rotaris/hook-trust.json`, against a
SHA-256 digest of the workspace hooks' names, events, matchers, commands,
timeouts, `required` flags **and their order**. Changing, adding, removing or
reordering any workspace hook invalidates the verdict and asks again.

**A refusal sticks.** Declining is a decision, not the absence of one; it is
stored and honoured until the hook set itself changes. Re-asking on every run
would train you to click the dialog away.

**A repository cannot disable your hooks by declaring a list.** A workspace
`entries:` list replaces the inherited global list — which on its own would let
a hostile repository delete your guardrails just by declaring a list and having
you decline it. When workspace hooks are refused, the global entries they
superseded are put back, and the notice says so:

```
Skipped 1 hook declared by this workspace's .rotaris/agents.yaml: workspace
hooks run shell commands and this workspace has not been reviewed and trusted
yet. Review the hooks in Rotaris to allow them to run. Your own 1 configured
hook still runs.
```

The notice deliberately reports only a count and the file. Hook names and
commands are text written by whoever wrote the repository, and a terminal is
the wrong place to render text you have not agreed to look at — the full list
belongs in the review prompt, which you opened on purpose.

**One known and intended exception:** hooks loaded through the CLI's
`--config <path>` override are trusted. You typed that path on your own command
line, which is a materially different act from opening a directory that arrived
inside a clone.

## Worked example: a `pre_tool` guard

Only the release manager cuts release tags in this project. That is a rule
about *your* project, not a universally dangerous command — which is exactly
when a hook is the right instrument.

> **Pick your example carefully.** A hook only ever sees calls the permission
> policy already allowed, and the built-in policy denies the classic dangerous
> commands (`rm -rf …`, `sudo …`, `git push --force …`, `npm publish …`) in
> every mode, including `autonomous`. A `pre_tool` hook matching one of those
> would never fire, because the call is refused before any hook runs. Hooks are
> for the rules the policy has no opinion about.

`~/.config/rotaris/hooks/no_release_tags.py`:

```python
#!/usr/bin/env python3
"""Block release tagging. Exit 2 = block; stderr is what the agent is told."""
import json
import sys

payload = json.load(sys.stdin)
command = payload.get("command", "")

sys.stderr.write(
    f"Release tags are cut by the release manager, not by an agent ({command!r}). "
    "Open a pull request and let the release job tag the merge commit."
)
sys.exit(2)
```

`~/.config/rotaris/agents.yaml`:

```yaml
hooks:
  entries:
    - name: no-release-tags
      event: pre_tool
      matcher: git tag *
      command: python3 ~/.config/rotaris/hooks/no_release_tags.py
      timeout_seconds: 10
```

What happens on a run: the agent proposes `git tag release-1.0`, the permission
policy allows it, the matcher fires, the hook exits 2 — the tool is never
invoked, no tag exists afterwards, and the agent receives

```
Blocked by hook 'no-release-tags'. Release tags are cut by the release manager,
not by an agent ('git tag release-1.0'). Open a pull request and let the release
job tag the merge commit. The 'terminal' call was not executed. Choose a
different approach or ask the user to adjust the hook configuration.
```

— and carries on with something else. The run's own terminal status is
unaffected: a blocked call is a refused tool call, not a failed run.

Notice what this example depends on: the matcher is `git tag *` **with the
space**, so it also catches `git tag -a release-1.0 -m "…"`. Spell it
`git tag*` and it would guard nothing but a bare, argument-less `git tag`.

## Python surface

Everything is re-exported from `rotaris_core.hooks`:

```python
from rotaris_core.hooks import (
    HookRunner,
    register_hook_runner,
    resolve_hooks,
    trusted_hooks_for_config,
)

trusted = trusted_hooks_for_config(config, workspace)
runner = HookRunner(session_id=session_id, workspace=workspace, hooks=trusted.allowed)
register_hook_runner(session_id, runner)
```

Build a runner from `TrustedHookSet.allowed`, never from `resolve_hooks(config)`
directly — the latter has not been through the trust gate.

Importing `rotaris_core.hooks` is cheap (about 200 ms, no agent SDK), because
the agent's tool-dispatch gate resolves a runner on every allowed tool call.
`HookLifecycleObserver` is the one exception: it subclasses the Ralph observer
seam, so it is resolved lazily and only a caller that touches that name pays
for the agent SDK.

`rotaris_core.hooks` is internal API. Only the names in
`rotaris_core.sdk.__all__` are covered by the SDK stability contract; see
[python-sdk.md](python-sdk.md).
