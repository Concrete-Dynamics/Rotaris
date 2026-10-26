[Product directives](../directives.md) › PD-ORCH-011

<a id="pd-orch-011"></a>

### PD-ORCH-011 — `explicit_trivial` is a small edit, and the tie-break chooses among the plausible categories

*Renumbered before landing: built as `PD-ORCH-010` on its branch, it took the next free number, `PD-ORCH-011`, when `PD-ORCH-009` (the answerless entry role, OQ-199) landed on `main` first; its citations followed.*

*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-227](../../architecture/open-questions.md)) — **what
`single_file_change` means**: one clause added after the rule's first paragraph, and the As-built paragraph replaced,
revision 1's quoted beneath it. Revision 1's meaning for `explicit_trivial` and its tie-break clause stay in force.*

`explicit_trivial` SHALL mean an explicitly stated, trivial **edit**: with `single_file_change`, one of the two smallest
edits, as REQ-ORCH-021's micro group holds them. A request that changes nothing is not `explicit_trivial`, however small
it is: a question about one file belongs to the answer group (`question`, `exploration`). REQ-ORCH-006's tie-break, "when
several categories are plausible the tie-break prefers `moderate_feature`", SHALL choose among the categories that are
plausible for the request: it prefers `moderate_feature` where `moderate_feature` is itself one of them, and never brings it
into reach of a request for which no build is plausible. The thirteen categories, REQ-ORCH-006's two fixed meanings and
REQ-ORCH-007's fallback are unchanged.

**`single_file_change` — revision 2 (OQ-227).** `single_file_change` SHALL mean a small edit confined to one file, as the
request states or implies. A change requested together with a test of it, or one naming several files to change, is
outside it unless the request places all of it in one file. The classifier's instructions SHALL state this on every rung.
`explicit_trivial` keeps revision 1's meaning — an explicitly stated trivial edit, with no file count — so a small chore
across files that the request states to be trivial stays in the micro group. REQ-ORCH-016 and `PD-ORCH-006` are unchanged:
the direct-work grant follows the category, never a measured size.

**As built — revision 2.** The classifier's system prompt, which every rung sends, carries the clause above in one sentence
beside revision 1's "the two smallest edits" and the tie-break (`CLASSIFIER_SYSTEM_PROMPT`,
`packages/engine/src/intent/classifier.ts`); the json_object rung's example ("one file, one edit") agrees with it and is
kept. The product still takes the category the model answers. `slice-proof` keeps its accepted sets and its single
ask-once-more retry (`INTENTS`, `intentOutcome`, `apps/desktop/scripts/lib/live-answers.mjs`), which now cite this revision
for why the micro group is out of reach of a feature and its test.

> **Revision 1 said, and no longer governs:** "**As built.** The classifier's instruction already calls `explicit_trivial`
> and `single_file_change` "the two smallest edits" and passes the tie-break on in REQ-ORCH-006's words
> (`packages/engine/src/intent/classifier.ts`); neither is changed. The product takes the category the model answers: it
> does not overrule a model that classifies a question `explicit_trivial`. `slice-proof` accepts the answer group alone for
> its question about `README.md` (`INTENTS`, `apps/desktop/scripts/lib/live-answers.mjs`), so that answer is a red there."
> The last two sentences still hold.

**Why, and what it costs.** OQ-198: REQ-ORCH-006 names `explicit_trivial` without a meaning, and REQ-ORCH-021 groups it with
`single_file_change` apart from the answer group. The two readings route a run differently: the micro group's playbook cells
in place of the answer group's, and in `plan` mode a hold at the plan gate, which exempts the answer group alone
(REQ-ORCH-153). Read literally, the tie-break would classify every request with several plausible categories as
`moderate_feature`. The owner ruled the edit reading and the tie-break among the plausible. What it costs: a model that
still answers `explicit_trivial` for a question (one run in nine against the registered endpoint on 2026-10-03) routes it
as an edit, and `slice-proof` reports that run red where it accepted it before.

**Why, and what it costs — revision 2.** OQ-227: REQ-ORCH-006 fixes no meaning for `single_file_change`, and the build gave
it a rung-dependent one: only the json_object rung's example said "one file, one edit", while the json_schema rung — which
carried finacc3 A2-03's `single_file_change` (0.82) for a flag and its unit test — said nothing. REQ-ORCH-014 shows the
identifier on screen, so the user saw their request mislabelled, and under `PD-ORCH-006` the category granted the
coordinator the direct-work bundle and the micro cell, so the same prompt ran directly in one launch and delegated in the
next. Letting the grant follow a measured size instead would need a repository measurement REQ-ORCH-008 excludes, and would
hide from REQ-ORCH-016's user-inspectable mapping what decides the grant. What it costs: a small change requested with its
test now classifies as a build and runs delegated, which the live record measured at 114 to 146 s against 19 to 33 s for
direct work; in languages that keep unit tests in the same file, the request must say so to stay in the micro group; and
prompt guidance is probabilistic, so a sampled model may still miss, which `slice-proof`'s one retry absorbs.

> **Narrows:** REQ-ORCH-006

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-198.*
Revision 2 logged as [R-072](../requests.md#r-072) (OQ-227), ruled by the consortium under the owner's delegation, both
advocates' recommendation followed: the system-lens advocate's wording, with "small", and glossary step; the user-lens
advocate's first execution against the registered self-hosted endpoint.

> **First execution of revision 2, 2026-10-13, built in plan fin34:** the clause is in the classifier's system prompt and
> reaches all three rungs. **What was measured.** `intent.test.ts`'s OQ-227 case drives the ladder down json_schema,
> json_object and text with the flag-and-test prompt and finds the sentence in every rung's system prompt, red before the
> change; the rest of the classifier's cases and `live-answers.test.ts` stay green. **What was not measured.** Whether the
> live model now answers a build category for that prompt: the first live `pnpm slice-proof` against the registered
> self-hosted default (R-068) is the orchestrator's to run — an agent's live-run launch is refused — and should show intents-3
> in the build groups and intents-2 in the micro group, with the one retry still absorbing a single sampled miss. Recorded in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 2's first live execution, the default live run at `552d346` (the registered self-hosted endpoint,
> `qwen3.8-flash-next`, 2026-10-13; finding Q2), reported in place — a NOTE:** the sentence reached 10 of 10 classifier
> requests (the system prompt 898 → 1,141 characters). The classifier was cut at its 12 s bound in **4 of 10 launches** (edit,
> resume, faults-args and terminal), against 2 of 10 at `a68f121`, and the duress launch of the same build was cut too
> (11,975 ms). The one prompt this revision defines, faults-args, was cut at 11,978 ms with 3,600 reasoning characters and still
> undecided, its reasoning never engaging the categories, and fell back to `moderate_feature` (launch audit `fallback: true`);
> `a68f121` had classified it `single_file_change` 0.92 in 7.0 s. The cut sent a one-file create through a coordinator and a
> child: 169.1 s and 80 k tokens against 43.3 s and 23 k. The same prompts reasoned longer than at `a68f121` (faults-ladder 787 →
> 1,234 characters, faults-stall 786 → 2,114, frictions 1,073 → 1,544; requirements fell, 1,973 → 1,478). **The endpoint's
> pace confounds it:** terminal's classifier received 0 bytes in 11,967 ms and edit's 201 chunks, and in three stretches single
> requests ran at 10 to 22 output tokens/s with nothing else of the run in flight, against 64 to 74 at other times. Read from the
> copied traffic by the R-072 consortium's ruling of [OQ-258](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-258): the cuts of duress,
> resume and faults-args deliberated over which key to write the category under (the strict rung named none), edit's was still
> applying the tie-break, and terminal's was the endpoint queueing. So this revision's sentence is not shown to have lengthened
> classification; the key deliberation is OQ-258's, repaired by naming the keys on the strict rung, and the next default pack is
> the measure.

> **Reported back 2026-10-13 (fin41): revision 2 at `0bc3eee`, "the next default pack" named above** (pack
> `2026-10-13T12-18-40-282Z`; [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md)). The classifier answered on its strict rung in **9 of 10 launches** (2.3 to 9.8 s),
> against 6 of 10 at `552d346`; every request ended with OQ-258's keys sentence and no reasoning debated which key to write. The
> one cut, requirements at 11,973 ms, received 91 kB of stream and was still weighing `small_feature`, `moderate_feature` and
> `single_file_change` against the prompt's tie-break, so neither of OQ-258's reopening limbs is met. **faults-args, the prompt
> this revision defines:** classified `explicit_trivial` 0.78 in 9.1 s, not `single_file_change`, and the coordinator wrote the
> file itself in 46.1 s (169.1 s at `552d346`, 43.3 s at `a68f121`). Both are direct-work categories, so the route the revision
> wants was taken and the label it defines was not. Whether the sentence lengthens classification is still not separable from
> the endpoint; with the keys named it no longer shows as cuts.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
> *Since 2026-10-13 (fin41, item N67) the next default pack is read by the live run itself: a NOTE gives each launch's
> classification, its seconds and each cut's bytes received, and counts the fallbacks (`lib/intent-reading.mjs`); over the
> `0bc3eee` pack it reproduces the figures above, faults-args `explicit_trivial` 0.78 in 9.2 s.*
>
> **Reported back 2026-10-15 (fin47), revision 2 at `3c03287` — a NOTE** (pack `2026-10-15T03-10-08-908Z`, fin46's final
> acceptance, finding F7; ruled as [OQ-332](../../architecture/open-questions/62-spikes-and-later-questions-29.md#oq-332) under [R-072](../requests.md#r-072)).
> **faults-args, the prompt this revision defines, fell back instead of reaching the micro group.** Its classification was cut at
> REQ-ORCH-008's 12 s bound (11,972 ms, about 95.6 kB of stream) after its reasoning had named `single_file_change` at 0.85 and
> then reopened the choice against `explicit_trivial`; it took REQ-ORCH-007's fallback, `moderate_feature`, and the coordinator
> delegated one child (70 s) instead of writing the file itself. The cause is the reasoning's category deliberation within the
> bound, not this revision's meaning: the label it reasoned toward was the one this revision defines, and no key was debated. OQ-332
> rules the cut category deliberation, so neither of OQ-258's reopening limbs is met (2 cuts in 17 launches), and this revision, the
> strict rung and the bound stand as built. The live run's intent NOTE now prints each cut's reasoning tail, so the next pack shows
> without an autopsy whether a cut settled its category. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
