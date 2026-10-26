# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — First execution — 2026-09-03, the rings under the first gate

Part 7 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## First execution — 2026-09-03, the rings under the first gate

*Recorded under GD-10.*

**Built and run:** store v4 (`packages/store/src/schema.ts`) — `permission_audit`, `tool_calls`, `issues`,
`ring_state`; ONE ring implementation (`dal.ringInsert`) that assigns the next ordinal, runs the insert,
displaces the oldest when the cap is exceeded and moves the `held` and `dropped` counts, all inside the
caller's transaction; `REQ-SESSION-133`'s caps as one policy table; the serialised entry stored verbatim with
the query columns beside it; **UPDATE refused by a trigger on the audit and the issues record**; the
decision entry's `id` is its ordinal, carried inside the entry (`REQ-TOOLS-079`), and the field inventory is
validated on the write path (a field outside it is a fault — mechanism 1). Mode-change entries interleave in
the same ordinal series (verified: a mid-run change at ordinal 1 ahead of the decision at ordinal 2). The
timeline stays uncapped. No index was declared: every ring read is a primary-key range and the settle names
its ordinal, which the plan-assertion test in `store.test.ts` checks.

**One reading, recorded because this record's "no update path" and `REQ-EVENTS-072` cannot both be met by
an insert alone.** `REQ-EVENTS-072` pairs `tool.start` AND `tool.finish` against the tool-call record and
requires that a run killed between the two "leave a record with no event, never an event with no record".
A record inserted at finish would leave `tool.start` with no record. So **the tool-call record is written at
`tool.start` with status `running` and settled EXACTLY ONCE at `tool.finish`**, and the store enforces the
"once": a trigger refuses any update of a row whose status is not `running`, any update that sets it back to
`running`, and any change to the identity columns. The audit's "never altered" stays absolute. A call the
host died inside reads back as `running`, ~~which is `REQ-CHAT-049`'s dead-session case and needs no repair~~ **until the
next repair or continue records the crash, which settles it `failed` (corrected 2026-09-30; see "The crash record
settles the ring" below).** *The falsified reason, kept:* `REQ-CHAT-049` covers how a dead session's running row is
drawn, and it stood alone while nothing recorded a crash. Since `PD-ORCH-005` clause 3 the crash record settles the same
call's transcript row `failed` (`REQ-SESSION-129`), so a ring row left `running` holds that call settled in one record and
under way in the other, for good — a disagreement `REQ-CHAT-049`'s drawing rule does not reach.

**Found: nothing in the ring.** The export of `REQ-SESSION-199` is not built and no exporter object exists
for any kind (mechanism 2 holds by absence); the DAL has no statement that reads `tool_calls` for anything
but the diagnostics reader this build does not have yet. Consequence 3's "absent, not failing" writer for a
call outside every session is not reachable in this build: every call belongs to a run.

**Second execution, 2026-09-03, with the hooks (ADR-0015).** A `pre_tool` stop settles the tool-call record
`blocked` with `failure_kind: 'hook_blocked'` and the refusal as its result — one refused invocation, the
policy's `allow` still in the audit ahead of it (REQ-HOOKS-004: the policy decided first, the hook refused
after). Reading recorded: the record's `result` is **what the agent was given** (REQ-SESSION-136's "what
was returned"), so `post_tool` feedback appended to an observation is in the record; feedback delivered as a
following user message for an errored call is not, because the agent did not receive it as that call's result.
