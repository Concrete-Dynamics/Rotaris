# ADR-0068 — An agent's workflow script runs in a QuickJS isolate inside the run host, and acts only through its agent's own port

- **Status:** accepted, 2026-11-24, with its first execution.
- **Date:** 2026-11-24
- **Origin:** [`PD-ORCH-018`](../../product/directives/pd-orch-018.md#pd-orch-018) clauses 5 to 8, raised by the owner as
  [R-126](../../product/requests.md#r-126). The owner chose the runtime: a QuickJS isolate.
- **Depends on:** ADR-0002 (process topology: no new process), ADR-0016 and ADR-0017 (the gate and the permission policy a
  script's calls pass), ADR-0056 (the build: what is bundled and what is external).
- **Requirements:** `PD-ORCH-018` governing; `REQ-TOOLS-001` (the public tool names, to which the directive adds
  `workflow`), `REQ-ORCH-055` to `REQ-ORCH-063` (the resume loop a workflow joins).
- **Spike:** [`spikes/quickjs-workflow-isolate.md`](../spikes/quickjs-workflow-isolate.md).

## Context

The directive asks that an agent of a `solo` run can hand the product a script it wrote, and that the script start agents,
run them side by side and in stages, and call the tools its agent holds. A script is text a model wrote, possibly under
the influence of content it read. It must be unable to do anything its agent could not do, and unable to harm the process
it runs in. The run host holds the run's credentials and its store writer.

## Decision

1. **The interpreter.** `quickjs-emscripten-core` with its `release-sync` variant, version 0.32.0 (MIT), a QuickJS
   interpreter compiled to WebAssembly. One module instance per workflow, over its own
   `WebAssembly.Memory` whose `maximum` is the script's heap bound (64 MiB). The interpreter's own `setMemoryLimit` is not
   used: the spike showed it does not bound an allocating script.
2. **No ambient authority.** The script's global object holds the language and one function the host adds, removed from
   the global object once the prelude has captured it. `Date` and `Math.random` are removed, so a script reads the same on
   a replay. The prelude builds `agent`, `tool`, `phase`, `log`, `parallel` and `pipeline` as ordinary script code over
   that one function (`packages/agent-tools/src/workflow/isolate.ts`).
3. **Processor time.** An interrupt handler ends an entry into the interpreter that runs longer than its slice (2 s).
   Time a script spends waiting on a call is not processor time; the run's own limits bound it.
4. **A script acts through its agent's port.** A `tool()` call is dispatched by the run host through the launching
   agent's own gate, under that agent's identity: permission mode, sandbox, write fence, hooks, approvals and the audit
   record are the gate's, unchanged. An `agent()` call goes through the same delegation operations `delegate` uses, as a
   child of the launching agent, so the child limits, the depth limit and the write scopes reach it unchanged. The script
   cannot call `workflow` itself.
5. **The engine knows a workflow only as something a parent waits for.** `DelegationOps` gains `beginWorkflow`,
   `endWorkflow` and `claimForWorkflow`. While a parent has a workflow running its resume loop waits as it waits for a
   child; when the workflow ends the parent's next message carries the ending. A child a workflow started is claimed, so
   the loop does not also report it one by one. The signal `beginWorkflow` returns aborts when the run stops or comes to
   rest, and the script ends with it.
6. **The journal.** Calls are numbered in the order the script makes them. Each answer is recorded with the call's kind
   and its arguments as canonical JSON. A script started over a journal is answered from it while its calls match, and
   from the host from the first call that does not; a call cut off by a stop or a rest records nothing and is asked again
   (`workflow/journal.ts`).
7. **Where the code lives.** The isolate, the journal and the tool are in `@rotaris/agent-tools`, beside the other
   executors; the engine holds only item 5; the run host binds the two. The two npm packages are dependencies of
   `@rotaris/agent-tools` and of `@rotaris/desktop`, the second so that the build keeps them external and the interpreter
   finds its `.wasm` file beside its module at run time.

## Alternatives considered and rejected

- **A `node:vm` context in a worker thread.** No dependency, and not a security boundary: a script can reach the host's
  realm through an object the host hands it. Rejected for a process that holds credentials.
- **A separate Node process under the permission model.** The strongest isolation, at the price of a sixth kind of
  process (ADR-0002), a protocol to it, and its cleanup on every platform. The owner chose the isolate.
- **A declared plan in place of a script.** No interpreter at all. The owner chose a script, which can branch on what
  its agents report.
- **Bundling the interpreter into the run host's chunk.** Measured: the build carried the module's JavaScript and left
  its `.wasm` file behind, so the interpreter could not start.

## Consequences

- A new dependency of two packages, about 0.5 MiB of WebAssembly, in the packaged application.
- A second way to start children. Every limit reaches it because it uses the first way's operations; a limit added
  later to `delegate`'s tool and not to those operations would miss it.
- A script's tool calls are in the audit record and are not transcript rows, since the turn writes those. Clause 9's
  workflow row is where they are shown.
- A workflow lives inside the iteration that started it.

## What this record does not decide, and what is owed

- Where the journal is stored, and the resume after a restart (clause 8): the journal exists in memory only.
- The transcript row (clause 9).
- The interpreter inside the packaged application's archive on each platform: not measured.

## Revisit if

A script needs more than 64 MiB or 2 s of processor time per entry for honest work; the interpreter's upstream stops
publishing a `release-sync` variant; or a way out of the isolate is published for the version in use.
