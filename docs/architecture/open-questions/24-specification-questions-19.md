# Open questions — Specification questions (19 of 27)

Part 24 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-110 – OQ-113.

**OQ-110 — Which retries come first when a model call fails: the dispatch layer's, or the ladder's?** *(REQ-CONFIG-086, whose `num_retries` "overrides the dispatch layer's default of **5**"; REQ-ORCH-091 (c), the suspended wait on a 429 without Retry-After, with its `model_wait` issue; REQ-ORCH-092, the transient budget (default 1), its delay min(2.0, n) and its `transient_llm_error` issue; REQ-SESSION-142, the session log. Raised 2026-09-29 from the first live run's finding L3 under [R-067](../../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-109 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

In the live run of 2026-09-29 (pack `2026-09-29T02-41-56-779Z`, scenario `faults-ladder`, session `474a2d22`) the
recording proxy answered one completion 429 and the next 500. Both were retried inside the model client by the SDK's own
backoff — the 429 at +2.0 s, the 500 at +4.0 s — because `packages/model/src/ai-sdk-client.ts:242` passes
`maxRetries: req.retries`, and the run's `modelRetries` is 5 (`packages/engine/src/run/run.ts:89`). The ladder
(`run/ladder.ts`) was never reached: the session has no issue row, its timeline holds only `run_start` and `run_end`,
and its session log says nothing of either failure. Read alone, REQ-ORCH-091 (c) has a 429 wait 60 s and record a
`model_wait` issue, and REQ-ORCH-092 has a 500 retried once after 1 s and recorded as `transient_llm_error`; REQ-CONFIG-086
has a dispatch layer that retries five times by default before either sees the failure. The 2026-09-22 row of
`first-executions.md` read the same traffic as the ladder recovering.

**Ruled 2026-09-29 — as the specification states the two layers, [R-067](../../product/requests.md#r-067).** The owner took the
recommendation. The dispatch layer's retries (REQ-CONFIG-086's `num_retries`, default 5) come first, and the ladder
(REQ-ORCH-091/092) takes over when they are exhausted; nothing is added to the ladder, and neither requirement is
amended. So that an absorbed retry is diagnosable, each retry the dispatch layer absorbs SHALL be written to the session
log (REQ-SESSION-142) with the status it met and the delay it waited. The 2026-09-22 row of `first-executions.md` is
corrected in place, its falsified reason kept beside the replacement, and the live run's ladder check is to say what it
can see: that the run survived the refusals, not that the ladder handled them. Nothing is built by the ruling; the
session-log line is owed to the note that records L3, and the check to the note that records H3.

**Built 2026-09-29 under R-067 — the session-log line.** The decorated fetch of `packages/model/src/ai-sdk-client.ts` is the
one place a dispatch-layer retry is seen: one call makes one request per attempt, so a request that follows a failed
attempt of the same call is a retry. The client calls `ModelRequest.onRetry` as the retry is sent, with the status the
attempt before it met (or none, and the failure beneath it, for a connection failure) and the delay waited, **measured on
the monotonic clock** (`AiSdkClientOptions.monotonic`) rather than recomputed from the SDK's backoff rule, which the next pin
may change. `DefaultAgentBackend` forwards it to `TurnSink.retried`, and the turn writes `dispatchRetryLine` through the
run's `warn` — so the line is in the session log at its default WARNING level, and in the application log beside it. The
level is this build's reading: the ruling names the session log and not a level, and at INFO the line would be absent from
every session log left at REQ-SESSION-142's default. Nothing is added to the ladder; no issue and no timeline entry is
written for an absorbed retry. Pinned by `ai-sdk-client.test.ts` (the two cases "OQ-110 …: each retry the dispatch layer
absorbs is reported …" and "… a connection failure …") and `run/turn.test.ts` ("OQ-110 …: a retry the dispatch layer
absorbed is written to the session log …"), each failing with the report withdrawn. Shown live the same day
(`pnpm live-run --only=faults` against `katalyst`, pack `2026-09-29T19-39-22-466Z`): `faults-ladder`'s session log reads
`met HTTP 429 and waited 2002 ms before retry 1 of 5` and `met HTTP 500 and waited 4003 ms before retry 2 of 5`, the
proxy's record showing the same two gaps; the row is in `first-executions.md`.

**Found by building it — the ladder did not take over when the dispatch layer was exhausted.** The ruling's second half
("the ladder takes over when they are exhausted") did not hold: the SDK reports an exhausted budget as a `RetryError`
wrapping every attempt, which has no status, so `fromError` classified it `unknown` and fatal — a 429 that outlasted the
five retries failed the step outright and REQ-ORCH-091 (c)'s wait never began; a 503 did the same instead of spending
REQ-ORCH-092's transient budget. `fromError` now classifies the last attempt's error. Recorded and repaired the same day,
[`../../defects/fixed/an-exhausted-dispatch-layer-hands-the-ladder-a-failure-it-cannot-classify.md`](../../defects/fixed/an-exhausted-dispatch-layer-hands-the-ladder-a-failure-it-cannot-classify.md);
pinned by `ai-sdk-client.test.ts` ("OQ-110 (REQ-ORCH-091/092): when the dispatch layer's retries are exhausted …").

**Built 2026-09-29 under R-067 — the live run's ladder check.** The ruling's last clause ("the live run's ladder check is to
say what it can see") is built in `apps/desktop/scripts/live-run.mjs`: for each refusal the `faults-ladder` launch
injected, the check requires the session log's dispatch-layer line naming that status or the ladder's own `model_wait` /
`transient_llm_error` issue, never the call count, and a NOTE names which layer it was. Shown live the same day (pack
`2026-09-29T21-11-24-678Z`, passed): both refusals answered by the dispatch layer (`HTTP 429 waited 2006 ms, retry 1 of 5`;
`HTTP 500 waited 4002 ms, retry 2 of 5`), the ladder not reached. Recorded in
[`../../defects/fixed/two-live-run-checks-cannot-see-what-they-claim.md`](../../defects/fixed/two-live-run-checks-cannot-see-what-they-claim.md).

**OQ-111 — Which part of a long child's transcript does the report summariser read?** *(REQ-ORCH-110, which caps the transcript the report-producing pass is given at 12,000 characters in total and 2,000 per event, and does not say which part is kept; REQ-ORCH-108, which has parents consume the report in place of the transcript; REQ-ORCH-109, whose runner-owned fields the summariser cannot write; `PD-LIBRARY-001`, the report's commands. Raised 2026-09-29 from the duress live run's finding D1 under [R-067](../../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-110 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`packages/engine/src/children/report.ts` builds the pass's transcript by joining the events and cutting the result to
12,000 characters from its head (`transcriptText`, line 79). In the duress live run of 2026-09-29 (pack
`2026-09-29T03-06-14-929Z`, session `379f1490`) the request that summarised child `d` was 12,388 characters and ended
`… [63288 characters omitted]` before `d`'s first edit. Five of the seven stored reports contradict their own
deterministic `edited_files`: `a` "did not write the documentation file", `c2` "does not show the creation of
docs/overview.md", `d` "shows no edits to the documents", `e` "No write to docs/decisions.md was observed", `d2` "shows no
document writes". `d`'s artifact read "No write or edit tool calls … are shown" directly above its own "Edited Files"
list, and it was the first thing the continuation `d2` read.

**Ruled 2026-09-29 — [R-067](../../product/requests.md#r-067).** The owner took the recommendation. Within REQ-ORCH-110's
12,000-character cap, the transcript the summariser reads keeps its **start** — the task as given — and its **most
recent part**, with the omission marked between them, stating how much was left out. The pass is also given the
report's deterministic facts — the files the child edited, the commands it ran and their outcomes — so a report never
denies work the record shows. REQ-ORCH-110 fixes how much and not which part, so the ruling fills a silence and amends
nothing; the facts are what REQ-ORCH-109 already keeps runner-owned, given to the pass to condense and never to
overwrite. Nothing is built by the ruling; the repair is owed to the note that records D1.

**Built 2026-09-29 under [R-067](../../product/requests.md#r-067).** `produceReport` reads `reportTranscript` and hands the
pass `reportFacts` beside it. The transcript's start is the ledger row's task, as one event cut to REQ-ORCH-110's 2,000;
the blocks the payload puts ahead of the task are replaced by a marker stating their size. Then comes the marker, then
the most recent part, 12,000 characters with the markers. The note is
[`a-long-childs-report-denies-the-edits-it-made`](../../defects/fixed/a-long-childs-report-denies-the-edits-it-made.md),
repaired. Two bounds the ruling leaves to the build are raised as questions of their own: a task longer than 2,000
characters (OQ-119) and the size of the facts (OQ-120).
Live on 2026-09-29 (duress, session `b4a768a2`), none of the six stored reports denied its own edited files, where the
earlier run had five of seven. The reconciling child's request left 57,547 characters out and still ended on its edits.

*The build's first claim, falsified by the branch's verification and kept beside its correction:* "the first event, the
task as given". The first event is the child's whole REQ-TOOLS-154 payload, and the task comes last in it. In that same
live run every summarising request's start began `user: Workspace root: …` and was cut inside the task, and the request
for the last child lost its task's `EXPECTED OUTCOME` and `MUST DO`. The facts, the most recent part and the stored
reports measured above are unaffected; the start was not the task. The start built since is the task itself. Live
again on 2026-09-29 (duress, session `059ae1d7`), all six summarising requests started with the child's task, whole,
with 313 to 1,653 characters of payload blocks marked omitted ahead of it, and none of the six summaries denied its facts.


**OQ-112 — May `delegate` give a `write_scope` to a persona that holds no file-writing tool?** *(`PD-TOOLS-006` over REQ-TOOLS-152; REQ-ORCH-095, whose text-only completion let the child end `succeeded`. Raised 2026-09-29 from the duress live run's finding D6 under [R-067](../../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-111 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`PD-TOOLS-006` validates a `write_scope`'s patterns — empty, absolute, outside the root — and says nothing of the persona
that declares it. In the duress live run of 2026-09-29 (pack `2026-09-29T03-06-14-929Z`, session `379f1490`, tool call
#24) the orchestrator delegated `c: write docs/overview.md` to `codebase-analyst`, whose granted tools are read-only, with
`write_scope: ["docs/overview.md"]`. The call was accepted (`queued`). The child ran for 2 min 47 s, answered that it had no
file-writing tool, and its report read `succeeded` — REQ-ORCH-095 lets a text-only ending succeed after its one
re-prompt. The orchestrator then commissioned `c2` for the same file. The scope claimed a path nobody the claim protected
could write, and fenced the parent and every sibling out of it meanwhile.

**Ruled 2026-09-29 — by [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006) revision 3, [R-067](../../product/requests.md#r-067).** The
owner took the recommendation. A delegation carrying a `write_scope` to a persona that holds no file-writing tool —
neither `write_file` nor `haet_edit` (with its alias `haet`) — is refused beside REQ-TOOLS-152's other refusals: status
`rejected`, before any record is created and with no task id. Its reason says that the persona cannot write files and,
where the persona catalogue shows any, names the personas that can. A persona's tools are the ones it would be granted
for the child, after REQ-TOOLS-006's controls. REQ-TOOLS-152 is narrowed by `PD-TOOLS-006`, and its back-pointer is
amended in place. REQ-ORCH-095 is untouched: a child with no scope that answers in text still ends as that requirement
says. Nothing is built by this ruling; the finding's note is D6's in `docs/defects/`.

**Built 2026-09-29 under [R-067](../../product/requests.md#r-067).** `IterationChildren.delegate` refuses the scope straight
after the scope's own validation (`writesFiles`, `scopeWithoutWriterReason` and `fileWriters` in
`children/write-scope.ts`); the note is
[`delegate-accepts-a-write-scope-for-a-persona-that-cannot-write`](../../defects/fixed/delegate-accepts-a-write-scope-for-a-persona-that-cannot-write.md),
repaired. "After REQ-TOOLS-006's controls" is read as the two a child's grant meets, `coordinator_only` and
`read_only`: the run-scoped allow-list binds the entry agent alone, and the `tool_restrictions` map is applied to no
agent's grant today (recorded as a defect of its own), so the check follows the grant the tool port builds.
*Superseded 2026-09-29 under R-067 (acceptance finding A4):* the map now narrows the grant as OQ-145 builds it, and the
check reads it too. It applies the lists the persona's own map and the delegating persona's map give the persona's name,
and the writers the reason names are the ones the caller's map lets write (`writesFiles` and `fileWriters` take the
persona of the parent agent). The sentence above is kept as the reason the check first read two controls.
The persona checked is the one the ledger resolves, an alias included; the first build read the built-in table without
its aliases, so `playwright` with a scope was accepted as `ui-verifier` (found by the branch's verification, repaired).
Live again on 2026-09-29 (duress, session `059ae1d7`), scopes given to `codebase-analyst` and to `verifier` were both
refused, and each task went next to a writer.
Live on 2026-09-29 (duress, session `b4a768a2`) the orchestrator gave a scope to `verifier`. It was refused with the
writers named, and 15 s later it delegated the task to `docs-writer`.

**OQ-113 — When does REQ-LIBRARY-092's materialisation fall back to the canonical agent name?** *(REQ-LIBRARY-092, "idempotent keyed on the task id (falling back to the canonical agent name)", and its "Every terminal child report is materialized"; REQ-SESSION-115's handoff artifact as `PD-ORCH-005` clause 20 chooses it. Raised 2026-09-29 from the open note under [R-067](../../product/requests.md#r-067), and ruled in the same entry. Raised as OQ-112 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

`materialiseChildReport` (`packages/engine/src/artifacts/store.ts:322`) looks the artifact up by the child's task id
and, when that finds none, by its canonical name. A child of a later iteration whose name repeats an earlier child's
finds the earlier report's artifact by name and rewrites it in place: the earlier report's summary, findings and status
are replaced by the later child's, while the record keeps the earlier child's task id and creation time
([`a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md`](../../defects/fixed/a-reused-canonical-name-overwrites-an-earlier-iterations-report-artifact.md)).
The requirement's parenthesis does not say when the fallback applies. Read as "when the task-id lookup finds nothing",
two children with different task ids share one artifact, and the earlier child's report is no longer materialized,
against the same requirement's next sentence.

**Ruled 2026-09-29 — answered by amendment, [R-067](../../product/requests.md#r-067).** The owner took the recommendation:
materialisation falls back to the canonical name only for a record that carries no task id, and two children with
different task ids never share or overwrite an artifact. The requirement disagreed with itself under the reading built,
so it is corrected in place rather than narrowed by a directive: `REQ-LIBRARY-092`'s parenthesis now says when the
fallback applies, with the inline mark "accepted amendment 2026-09-29, OQ-113", and domain 14's resolution record
carries the note. Nothing is built by the ruling; the repair is owed to the note above.

*Built 2026-09-29 (R-067), and its first execution reported here.* `materialiseChildReport` looks a record with a task id
up by that id alone, and a record without one by its canonical name, among the child reports no task wrote
(`StoreDal.artifactByCanonical`). The amendment's second half is read to cover a record with no task id too: it never
takes over an artifact a task wrote, nor does a task take over one it did not write. The first execution — two cases in
`packages/engine/src/artifacts/artifacts.test.ts`, "REQ-LIBRARY-092 (OQ-113): …", both red on the code before the repair —
found the overwrite the note describes, and found that the store's own idempotence case pinned it: its last step asserted
that a second task id under the same name updated the first artifact, which the amendment forbids, so that step is
removed. Every caller in the build passes a child's task id, so the name key is now reached only by a record without one.
