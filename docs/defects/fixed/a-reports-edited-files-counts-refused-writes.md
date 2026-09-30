## A report's edited files counts write calls that were refused

`editedFilesFrom` (`packages/engine/src/children/report.ts`) lists the path of every `write_file`, `haet_edit` or `haet`
CALL in the child's transcript, and never reads the result that answered it. A write refused by a sibling's
write-scope claim (`PD-TOOLS-006`), by the permission gate, or a `haet_edit` whose find text matched nothing, still puts
its path in the report's `edited_files` and in the fallback report's "Files touched". Since OQ-111's repair the same list is handed to the summarising pass as the facts, with the
instruction that the summary "must agree with them and never deny them", so a refused write can be pressed into the
summary as work done: the inverse of the denial D1 recorded.

Noticed 2026-09-29 by the verification of the D1 repair (branch `fix-child-report`); recorded, not repaired.

## Specs

- The specification's child-report schema (`docs/spec/01-run-orchestration.md`, "edited files (path, change type,
  commit hash)"): a file the child tried and failed to write was not edited.
- `REQ-ORCH-108` (parents consume the report in place of the transcript) and `REQ-ORCH-109` (the report's facts are
  runner-owned): a parent reading the report is told of an edit that did not happen.
- `OQ-111`'s ruling, "a report never denies work the record shows": the record shows the refusal too.

## Relevant files

- `packages/engine/src/children/report.ts` — `editedFilesFrom`, which reads calls and not results; `reportFacts`, which
  hands its list to the pass; `fallbackReport`, which lists it as "Files touched".
- `packages/engine/src/children/write-scope.ts` — `WriteClaims.refusalFor`, one source of a refused write.

## Outcome

**Repaired 2026-09-30 under [R-067](../../product/requests.md#r-067)** (acceptance round 1, finding A26).

Confirmed on the branch first: four cases in `packages/engine/src/children/report.test.ts` (the describe "a write the
record answers with an error is not an edit") were red on the code as it stood — a write refused by a sibling's claim,
a `haet_edit` whose find text matched nothing and a `haet` the permission gate refused each reached `editedFilesFrom`,
`reportFacts`, the fallback's "Files touched", the deterministic tester report and the shaped report.

`editedFilesFrom` now reads the result that answered each write call: a call answered as refused is not an edit.
Every refusal named above is answered with `isError: true` (the gate's `finish`, the file tools' `errorObservation`).
A call cut off is answered with `isError: true` too, and it is read by what the record says of it: a call cut before it
started, or whose approval was withdrawn, never ran and is not an edit; a call that was under way when the pause's tool
deadline, the stop's abort or a crash cut it off — the `ran` statement of `interruptedResult`, which
`run/interruption.ts`'s `ranBeforeItWasCut` reads — may have landed, and IS listed. A path refused once and written
later is listed at the write that landed.

*Falsified by the repair's verification and kept beside its correction:* this outcome first read every `isError: true`
as "not an edit", "and so is a call a rest or a cancel cut off, which the child itself was told had not completed". The
turn answers a call whose dispatch returned `ok` after the pause's 30 s tool deadline (a post-tool hook holding it, say)
with that same error, the record keeping "What it had produced before it was cut off: Overwrote …", so the first repair
dropped a write that had landed from the report — the concealment REQ-ORCH-109 forbids. Pinned by the describe "a write
that was under way when a rest, a stop or a crash cut it off is still an edit" in `report.test.ts` (red on the first
repair) and by the case "a write that landed after the pause's tool deadline cut it off is still in the resumed child's
report" in `children/children.test.ts`, which pauses a child whose `write_file` returns `ok` past the deadline, continues
it, and reads `edited_files` from the stored report (red on the first repair, green on origin/main's reading and on
this one). The summariser's own list, still unioned after the derived paths, cannot bring
back a path whose every write was answered with an error. All five readers share the one function, so the report's
`edited_files`, the fallback's "Files touched" and the facts the pass is told never to deny agree.

The bounds, stated: a write call no result answers keeps the call's own reading and is listed. The turn answers every
call of a step (`run/turn.ts`), so a conversation it built holds none. A call cut off while under way whose executor
had in fact refused it is listed, since the record cannot tell the two apart and REQ-ORCH-109 forbids concealing a file
rather than overstating one. A write executor that raised after its file was written (a failure rendering the diff,
say) is answered as an ordinary error and is not listed.

Shown against the record, not driven: in the two live-run packs of 2026-09-29 (`2026-09-29T02-41-56-779Z`,
`2026-09-29T03-06-14-929Z`) every refused write (four of them: a stale hash twice, a `write_file` missing its operation
twice) was followed by a write to the same path that landed, so neither pack's reports list a path only a refusal
touched. No proof or live-run scenario steers a child into a refusal it does not repair, so none was run for this note.
`docs/architecture/adr/0012-the-delegated-child-scheduler.md` is corrected in place, its first claim kept, and the
runtime view's §4 report sentence says so.
