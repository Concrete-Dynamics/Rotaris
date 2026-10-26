# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — First execution of the inherited-context path — 2026-09-28: a field the ledger stored and nothing read

Part 9 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## First execution of the inherited-context path — 2026-09-28: a field the ledger stored and nothing read

`REQ-TOOLS-152`'s `inherited_context` — "ids of already-completed sibling tasks whose reports are carried into the
child without imposing any ordering" — had been accepted by the tool, written to `children.inherited_context` by
this ledger, and resolved by nothing since the ledger was first executed on 2026-09-03. `childPayload` had no place
for `REQ-TOOLS-154`'s item (5); an id naming no task was accepted where the requirement refuses the call. It was
found by reading, while the payload order was being repaired (R-054), and is recorded as
`docs/defects/fixed/the-inherited-context-reports-never-reach-the-child.md`.

**Where the rule was put, and why here.** The refusal is admission's, so it lives in `spawn` after `REQ-ORCH-046`'s
dependency checks and before its cycle check (5), beside the empty-entry refusal that had stood alone: an unknown id
creates no record and issues no id, as every refusal of this ledger does. Existence is asked first, of the session's
child records and of the root execution record, which carries an id in the same namespace (`REQ-ORCH-072`: "a lookup
naming the root resolves to it rather than reporting it unknown"); only an id no task has is refused as referring to
nothing. An id naming a task that exists and has not completed — the root, the caller's own task, or any task that
failed, was cancelled or is still under way, whoever owns it — is ignored, which is what `REQ-TOOLS-152` says of every
such task. The caller's own completed children are carried, since the requirement's own word is "sibling". A completed
task that is not the caller's child is refused, but for ownership, naming its parent as the `depends_on` refusal does
and never as nonexistent; that it is refused rather than carried or ignored is a reading, raised as **OQ-81** (OQ-76 on its branch, renumbered at the merge, OQ-76 to OQ-80 having been taken on `main`).
"Completed" is read as this record already reads it for a dependency: `succeeded` with the report stored, since the
report is the thing carried.

**The first reading, falsified by verification the same day.** The rule was first built as a lookup over the caller's
own children alone, every other id refused with `inherited_context id '<id>' refers to nothing: no task of yours has
that id`, on the argument that every delegation lookup here is parent-scoped (`REQ-TOOLS-155`). The independent
verifier showed three real, unfinished tasks refused that way — the root naming its own id, a depth-1 child naming the
root, and that child naming itself. That falsified the argument twice over: `REQ-TOOLS-152` ignores an id naming an
unfinished task without asking whose it is, and `REQ-ORCH-072` rules that an agent asking about a record it does not
own "is refused for that reason and never told the root does not exist". Parent scoping decides what may be *carried*;
it does not decide what *exists*. The
rendering reuses `reportBlock`, so a child inherits the same block its parent read on the resume, and the block is
rendered at the call — a terminal child's report does not change — and remembered per task id on the same in-memory
terms as the attachment list, so `execute` gained one argument and nothing else while `PD-ORCH-005` rewrites it.
*(Falsified 2026-09-30 — see "First execution of a resumed child's retry payload" below: the in-memory terms held only
while a child could not outlive the run that accepted it. `PD-ORCH-005` let it, and a resumed child's retry in a later
run lost both the block and the attachment list. Both are now stored with the child's record, store v28.)*

**What the first run showed.** Against the scripted model with the session artifact store in place, the `build`
child's payload read (1) the workspace root, (3) the sibling-artifact index the `survey` report had become, (5) the
survey's report block, (6) the task — the first time items (3) and (5) were both present in one payload, and they
stood in `REQ-TOOLS-154`'s order without further change. **Nothing in the mechanism was found wrong**; what the
execution corrected was the test written for it, which had assumed `childrenOf` returns rows in spawn order (it does
not, and no requirement says it should), and which had first been written without knowing the harness holds an
artifact store — the block it expected immediately after the workspace root stood after the index instead, which is
where the requirement puts it. **What it could not show:** the refusal under a real model, and an earlier iteration's
*root* execution record, which is held in memory by the run and not in the store, so an id naming one finds no task
and is refused as referring to nothing; an earlier iteration's children are in the store and are found.
