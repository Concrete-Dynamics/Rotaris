# ADR-0010 — Three channels between the run host and its surfaces — Fourth execution — 2026-09-07, structured questions on all three channels (Part AC)

Part 10 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Fourth execution — 2026-09-07, structured questions on all three channels (Part AC)

*Recorded under GD-10. Two operations that had answered `false` since the skeleton now have a mechanism; one defect
found in the channel's own argument space, one in a record beside it, and one in a place no reading had looked.*

**Built and run:** `ask_questions` and the question stepper end to end (REQ-CHAT-092..103, REQ-TOOLS-157/158) —
the wait registry beside `PendingApprovals` (`agent-tools/src/tools/questions.ts`), the executor and its validation,
`answerQuestion` and `cancelQuestions` in `Sessions.control`, `SessionRecord.pendingQuestions` widened to carry the
steps, the trailer row reading the widened shape, and `packages/ui/src/QuestionStepper.tsx`. Five built-app
scenarios (`pnpm questions-proof`) and twenty engine, tool and wording tests.

**All three channels carry it, and each does exactly one thing.** Channel 2 publishes the pending state: the tool's
`publish()` is `writer.save(currentStatus)`, whose commit hands the projection owner a `save`, which republishes the
whole-session update reading `pendingQuestions` from the live registry. Channel 1 carries the decision back.
Channel 3 is untouched. The measurement: **452 ms from the tool call opening to the trailer on screen**, on a probe
sweep sampling every 250 ms, with **zero reconciles** in the window — REQ-CHAT-097's "published to the surface and
MUST NOT be discovered by re-reading persisted state on a timer" (REQ-SESSION-071) is met by the publication alone,
and the number is inside REQ-MONITOR-222's 250 ms budget once the sampling period is subtracted.

**The pending state is on the record, not in a column** — the third execution's ruling for `wait`, applied again.
`pendingQuestions` is derived from the live run at every snapshot, so no store migration was written and a process
that died holds none. **This leaves REQ-SESSION-025's persistence limb owed** and it is recorded as owed rather
than reported met: that requirement asks for `pending_questions` to survive a reload, and this build's does not.
The reason is not economy — a wait restored from disk has no waiting call behind it, which is precisely the false
success REQ-CHAT-102 forbids — but the requirement still says what it says, and the reconciliation is owed to the
part that takes REQ-SESSION-025.

> **Reconciled and built, 2026-10-13 (fin41); the paragraph above is kept as what this execution decided.** The
> reconciliation it owed was made by `PD-ORCH-005` revision 3, which governs REQ-SESSION-025's question half (the
> specification's back-pointer, `docs/spec/07-sessions-persistence.md`): a question is **withdrawn** at rest — a pause,
> a stop, a quit or a crash — and is never restored, so "survive a reload" is moot, and the reason given above (a wait
> restored from disk has no waiting call behind it) is the directive's own. The ruling for the record stands: the live
> list is derived from the live run, and a stored record lists none. **What the limb still owed was durability for two
> readers, and that is now a column**, so the ruling above ("not in a column … no store migration was written") is
> **narrowed**: `sessions.pending_questions` (v35, appended) mirrors the session's whole list each time a prompt is put
> or ends (`mirrorQuestions` in `apps/desktop/src/run-host/tools.ts`, from `Run.pendingQuestions` through the port's
> `pendingQuestionsOfSession`). Its first reader is a crash's record, which can only withdraw what the store holds:
> `withdrawStoredQuestions` (`packages/engine/src/run/crash.ts`) writes one `question_withdrawn` entry per prompt, in the
> words and fields the gate writes for a live withdrawal, and empties the column — before it, a crash with a question
> waiting recorded no withdrawal (`docs/defects/fixed/a-crash-with-a-question-pending-records-no-withdrawal.md`). Its
> second is the listing: REQ-SESSION-031's `awaiting_input` is pending approvals **or** pending questions, and the listing
> read approvals alone (`docs/defects/fixed/the-session-browser-shows-no-awaiting-input-for-a-run-waiting-on-a-question.md`).
> Channel 2 is unchanged: the publication still republishes the derived list, and the column is never read back as
> pending. Pinned by `crash.test.ts` ("clause 9 after a crash"), `sessions.test.ts` (REQ-SESSION-031), the run host's
> `tools.test.ts` (the mirror as the session's list, emptied on the answer) and `store.test.ts` (v34 → v35); each of the
> first three red before. Not driven in the built app or live (no proof kills a run host with a question open).

**Found — the control channel's argument space cannot carry the answers map (the thirty-eighth).** REQ-CHAT-095
fixes the payload as `{step_id: {selected_option, freeform_text}}`, a record of RECORDS, and
`ControlRequestSchema`'s value space is a scalar, an array of scalars, or a record of scalars —
REQ-MONITOR-013's "text, numbers, booleans, and simple collections of those", which this record encodes literally.
The operation REQ-MONITOR-004 names ("answer a pending question set") therefore had no expressible argument, and
nothing had noticed because the operation had never been implemented. The value space is **not widened**: the
payload crosses as two flat maps keyed by step id, `selected` and `freeform`, each a record of scalars the schema
already admits, recombined in `Sessions.control`. REQ-CHAT-101's "Submit delivers every step's answer in one
payload" holds — it is one request carrying every step. A widening was rejected because the constraint is
REQ-MONITOR-013's own and exists to keep a request meaningful across the boundary.

**Found — the approval dialog's failed-delivery sentence was the wrong one (the thirty-ninth).** The falsified
wording, kept beside its replacement in `ApprovalDialog.tsx`: "The answer could not be delivered: no run is waiting
for this request any more." REQ-TOOLS-063, which that dialog was built to, asks only for "a status line saying the
answer could not be delivered" and leaves the wording open, so nothing in that requirement could catch it. But
REQ-CHAT-103 — which pairs the approval trailer with the question stepper and is where the shared machinery is
described — **fixes the sentence in quotation marks**: "Could not deliver the decision. The waiting agent is no
longer available." Two requirements describe one dialog and only one of them quotes it; the dialog was built from
the other. Both sentences are now constants, asserted against their requirements' text, and differ by the one word
each requirement uses ("answers" against "the decision").

**REQ-CHAT-103's shared machinery, and where the two genuinely differ.** One `trailerRows` computes both trailers,
one `openTrailer` opens both, one `TrailerRow` type describes both. The differences are the requirement's own and
are now visible side by side: the first approval **auto-opens** its window while a question waits for a click; an
approval's modal is a separate `BrowserWindow` (ADR-0019, ADR-0048) so "re-openable while pending" is a raise, which
is the new `approval.raise` command's whole job; and each carries its own sentence. **ADR-0019 has no note here** —
it covers approvals only and says nothing about structured questions, so the approval path was this part's
precedent and not its record.

**Not exercised:** a delegated child asking the user (see ADR-0016's note); the terminal-stream operations
(ADR-0021); compression and the verification skip, which still answer `false`.
