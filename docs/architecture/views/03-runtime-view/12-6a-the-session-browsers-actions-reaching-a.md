# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 6a. The session browser's actions reaching a record no run holds (Part U)

Part 12 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 6a. The session browser's actions reaching a record no run holds (Part U)

Three actions of REQ-SESSION-182 reach a session's record from OUTSIDE a run, all in the run host, none a control operation
of §5 and none a channel: each is a request answered once.

- **Repair** (REQ-SESSION-060): `Sessions.repairOne` — liveness through the one predicate (`liveness()`, which the listing
  now consumes too; REQ-SESSION-171) → the state read (unreadable = nothing to do) → an active status required → the
  writer's `save('interrupted')` at the stronger durability setting → the `session.interrupted_recovered` timeline entry (REQ-SESSION-062 exactly: `warning`, actor `rotaris`, `{previous_execution_status, execution_status, reason}`) →
  the crash record (PD-ORCH-005 clause 3, `run/crash.ts`; §2) →
  the lock released last (ADR-0005's note: the entry is written under the lock) → `summary.md` rebuilt off the path
  (`SummaryWriter`, awaited at shutdown). **OQ-60 as ruled (R-071, 2026-10-06):** REQ-ORCH-082's columns are left as they
  are, and while the session is `interrupted` its readers present the latest correction entry in their place
  (`sessionOutcomeOf`, `recoveryEntryOf` in `run/summary.ts`): the record's `summary`, which the agents view's activity line
  reads, and `summary.md`'s Outcome block. **`summary.md` itself (REQ-SESSION-140; fin22, 2026-10-06)** is rendered from
  `summaryFactsOf`, one read transaction over the row, the correction entry, the first submitted prompt
  (`StoreDal.firstPromptRow`), the tool-call record and the permission audit read without their serialised entries
  (`toolCallDigestOf`, `auditDigestOf`), the issues, the iterations, plan roots and children; its counts are the metrics
  document's (`sessionMetrics` in `export.ts`). Its Warnings line for mostly-elided artifacts is `PD-SESSION-002`'s (OQ-207,
  ruled 2026-10-07; fin28): the distinct agent-and-artifact pairs the timeline's `context_selection` entries name as
  `attached_elided` — attachments a delegated agent's `PRIOR AGENT CONTEXT (FULL)` block left out for its budget — read in
  the same transaction (`StoreDal.elidedAttachmentRowsOf`, `elidedAttachmentsOf`), a plain count, `0` when none, where it read
  `n/a` before; its Tool errors line counts the issues record's `tool_error` entries
  (REQ-SESSION-136's "any other failure"), as its Issues line does, never the histogram's `tool_error` bucket, which a
  record carrying an `outcome_kind` never reaches (fin23). An MCP call's record and a fetch call's carry no `outcome_kind`
  since OQ-208's ruling (2026-10-07, R-072; fin28), so the histogram derives their bucket, `success` or `tool_error`, from
  `status` and `is_error`, and keeps no `mcp` or `fetch` bucket; a record with no `outcome_kind` whose failure kind is
  `interrupted` (a call its run cancelled, a released delegation wait) derives to `interrupted` since PD-TOOLS-013
  revision 2 (`outcomeOf`, `engine/src/export.ts`; OQ-238), where it derived to `tool_error`. A count over the
  permission audit or the issues record — Permission denials, Tool errors, and the Metrics lines printing the same figures —
  reads `at least N` with how many rows the cap dropped once REQ-SESSION-133's cap has dropped rows of its ring (`atLeast`;
  finacc3 F10). Terminal failures, suspicious successes and Timeouts, each the larger of a count over the tool-call record
  and one over the issues record, read `at least N` naming what both rings dropped once both have dropped rows, and plain
  while either is whole, since either reading is then the whole count (finacc3 A2-09, fin30). Its Agents lines read each agent's own count — an iteration's root
  `iterations.root_tool_calls`, a plan cycle's root `plan_roots.tool_calls` (v33), a child `children.tool_calls` — and
  read the tool-call record only where no count is kept (a plan cycle's root recorded before v33, an agent known only by
  its records), and then only while the ring has dropped nothing: `n/a` once it has. Every rebuild — a run's saves, a continuation's, the repair's — reads it so;
  each read sits inside `SummaryWriter`'s guard (a throw is a warning, the chain never rejects), and a rebuild a newer one is
  queued behind is skipped. `repair(all)` walks the listing rows of
  the workspace; `checkpointListing`'s REQ-GIT-094 repair is the same unit. A loaded, idle session repairs through its
  own live writer and its projection republishes — under the lock `withWriter` claims for it (below).
- **Delete** (REQ-SESSION-166, REQ-GIT-069) in this order: (1) `prepareDelete` loads the row, refuses a live or
  unknowable session with its sentence, finds the tree (the binding's worktree, else the workspace root), notes an
  unreadable state; (2) the refs, best-effort — `checkpoint.deleteNamespace` through main to the service, skipped with a
  warning when the tree is gone; (3) `completeDelete` — a loaded idle session evicted from the registry, then ONE durable
  transaction `DELETE FROM sessions` cascading to every table whose `session_id` references `sessions` `ON DELETE
  CASCADE` — nineteen since v24, `plan_cycles` (v20) and PD-ORCH-005's agent record (`iterations`, `agent_messages`,
  `agent_terminals` in v23, `agent_fingerprints` in v24; its clause 12) among them; `delivery_runs` names the session as a
  fact and keeps its row (REQ-TRACE-476) — then `sessions/<sid>/` removed, errors ignored. This line said "the fifteen
  dependent tables" until 2026-09-29, a count the migrations since had outgrown; `sessions-proof` checks the shape from
  the schema, never a count (`apps/desktop/scripts/lib/session-cascade.mjs`); (4) the browser reads the list again; a
  followed session that was deleted is unfollowed and its persona windows destroyed.
- **Export** (REQ-SESSION-199, REQ-SESSION-189): `readRecords` / `readTrajectory` run in a deferred READ transaction
  (`StoreDal.readTransaction`) so a ring's entries and its header figures come from one state; nothing is written to the
  record, no run pauses, a live session exports what it holds at that instant; the file is written afterwards, outside
  the transaction, through `replaceDocument` with REQ-TRACE-061's ladder.
