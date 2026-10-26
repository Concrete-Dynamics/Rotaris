# Open questions — Spikes, and the questions raised since (29 of 35)

Part 62 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-312, OQ-332, OQ-333.

<a id="oq-312"></a>

**OQ-312 — May a shipped build answer a model with the scripted client when a person's own configuration names the `scripted`
provider?** *(ADR-0056 rule 4 (b), whose packaged launch runs a session against a `models:` entry with `provider: scripted`;
REQ-CONFIG-478 and the provider rules of ADR-0029/0030, under which a run's model is the configured model, authenticated as
configured; the specification names no `scripted` provider anywhere. Raised 2026-10-14 by fin45 (`fin45-seams-ui-and-live`) while
repairing
[`a-packaged-build-still-answers-the-scripted-model-clients-variables.md`](../../defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md),
which left "whether that configuration path is product or verification, and so whether the client itself may ship" to the
repair; the plan's range OQ-311 to OQ-330. Raised as OQ-311, its first number, and renumbered OQ-312 at landing: a sibling
bundle, `fin45-supervision-and-quit`, landed its own OQ-311 first.)*

**What is open.** The repair compiled every environment variable of the scripted client out of a packaged build, the dialect
switch with them, so no variable selects or scripts it there. The client itself still ships, because `scripts/package.mjs`'s
packaged launch (rule 4 (b): "the packaged app opens a store and runs a terminal call") needs a model that makes one terminal
call without a provider, a key or a network, and it reaches it through a configuration file naming `provider: scripted`. The
same file written by a person selects the same stand-in in a shipped build: a model that asks for no credential and answers
with one `git status` call (`PACKAGED_SCRIPT`, `apps/desktop/src/run-host/scripted-client.ts`) and a fixed reply. No requirement
says whether a shipped build may answer such an entry, or must treat `scripted` as any other provider it knows no endpoint for
("No usable model is configured for the entry role", REQ-EVENTS-021).

**What the build proceeds under.** The configuration path stays as it was: an entry naming the `scripted` provider is answered by
the scripted client in every build, and in a packaged one with the fixed script alone. Rule 4 (b) needs it, and it is reachable
only by writing the configuration file, never by the environment.

**What a ruling decides.** Whether a shipped build answers `provider: scripted` from any configuration (the reading above), or
only where the launch is the packaging step's own (which needs a signal that is neither an environment variable nor a
configuration value a person can write, or a rule 4 (b) that proves the terminal call another way), or never (rule 4 (b) then
needs another model that answers without a network).

**What a live run then shows.** Nothing: a live run configures a real provider and never the `scripted` one.

**Ruled 2026-10-14 by the consortium under the owner's delegation ([R-072](../../product/requests.md#r-072)), kind change-behaviour,
with no directive:** a packaged build answers no `provider: scripted` entry. The scripted client is compiled out of the packaged
bundle with the other verification seams, and a `scripted` entry with no `base_url` gets the same refusal as any provider the build
knows no endpoint for (REQ-EVENTS-021/019, "No usable model is configured for the entry role"). ADR-0056 rule 4 (b) is re-based on
a loopback OpenAI-compatible stub that `scripts/package.mjs` starts itself, which the packaged launch reaches through the product's
own model client. REQ-CONFIG-082, REQ-EVENTS-021/019, REQ-CONFIG-478 and ADR-0029/0030 govern as written, so the ruling alone
settles it. *The as-built reading kept above — an entry naming the `scripted` provider answered by the scripted client in every
build, in a packaged one with the fixed script alone — is the falsified one.* **The two recommendations weighed:** quoted in the
paragraph after this one (fin47, 2026-10-15; *until then this read: "the advocates' recommendations were not handed to the building
bundle, and the orchestrator's ruling record holds them."*) **Built 2026-10-14 by
fin46 (`fin46-accept1-11`):** `isScriptedProvider` (`__ROTARIS_SEAMS__ && provider === 'scripted'`) in place of every bare test in
`apps/desktop/src/run-host/configuration.ts` (`modelRefOf`, both empty-key branches of `credentialFactory`, `prepareRun`'s
`isScripted`); `host.ts` building the scripted client only behind the flag (off it, a function that throws, unreachable), so rollup
leaves `scripted-client.ts` out of the packaged `run-host.js`; `PACKAGED_SCRIPT` and its packaged branch removed;
`apps/desktop/scripts/lib/stub-model-endpoint.mjs` and `package.mjs`'s rule 4 (b) step on it, with the added assertion that the stub
served a tools request and sent its `git status` call; `scripted model call:` in the seam check's forbidden list. Pinned by
`configuration.test.ts` and `launch.test.ts` (the flag stubbed false), `seam-check.test.ts` and `stub-model-endpoint.test.ts`; shown
by a `ROTARIS_BUILD=package` build and rule 4 (b)'s launch shape against it under `xvfb-run` on Linux (ADR-0056's report-back); the
Windows `pnpm package` run of the re-based step is owed to the next Windows package (a Windows x64 host, deferred with the release
pipeline under R-071; IC-3 binds Linux and macOS artifacts)
([`../../defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md`](../../defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md)).
Recorded beside it, outside the ruling's repair:
[`../../defects/fixed/terminal-proofs-packaged-launch-drives-seams-a-packaged-build-compiles-out.md`](../../defects/fixed/terminal-proofs-packaged-launch-drives-seams-a-packaged-build-compiles-out.md) (repaired 2026-10-15, fin47).

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "a shipped build never answers a model with the scripted client … ADR-0056 rule 4 (b) proves its terminal
call against a loopback OpenAI-compatible stub that `scripts/package.mjs` stands up itself." **Advocate B** (the system's lens,
change-behaviour): "Rule 'never': a packaged build answers no `provider: scripted` entry. The scripted client is compiled out of
the packaged bundle with its seams." Both followed: A's lens on what a person who writes `scripted` meets, B's on why a middle
reading cannot be built.

<a id="oq-332"></a>

**OQ-332 — Is a classification cut at the 12 s bound after its reasoning named a category, and then reopened that choice, the
cut OQ-258's first reopening limb names?** *(REQ-ORCH-007 and REQ-ORCH-008, the fallback to `moderate_feature` and the 12 s bound,
kept by OQ-114's ruling under R-071; REQ-ORCH-010, the three-rung ladder and its strict rung; REQ-ORCH-014, the
category shown on screen; [`PD-ORCH-011`](../../product/directives/pd-orch-011.md#pd-orch-011) revision 2, what `single_file_change` means;
[OQ-258](55-spikes-and-later-questions-22.md#oq-258)'s reopening condition, whose first limb reads "a classification cut after its reasoning has named its category,
with no deliberation about field names". Raised 2026-10-15 from finding F7 of fin46's final acceptance (round 2 at `3c03287`), with
its harness half F8; the plan's range OQ-361 to OQ-380 does not hold it, because it is written at the number the consortium's ruling
names. **Ruled 2026-10-15.**)*

**What is open.** In the default live run at `3c03287` (pack `2026-10-15T03-10-08-908Z`, the registered self-hosted endpoint,
`qwen3.8-flash-next`) the faults-args launch's classifier request (`faults-args/model-traffic.jsonl` record 0) was cut at
**11,972 ms after about 95.6 kB** of stream (3,773 reasoning characters, no answer text). Its reasoning had weighed
`explicit_trivial` against `single_file_change`, written "Let's settle: single_file_change. Confidence 0.85. … Final:
{"intent":"single_file_change","confidence":0.85,…}", and then reopened that choice: "But if explicit_trivial preferred? Let's
re-evaluate. The categories: explicit_trivial, question, …", listing the categories again when it was cut. It debated no key: OQ-258's
keys sentence was in the request and the three keys were never in question. The scenario's pace fault (120 ms on every chunk) was
not involved: it holds back tool-call events only, and the classifier's stream carries none. The launch fell back to
`moderate_feature` and then delegated one child (a 70 s delegate) instead of writing the file itself. The edit launch was cut too, at
**11,958 ms after 90.8 kB**, its reasoning still choosing between `small_feature` and `moderate_feature` under the tie-break:
category deliberation, which OQ-258's ruling expected. That is **2 cuts in 17 default launches**, under the count limb's 3 in 10, and
the duress launch of the same build classified `whole_project` in **about 5.0 s**. slice-proof's intents-3 met the same bound in the
proof sweep (F8, below). The limb says "a classification cut after its reasoning has named its category"; whether a category named
and then reopened is such a cut, or category deliberation, it does not settle.

**What the build proceeds under.** OQ-114's 12 s bound, REQ-ORCH-007's fallback, the strict rung's text and `PD-ORCH-011` revision 2
as built (`packages/engine/src/intent/classifier.ts`).

**Ruled 2026-10-15 by the consortium under the owner's delegation ([R-072](../../product/requests.md#r-072)), with no directive:**
OQ-258's first reopening limb is **not met**. faults-args' reasoning named `single_file_change` and then reopened that choice, so the
cut at 11,972 ms is category deliberation, which OQ-258's ruling expected. The 12 s bound (REQ-ORCH-008, OQ-114 as ruled under
R-071), REQ-ORCH-007's fallback, the strict rung's text and `PD-ORCH-011` revision 2 stand as built: no product code, no
specification text and no symbol changes. The limb is sharpened in place, in OQ-258's reopening condition and in OQ-114's addendum of
2026-10-13, its old wording kept beside it: **"a classification cut after its reasoning has named its category and not reopened that
choice, the rest of the bound spent on field names, format or the answer's wording"**. A category named and then reopened is
category deliberation and is read under the count limb, which is unchanged. slice-proof's red on a timed-out fallback (F8) is a
harness defect, repaired by giving that fallback the same one extra ask an answer outside the accepted set already gets.

**The two recommendations weighed, and the ruling followed both** (both advocates recommended confirming as built). *Advocate A
(the user's lens)* recommended keeping the bound, REQ-ORCH-007's fallback and the strict rung's text, reading the limb as met in
its wording but the cut, read in full, as category deliberation, the limb clarified to say so: the user was told the truth ("the
classification call timed out after 12 s"), the reasoning wrote "Final: {…}" at about 91% of its stream and then reopened the
choice, and F8 is a slice-proof defect to be given one more ask. *Advocate B (the system's lens)* recommended the same outcome
with the limb read as not met: OQ-258 predicted that the remaining cuts would "come only from category deliberation or a
queueing endpoint", which is what this pack shows (no key debated, bytes received throughout, the upstream stamps' 7.4 to 9.5 s
lead being clock skew, not queueing), and that only a timed-out fallback, not an unparseable, unmapped or setup one, gets the
extra ask. The ruling took B's reading and B's wording of the sharpened limb, which also covers a settled category that loses the
rest of the bound to format or the answer's wording; B's addition that the live NOTE prints each cut's reasoning tail; B's limit on
the extra ask; and A's NOTE under `PD-ORCH-011` revision 2. *(Until 2026-10-15 this paragraph said the advocates'
recommendations were not handed to the building bundle; fin47's reviewer wrote them from the orchestrator's ruling record.)*

**Rejected, with the reasons:**
- **Taking the category the reasoning named** when the call is cut. It breaks REQ-ORCH-007 (a call that reaches the bound falls back)
  and REQ-ORCH-014 (the category shown would be one the model never answered); it parses untrusted reasoning text, which could steer
  the tool grant that follows the category (REQ-ORCH-016, `PD-ORCH-006`); and it depends on the provider streaming its reasoning at
  all, and in a form the product would have to read.
- **A longer bound.** The owner kept 12 s on 2026-10-06 (OQ-114), and the count limb, the measure of whether the bound is too tight,
  reads 2 in 17.
- **Changing the rung's text** on one sample: one launch's reopened choice is the sampled model's, and the strict rung already names
  the keys and the two smallest edits.

**What a live run then shows.** The product looks the same: a classification that reaches 12 s still falls back to
`moderate_feature`, and the status line gives the timeout as the reason. The live run's intent NOTE also prints the tail of each
cut's reasoning (the last 300 characters, from the recorded traffic), so a reader sees whether the category was settled or still
being chosen. `slice-proof` asks a prompt once more after its first timed-out fallback and keeps that attempt's log; it goes red only
after a second timeout, an answer outside the set after it, or any other kind of fallback.

*Built 2026-10-15 (fin47):* the harness half (F8) by `c005066`,
[`../../defects/fixed/slice-proof-reds-on-an-intent-classification-timed-out-at-req-orch-008s-bound.md`](../../defects/fixed/slice-proof-reds-on-an-intent-classification-timed-out-at-req-orch-008s-bound.md)
(`intentVerdict`'s `timedOut`, `intentOutcome`'s shared extra ask, slice-proof's `intents-<n>.attempt-1.log` listed under earlier with
its reason; `live-answers.test.ts`'s four "OQ-332 (F8)" and "scenario 3b asks once more" cases, red on the code before); the reading
half by `reasoningTail` in `apps/desktop/scripts/lib/intent-reading.mjs`, which the live run's classifier NOTE prints for every cut
(`intent-reading.test.ts`'s OQ-332 case, red on the code before). OQ-258's limb and its report-back, OQ-114's addendum and
`PD-ORCH-011` revision 2's NOTE are written in place; the row is in [`first-executions.md`](../first-executions.md).

<a id="oq-333"></a>

**OQ-333 — Does an item the run marked on delegation stay counted against the single-active rule after its child ends?**
*(REQ-TOOLS-145, at most one task IN_PROGRESS, and REQ-TOOLS-146, `replace`'s protection of the active task, as
[`PD-TOOLS-008`](../../product/directives/pd-tools-008.md#pd-tools-008) narrows them: revision 2's bound over the tasks no non-terminal child
holds, revision 3's served set and its close; [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006) revision 7, the run's mark
of a delegated item at admission; REQ-ORCH-063, the message that resumes a wait, which also serves a foreground `delegate`;
REQ-ORCH-059, the completion notification; [OQ-249](53-spikes-and-later-questions-20.md#oq-249)'s harness target of 0 single-active refusals in coordinating
sessions. Raised 2026-10-15 from finding F9 of fin46's final acceptance (round 2 at `3c03287`); the plan's range OQ-361 to OQ-380
does not hold it, because it is written at the number the consortium's ruling names. **Ruled 2026-10-15.**)*

**What is open.** In the default live run at `3c03287` (pack `2026-10-15T03-10-08-908Z`, session `3e4b7210`, delegation-swarm)
the coordinator wrote its plan (`#6`) and delegated three children in one step (`#7` to `#9`), each naming its item, which the run
marked IN_PROGRESS at admission as revision 7 states ("Todo item … (impl101) is now IN_PROGRESS."). Its `wait_for_tasks` (`#14`)
returned the three reports after 53.9 s. About 2.5 s later the coordinator marked its next item, `update verify101 IN_PROGRESS`
(`#26`), and was refused: "Only one task can be IN_PROGRESS at a time. Active task: impl101 (addTodo refuses empty or blank title
in src/todos.js). Mark it COMPLETED or ABANDONED before moving another task to IN_PROGRESS." impl101's child had ended, so the
item was no longer held and REQ-TOOLS-145, as revision 2 bounds it, counted it. The coordinator then closed the three delegated
items one by one (`#27` to `#29`) before delegating the verifier (`#30`): four calls and about 7 s. The live run's NOTE read "todo
calls refused under REQ-TOOLS-145 or PD-TOOLS-008 in coordinating sessions (OQ-249; target 0) — delegation-swarm #26", and the
same NOTE stood in the two default packs before it, requirements `#50` (the `wt-live` pack of 13:37) and crlf `#22` (15:58).
Revision 2 accepted this as its cost ("a stale active row between a child's end and the coordinator closing its item, which then
counts against the next write that marks a task"); OQ-249's target of 0 says the refusal should not happen.

**What the build proceeds under.** REQ-TOOLS-145 binds once the child ends, as built: `TodoList.active(held)` and the
`add_task`, `update` and `replace` checks read the held set (`packages/agent-tools/src/tools/todo.ts`).

**Ruled 2026-10-15 by the consortium under the owner's delegation ([R-072](../../product/requests.md#r-072)), kind
change-behaviour:** REQ-TOOLS-145's single-active bound and REQ-TOOLS-146's rejection count only IN_PROGRESS tasks that **no child
of the list's owner serves** as its `todo_item`, terminal children included, so an item the run marked on delegation never
refuses the coordinator's next mark, before or after its child ends. The run never closes the item; the coordinator closes it, and
the message that resumes a wait (REQ-ORCH-063, which also serves a foreground `delegate`) names each such item still IN_PROGRESS
with one line telling it to close the item with `update`. Recorded as [`PD-TOOLS-008`](../../product/directives/pd-tools-008.md#pd-tools-008)
**revision 4** (Narrows unchanged: REQ-TOOLS-145, REQ-TOOLS-146) and [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006)
**revision 11** (REQ-ORCH-063 joins its Narrows line; the ruling named it revision 10, and [OQ-334](64-spikes-and-later-questions-31.md#oq-334)'s revision 10 landed
on `main` first). This revises OQ-249's bound, which counted held tasks only, and revision 2's
accepted cost, quoted beside its replacement in the directive. The completion notification of REQ-ORCH-059 is unchanged.

**The two recommendations weighed, and the ruling followed both** (both advocates recommended changing the behaviour).
*Advocate A (the user's lens)* recommended keeping a served item outside REQ-TOOLS-145's count after its child ends, until the
coordinator closes it, with one line in the observation that delivers the child's end telling the coordinator the item is still
IN_PROGRESS: the refusal filed a `tool_error` issue on a run that succeeded, recurred in all three default packs, and depended on
a child's end the coordinator could not see (requirements `#50`, where the same write a little earlier would have been accepted).
*Advocate B (the system's lens)* recommended the same change to the count, recorded as `PD-TOOLS-008` revision 4 over the served
set, terminal children included, with the run never closing an item: as built, a `replace` was allowed what an `update` was
refused for the same item. Both rejected an automatic close by the run (REQ-ORCH-030's attempt count and a verification that fails
after the child's report need the coordinator's judgement; REQ-ORCH-029 keeps the list the coordinator's) and confirming as built.
The ruling took B's mechanism and record, and A's line, placed only in REQ-ORCH-063's message that resumes a wait and kept out of
REQ-ORCH-059's completion notification, whose open-todo reminder lines already name open items. *(Until 2026-10-15 this paragraph
said the advocates' recommendations were not handed to the building bundle; fin47's reviewer wrote them from the orchestrator's
ruling record.)*

~~A task a running delegation holds is never counted against such a write.~~ **Replaced 2026-10-15 (revision 4):** a task a child
of the list's owner serves, running or ended, is never counted against such a write.

**What it costs.** A stale active row that the Agent plan strip can show from a child's end until the coordinator closes its
item; one more narrowing of REQ-TOOLS-145; and fin38's limit, now on the count as well as the close: the served set is the
current iteration's ledger, so an earlier iteration's served item still counts after a REQ-ORCH-075 re-queue or a resume.

**What a live run then shows.** In every coordinating default session (delegation-swarm, requirements, crlf) each `update` or
`add_task` that marks the coordinator's next item IN_PROGRESS after a delegated child ends is accepted; the harness counts 0
`todo` calls refused under REQ-TOOLS-145 or `PD-TOOLS-008` in coordinating sessions, and no `tool_error` issue from that cause.
Each `wait_for_tasks` or foreground `delegate` result that reports a child whose item is still open carries the line "Todo item
<name> (<id>) is still IN_PROGRESS: close it with update once you accept this report."; the coordinator closes those items, and
the Agent plan strip ends with them COMPLETED. NOTEs report any served item still IN_PROGRESS when the coordinator answers, and
the seconds from each child's end to its item's close.

*Built 2026-10-15 (fin47, `fin47-classifier-and-todo`); its first executions are reported in `PD-TOOLS-008` revision 4 and
`PD-TOOLS-006` revision 11.* `exemptNow` and the single-active reads in `todoTool` (`packages/agent-tools/src/tools/todo.ts`);
`openServedItems` (`packages/engine/src/children/todo-item.ts`), `openServedItemLine` and `reportBlockWithItem`
(`packages/engine/src/children/notify.ts`), and `openServedItemsOf` in `IterationChildren` feeding `resumeMessage` and both texts
of `waitForTasks` (`packages/engine/src/children/orchestration.ts`); the live run's `resumeLines`, `openAtAnswer` and
`closeLatencies` (`apps/desktop/scripts/lib/coordinator-todo.mjs`). Pinned by `tools.test.ts`, `run-host/tools.test.ts`,
`children.test.ts`, `notify.test.ts`, `todo-item.test.ts` and `coordinator-todo.test.ts`, red on the code before but for the case
that pins the limit. Recorded beside it, outside the ruling's repair:
[`../../defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`](../../defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md)
(repaired 2026-10-15 by fin47, finding A6).
The row is in [`first-executions.md`](../first-executions.md).

*Noted 2026-10-20:* fin47's bundle `fin47-accept1-6` settled the A6 note's open choice ("mint, or refuse the call") as mint, citing REQ-TOOLS-144's "auto-generated" ids and `add_task`'s existing behaviour, in the Outcome of `docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`; no ruling was needed and none is made here.
