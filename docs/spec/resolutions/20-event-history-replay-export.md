---
reference: ROTARIS-CRW-001
domain: event-history-replay-export
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 2** — its SR-2 correction re-justified lock-free reading and stands in that part. Superseded in
>   part: it says a process that does not hold the lock "degrades under REQ-EVENTS-084 (a logged warning,
>   the run continues)". Under **ESC-16** REQ-EVENTS-084 is a **refusal** — the session does not start —
>   and REQ-EVENTS-098 routes the non-holder case to REQ-SESSION-083 instead.
> - **OQ 4** — the sticky-failure half stands (with a different stated reason) and the trim-ran-out-of-space
>   half is unchanged. Its second half is moot: "a partial trailing line may therefore exist" describes a
>   state this product's own store can no longer produce, because an event is recorded whole or not at all
>   and a failed recording step leaves no partial record (REQ-EVENTS-029, REQ-EVENTS-088).
> - **OQ 7** — already marked superseded by SR-2, and further affected: it names REQ-EVENTS-093 among the
>   requirements that stand. **REQ-EVENTS-093 is withdrawn.** Its one behavioural guarantee — a session with
>   no store at all reports no truncation rather than failing — was moved into REQ-EVENTS-092 first. The
>   preserved historical analysis about front-truncating trims is untouched and still worth having.
> - **OQ 5** — "stored bytes are ASCII-escaped UTF-8 with a single line-feed terminator, so a history is
>   byte-stable regardless of any host's display encoding" now describes the **export** rather than stored
>   bytes (REQ-EVENTS-090). The conclusion survives; the subject changed.
> - **The graphical-only sweep, REQ-EVENTS-033 row** — "the durable history has one fixed destination
>   (REQ-EVENTS-079)". REQ-EVENTS-079 is withdrawn; the requirement text has been re-pointed at
>   REQ-EVENTS-084 but this table has not.
> - **OQ 26**'s closing sentence — "the diagnostics timeline is not a new file: it is
>   `<session_dir>/timeline.jsonl` and `<session_dir>/issues.json`" — names files that are now records. The
>   enumeration of the seven persist-before-publish pairs is unchanged and correct.
> - **OQ 23** and the 110-character clip are unaffected.
>
> ## Also superseded, by the rulings applied 2026-09-01
>
> - **OQ 3's disposition stands; its illustrative list does not.** "No exclusion — the guarantee spans
>   every run that goes through the shared run lifecycle" is the outcome and is unchanged and correct.
>   The list it gives to illustrate that outcome ends with "one driven by a programmatic embedding of
>   the engine", which is a run path this product does not have: REQ-EVENTS-178 states that the product
>   is one desktop application offering no embedding surface. REQ-EVENTS-081's enumeration now follows
>   REQ-SESSION-080's closed set of ways a run can be started, so it cites an owner instead of being a
>   second list that can go stale the same way. The guarantee is explicitly **not** narrowed by the
>   shorter list — it spans every run through the shared lifecycle whether or not this document happens
>   to name the way that run was started, and a way of starting a run added later is inside it from the
>   moment it exists. That matters more here than elsewhere: REQ-EVENTS-001, REQ-EVENTS-002 and
>   REQ-EVENTS-014 were all withdrawn **into** REQ-EVENTS-081, which is the sole surviving home of
>   their equality guarantee.
> - **The OQ 1 note at line 151 records superseded reasoning with an unchanged outcome.** Per-event
>   append and flush in REQ-EVENTS-029 was justified there by letting a follower tailing the file see
>   each event as it happens. There is no follower (SR-2); the justification in the requirement is now
>   the two-observables argument, and per-event durability at raise is unchanged.
> - **REQ-EVENTS-029's comparative conclusion is withdrawn as a sub-clause.** It said the debounced
>   state snapshot "may lag by its whole window (REQ-SESSION-071)" and that "the history is therefore
>   the more complete of the two records". The debounce is withdrawn (REQ-SESSION-067), so the premise
>   is gone and the conclusion is false. The requirement now states the negation explicitly, so no
>   future reader can re-derive it, and states the true consequence: the two records agree at the point
>   the session was abandoned, and such a session is restored from its persisted record alone and never
>   completed from the history, which is what REQ-SESSION-196 relies on. The crash-completeness property
>   itself — that a session abandoned by a crash or force-quit holds its history complete to the last
>   event raised — survives verbatim; only the comparison went.
> - **REQ-EVENTS-163 is narrowed under ESC-20.** Its "their exports (REQ-EVENTS-166) are equally
>   distinct" read as granting an export to the tool-call evidence record, which REQ-TOOLS-190 now
>   forbids outright and forever. The requirement now states which of the records it names have an
>   export — the event history, the permission audit and the verification-gate record — and that the
>   tool-call evidence record has none and must never gain one. The distinctness contract itself, which
>   is what the requirement exists for, is unchanged.
> - **The REQ-EVENTS-033 sweep-row defect noted above is closed in the requirement and still open in
>   the table.** The requirement text points at REQ-EVENTS-084; the row at line 113 still cites the
>   withdrawn REQ-EVENTS-079. Recorded here rather than silently rewritten, because the row is a record
>   of what was decided and when.

> ## Amendment, 2026-09-02 — REQ-EVENTS-098's read-side clause split into three
>
> **Row 2's disposition is unchanged and nothing it decided is reversed.** Single-writer, the right to
> write being the right to hold the session lock, and lock-free unrestricted reading all stand exactly as
> that row settled them.
>
> **What changed is the sentence the row did not write.** REQ-EVENTS-098 closed with "a reader MUST NOT be
> able to delay or block the writer, and the writer MUST NOT be able to make a reader fail; a store in
> which one blocks the other does not satisfy this requirement". Read literally, that is unsatisfiable by
> any store: a fully compliant reader that never blocks the writer still measurably raises the writer's
> latency, and no store can offer concurrent access at no scheduling cost — so a conformance suite written
> from those words rejects every implementation, a correct one included. The requirement now states three
> properties instead of one, and says which are absolute: **(a)** neither side may prevent, indefinitely
> stall or fail the other, which is the blocking prohibition and is absolute; **(b)** what the writer
> durably recorded must become observable to a reader that reads again, which is absolute and is what
> catches a store that loses a writer's records while both sides report success; **(c)** either side may
> cost the other measurable time, which is expressly *not* a violation and must not be tested as one.
>
> **The behavioural guarantee is undiminished.** Everything the old sentence forbade, (a) and (b) still
> forbid. What is withdrawn is only the reading under which a measurable cost counts as a delay.


This record disposes of every open question raised in the draft of
[`../20-event-history-replay-export.md`](../20-event-history-replay-export.md) (requirement prefix
`REQ-EVENTS`). The body of that specification has been amended so that each decision below is stated
normatively in place; the original open-question numbering is preserved here so the draft and the
resolved specification can be read against each other.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, and awkward behavior is never preserved for compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application.** It has no command-line interface, no
   headless entry point, and no full-screen text-mode interface, and domains 17 and 18 are retired.
   This domain was drafted almost entirely around a shell surface — an output-format flag, an
   `events` command group, stdout as the event channel, stderr as the human channel, and a table of
   process exit codes — so the sweep below is the larger half of this record. Every capability those
   requirements carried is now reachable from the desktop interface.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking for the exact phrasing of a human-readable message are resolved by fixing what
   the message must convey and leaving the wording to the implementation.

Cross-domain coherence was checked against `01-run-orchestration.md` (terminal run statuses and stop
reasons REQ-ORCH-083, check statuses REQ-ORCH-123, gate decisions REQ-ORCH-116),
`05-tools-permissions-approvals.md` (approval resolver vocabulary REQ-TOOLS-061, permission audit
entry REQ-TOOLS-078 and REQ-TOOLS-079, verification-gate log REQ-TOOLS-190),
`06-git-worktrees-checkpoints.md` (checkpoint timeline entries REQ-GIT-048, REQ-GIT-062),
`07-sessions-persistence.md` (execution-status vocabulary REQ-SESSION-073, stop-reason mapping
REQ-SESSION-077, timeline and issue record shapes REQ-SESSION-134 and REQ-SESSION-135, history
attachment REQ-SESSION-089 and REQ-SESSION-174, and — at the time this record was written — follower
row numbering REQ-SESSION-160, which is now withdrawn under SR-2 with the transcript-index rules it
carried held by REQ-EVENTS-052 and REQ-SESSION-192),
`09-lifecycle-hooks.md` (hook events REQ-HOOKS-001, scopes REQ-HOOKS-020, trust gate REQ-HOOKS-090,
withheld-hook event REQ-HOOKS-126, lifecycle payload REQ-HOOKS-075),
`12-desktop-shell-windows.md` (action vocabulary REQ-SHELL-048, session browser REQ-SHELL-126,
colour-independence REQ-SHELL-149), `02-run-monitoring-steering.md` (tool-row statuses
REQ-MONITOR-105) and `19-notifications-errors-recovery.md` (notice recording REQ-NOTIFY-268). No
other source was consulted.

New requirements added by these resolutions: **REQ-EVENTS-168** through **REQ-EVENTS-177**. No
requirement identifier was renumbered, reused, or deleted.

## Parts

Since 2026-10-26 the rest of this document is in [`20-event-history-replay-export/`](20-event-history-replay-export/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](20-event-history-replay-export/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](20-event-history-replay-export/02-dispositions.md) | Dispositions |
| [03](20-event-history-replay-export/03-entries-other-domains-expected-this-one-to-carry.md) | Entries other domains expected this one to carry |
| [04](20-event-history-replay-export/04-escalations.md) | Escalations |
| [05](20-event-history-replay-export/05-accepted-amendment-2026-09-06-a6-latest-run.md) | Accepted amendment, 2026-09-06 — A6: latest-run outcome |
| [06](20-event-history-replay-export/06-accepted-amendment-2026-09-06-a9-export.md) | Accepted amendment, 2026-09-06 — A9: export replacement retries |
| [07](20-event-history-replay-export/07-accepted-amendment-2026-09-06-oq-8-the-usage.md) | Accepted amendment, 2026-09-06 — OQ-8: the usage event's emission trigger |
| [08](20-event-history-replay-export/08-amendment-2026-09-14-the-hook-skip-reason.md) | Amendment, 2026-09-14 — the hook skip-reason vocabulary is two values |
