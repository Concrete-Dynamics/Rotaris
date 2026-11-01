# Open questions — Spikes, and the questions raised since (33 of 35)

Part 66 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-401, OQ-402; OQ-364 archived in [the archive](../../archive/architecture/open-questions/66-spikes-and-later-questions-33.md).

- OQ-364 — Are two tool calls whose arguments are one JSON object, emitted with its keys in different orders, "the same action" under REQ-ORCH-101?; ruled 2026-10-20; [archived](../../archive/architecture/open-questions/66-spikes-and-later-questions-33.md#oq-364)

<a id="oq-401"></a>

**OQ-401 — Which code-intelligence bundle does a development tree on a Windows ARM64 host carry?** *([OQ-400](../../archive/architecture/open-questions/64-spikes-and-later-questions-31.md#oq-400)'s
ruling, part (c), which builds the bundle's interpreter "for the target artifact's architecture" and, on `win32-arm64`, uses
the pinned `win32-x64` uv under the operating system's x64 emulation; REQ-STARTUP-026, which publishes no `windows-arm64`
artifact; REQ-STARTUP-015 and ADR-0035, the bundled runtime; IC-7's pins. Raised 2026-10-16 by the Windows 11 ARM64
session (`win-arm64-measure`), the session's range OQ-400 to OQ-449, its second number; the owner chose this course in the
session the same day.)*

**What is open.** OQ-400 settled the artifact: `package.mjs` passes `--target=win32-x64`, and packaging refuses an interpreter
of another architecture. It did not say what a development tree on an ARM64 host carries, and fin47 built the default as the
host's own target. On Windows 11 ARM64 that is an arm64 interpreter, and six of `serena-agent` 1.7.0's dependencies publish no
`win_arm64` wheel (`tiktoken` and `cryptography` need Rust; `psutil`, `pyyaml` and `ruamel-yaml-clib` need C), so with no
compilers the bundle cannot be built, and every check that needs it refuses: the live run, `init-proof`,
`code-intel-proof` ([the note](../../defects/no-code-intelligence-bundle-can-be-built-for-a-windows-arm64-development-tree.md)).

**What the build proceeds under.** On a `win32-arm64` host, a bundle step given no `--target` builds for `win32-x64`: the
interpreter is the pinned x86_64 one, its dependencies the `win_amd64` wheels, and Windows runs it under its x64 emulation,
as it runs the `win32-x64` uv already. `--check`, and every caller of it, then reads the same target, so the development
tree's bundle is the artifact's. Any other host keeps its own target. An explicit `--target` is unchanged. The development
tree's code intelligence on this host is therefore an emulated x64 runtime, which OQ-400 (b) counts as informing, never as
an x64 result.

**What a ruling decides.** Whether a Windows ARM64 development tree carries the `win32-x64` bundle (the reading above), or its
own arm64 bundle built from source (which needs a C and a Rust toolchain on every such host, and a pinned build of six
packages), or none (the checks that need it then stay unrun on such a host). **The costs:** the x64 bundle runs emulated and
measures nothing arm64 of the runtime; an arm64 build adds two toolchains and a source build to a development host for a
platform no release ships; none leaves the live run and three proofs unrunnable there.

**What a live run then shows.** Under the reading, a live run on this host runs its code-intelligence server as the emulated
x64 runtime, and its discovery line says whether that works.

*Measured 2026-10-21 under the reading (the session's F2; not a ruling): the bundle step with no `--target` built the `win32-x64`
tree on this host from published `win_amd64` wheels alone (20.6 s, none built), the interpreter's PE machine `0x8664`, and
`code-intel-proof` ran whole three times green against it (ADR-0035, "The proof on Windows 11 ARM64"). The live run's discovery
line is still to be read.*

<a id="oq-402"></a>

**OQ-402 — Does the orderly shutdown at a Windows session's end fit inside what Windows allows it?** *(REQ-SHELL-121, which
asks that a logout or shutdown run the orderly shutdown and leave no run consuming a provider; PD-ORCH-005 clauses 3, 9 and
23; `SessionEndShutdown` in `apps/desktop/src/main/exit.ts`, which starts the shutdown from a main window's `session-end`;
the run host's and each workspace service's `shutdown` at `deadlineMs: 30_000` in `apps/desktop/src/main/index.ts`. Raised
2026-10-20 by the Windows 11 ARM64 session (`win-arm64-measure`), item C5, the session's range OQ-400 to OQ-449, its third
number.)*

**What is open.** Windows' public documentation of `WM_ENDSESSION` says the session can end at any time after every
application has returned from that message. In C5's simulated logoff (stage A: `WM_QUERYENDSESSION`, then `WM_ENDSESSION`
with `ENDSESSION_LOGOFF`, sent to the application's own windows), Electron answered the query with 1 and returned from
`WM_ENDSESSION` within 15–16 ms, while the orderly shutdown it had started ran on: the process exited 0.9 s and 1.9 s later,
the store written as clause 23 wants (`paused`, `application_shutdown`, the iteration open by `quit`, the dialog
`approval_withdrawn`). Those shutdowns were short because the runs were scripted. The bounds the shutdown waits on are 30 s
for the run host and for each workspace service, so a shutdown with a run whose tools or model call take their time can
outlast the window Windows leaves, and what Windows does then (end the process, so the store is left as a crash leaves it and
REQ-SESSION-047's stale detection recovers it) is the outcome clause 23 rules out. Not measured: a real logout (stage B, which
needs the owner), and how long Windows waits on this host before it ends a process still running.

**What a ruling decides.** Whether the session's end keeps the 30 s bounds and accepts the crash-shaped outcome past
Windows' allowance; or holds the session's end while the shutdown runs (answering `WM_QUERYENDSESSION` and blocking
`WM_ENDSESSION` until done, which Windows answers with its "this app is preventing sign-out" screen after a few seconds, and
which Electron's `session-end` does not offer as built); or shortens the bounds at a session's end to fit, choosing which work
in flight is cut. **The costs:** the first is today's behaviour and rests on a timing nobody has measured; the second puts a
blocking screen in front of a person who chose to sign out; the third loses work a longer bound would have saved.
