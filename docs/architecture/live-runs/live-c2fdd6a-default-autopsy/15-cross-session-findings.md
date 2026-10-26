# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Cross-session findings

Part 15 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Cross-session findings

### K1. Show one run's duration a second apart in the run header and the inspector's run-level row
- **Class**: bug (cosmetic)
- **Status**: new
- **Evidence**:
  - **Screenshots.** Each pair below is the header's frozen value against the inspector's run-level row, for one interval:

    | screenshot | header | inspector | interval |
    |---|---|---|---|
    | edit.png | "Completed 2:13" | "orchestrator done · 2m 14s" | 133.67 s, `run_started_at` 15:47:52.310 to `updated_at` 15:50:05.981 |
    | terminal.png | "3:33" | "3m 34s" | 213.79 s |
    | frictions.png | "0:20" | "21s" | 20.74 s |
    | resume.png | "1:08" | "1m 8s" (they agree) | 68.22 s |

  - **One interval, two roundings.** Both read `session.runStartedAt` to `session.updatedAt`:
    `packages/ui/src/agents.ts:114` for the run-level row, and `runTimingSeconds` at `packages/ui/src/composer.ts:489-499`
    for the header.
    - The header's `formatDuration` floors (`composer.ts:465`), as the session list does (Overview "2:13", "3:18").
    - `elapsedLabel` (`packages/ui/src/AgentTree.tsx`) uses `Math.round`.
  - **Spec.** REQ-CHAT-158 freezes the header at "that run's total wall-clock duration", and REQ-MONITOR-107 fixes the
    agent's figure at "the difference between its completion and spawn timestamps"; neither fixes the rounding.
- **Cost**: none to the run. A reader sees two figures for one duration, side by side, in 3 of the 4 multi-second runs
  captured.

### K2. Ask the coordinator for a todo list by instruction text alone, though REQ-ORCH-029 says the constraint holds whatever the text
- **Class**: friction (owner question)
- **Status**: new
- **Evidence**:
  - **What REQ-ORCH-029 requires.** "work spanning more than one step is accompanied by a todo list it keeps current", a
    constraint that "MUST hold no matter what playbook cell or instruction text is in force" and is "externally checkable
    from the run's own records". PD-ORCH-006 keeps this clause binding on a direct-work run.
  - **Three coordinators did multi-step work with no plan of their own:**
    - edit: 10 calls, `delegate` ×2, `wait_for_tasks`, verification reads;
    - resume: 3 calls, `delegate` ×2 and a wait;
    - frictions: 5 calls; the user named two steps.

    None made a `todo` call. Their `sessions.todo` holds only the planner plan (schema 1, no `agent` plan), while the
    requirements and terminal coordinators wrote one (schema 2 with `agent`). All three runs completed.
  - **The clause reaches the model only as text.** It appears in `ORCHESTRATOR_COORDINATING`
    (`packages/engine/src/children/personas.ts:118`) and `DIRECT_WORK_INSTRUCTION` (`:126`). The G5 repair enforces the
    clause's sibling (no success while an item is open) but not this one.
- **Owner question:** is the product-kept planner plan the "todo list" this clause means? If it is not, how is the clause
  held beyond instruction text? The G5 note reads REQ-ORCH-029's "todo item" as the coordinator's own plan.
- **Cost**: none measured this run. The record cannot show the constraint holding on 3 of the 6 multi-step runs.

### K3. Tell the coordinator that "the coordinator routed it to you"
- **Class**: friction (cosmetic)
- **Status**: new
- **Evidence**:
  - **The text.** Every orchestrator request in all 8 sessions renders "ROUTE: Your assignment is inside the standard flow:
    the coordinator routed it to you by need and the rest of the run expects the outcome named in the task.". That is the
    catalogue's `routed` variant (`packages/engine/src/playbooks/catalogue.ts:11`), given to the entry role, which is the
    coordinator. It appears in the direct-work prompt as well (frictions traffic #1).
  - **Spec.** REQ-ORCH-026 fixes no variant text ("No variant text is fixed by this document"), so the text is the
    product's own. REQ-ORCH-019 puts the playbook in every role's instructions.
- **Cost**: none measured. No reasoning row cites it. Terminal's "routed these to a specialist" (traffic #1) is the model's
  own wording.
