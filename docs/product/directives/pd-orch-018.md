[Product directives](../directives.md) › PD-ORCH-018

<a id="pd-orch-018"></a>

### PD-ORCH-018 — a `solo` strategy: one agent that does the work, delegates when it chooses, and scripts workflows

A third run override, `solo`, MUST be supported beside `swarm` and `single`, written `rotaris.delegation_strategy: solo`
as the workspace's default and selectable where a run is started. This directive's case is **a run taken under `solo`**,
and nothing it states reaches a run taken under any other strategy.

1. **The entry role is the worker and keeps delegation.** Under `solo` the entry role does not act as coordinator, so the
   constraints of REQ-ORCH-029 do not bind it. It MUST be granted the direct-work bundle of REQ-ORCH-016 whatever the
   request is, and the `delegate` tool MUST NOT be withheld from it. Its instructions MUST say that it does the work
   itself and hands a part to a child only where that helps: independent parts that can run side by side, or a part
   worth keeping out of its own conversation.
2. **No classification.** A `solo` run MUST NOT make an intent classification request, MUST NOT show the classifying
   status, and MUST start its first iteration without one. No playbook cell is given to any role of the run and no
   BUDGET cell clamps its child limits: the configured limits bind as written.
3. **The plan gate follows the run-start mode alone.** A `solo` run started in plan mode is held at the plan gate as any
   other run is; a run not started in plan mode is never held.
4. **Depth decides who may spawn.** `runtime.max_depth` governs a `solo` run as it governs every run, and under `solo` it
   MUST be enforced by withholding: an agent that stands at the depth limit holds neither `delegate` nor the workflow
   tool of clause 5. At 1 only the entry role spawns; at 2 its children may; at 3 theirs may. The settings screen MUST
   present the value as a slider whose every step states, on hover and on focus, what that step permits.
5. **Workflows.** An agent of a `solo` run that may spawn (clause 4) MUST hold a workflow tool that takes a script the
   agent wrote. The script MUST be able to start agents, run them side by side and in stages, name its phases, and call
   every tool its launching agent holds. The script itself MUST have no access to the file system, the network, a
   process, the clock or a source of randomness other than through those calls.
6. **A script acts as its agent.** Every tool call a script makes MUST pass the permission mode, the sandbox, the write
   fence, the hooks and the approval prompts of the agent that launched it, exactly as that agent's own call would, and
   an approval MUST hold the script until it is answered. Every agent a script starts is a delegated child of the
   launching agent and counts against the run's child limits.
7. **A workflow runs in the background.** The tool MUST return at once with the workflow's identifier. The launching
   agent MUST be able to read a workflow's progress, wait for it and stop it, and MUST be told when it ends.
8. **A workflow survives a restart.** Each result a script received MUST be recorded as it arrives. A workflow cut off by
   the application ending MUST be resumable: the same script, started again, receives the recorded results in order
   without repeating the work that produced them, and continues from the first call that has none.
9. **A workflow is one row.** The transcript MUST show a workflow as one row naming it, its current phase and how many
   of its agents have ended, with a control that stops it; the row opens to the agents it started and to its script.

**Why, and what it costs.** The owner wants the shape of a coding assistant that works alone and reaches for help by its
own judgement, beside the coordinator that never touches a file and the worker that never delegates. A script is asked
for rather than a declared plan because a script can branch on what its agents report. The cost is a script runtime inside
the run host, a second way to start children that every limit must still reach, and a run with no classified intent:
route-aware guards, playbook cells and the budget clamp have nothing to read, so a `solo` run's children are bounded by the
configured limits and their personas alone. A weak model may write scripts that fail; the tool's errors are the only help
it gets.

This directive names [`PD-ORCH-006`](pd-orch-006.md#pd-orch-006), which narrows REQ-ORCH-025 and REQ-ORCH-029 for a run
whose mapping grants direct work under `orchestrator` or `swarm`, and [`PD-ORCH-005`](pd-orch-005.md#pd-orch-005), which
narrows REQ-ORCH-005 for a continued run's carried intent. Neither case is a `solo` run, so the cases stay apart.

> **Narrows:** REQ-ORCH-025, REQ-ORCH-029, REQ-ORCH-016, REQ-ORCH-005, REQ-ORCH-014
> **Extends:** REQ-ORCH-024

*Raised by the owner, 2026-11-24; logged as [R-126](../requests.md#r-126).*

**Decided with it, 2026-11-24.** The script runtime is a QuickJS isolate compiled to WebAssembly inside the run host, the
owner's choice over a `node:vm` context (not a security boundary) and a separate Node process (a sixth kind of process).
Its decision record is written with the spike that is the first act of building clause 5.

**First execution of clauses 1, 2 and 4, 2026-11-24.** `Sessions` hands a `solo` run no pre-flight; `entryInstructionsFor`
gives the entry role the solo statement; the run host's port grants the direct-work bundle with `delegate` and withholds
`delegate` from an agent at `runtime.max_depth`. Against the owner's self-hosted `ds41` (`pnpm live-run --only=solo`) the run
completed in 46 s with no classification, 30 tools offered, four writing or command calls by the entry role and no
delegation. Clause 4 is held by a unit test only; clause 3 follows from the run having no pre-flight and was not driven. The
choice where a run is started is not built: the strategy is chosen in Settings. Clause 4's slider and clauses 5 to 9 are not
built. The row is in [the register](../../architecture/first-executions/39-the-register-38.md).
