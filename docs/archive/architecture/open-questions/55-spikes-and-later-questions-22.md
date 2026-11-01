# Archived open questions — Spikes, and the questions raised since (22 of 35)

The ruled, closed, resolved and withdrawn entries of [part 55](../../../architecture/open-questions/55-spikes-and-later-questions-22.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-256"></a>

**OQ-256 — Does a sibling's answer handed on through `inherited_context` or `depends_on` reach the next child whole?**
*(REQ-TOOLS-152, `depends_on` "summary and key findings" and `inherited_context` "reports", with no cap; REQ-TOOLS-154 item (5),
the inherited-context block; REQ-ORCH-047, the prior-agent-context block; REQ-ORCH-060, the 4,000-character cap of a resume
message's report block; REQ-TOOLS-153, the observation's warnings; `PD-TOOLS-006` revision 8, whose routing sentence sends an
answer through either channel, and revision 5, the 100,000-character attachment budget. Raised 2026-10-13 from finding V1 of the
duress live-run autopsy at `552d346` (session `18a9d22d`), recorded in
[`an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters`](../../../defects/fixed/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md);
the consortium's question V1. **Ruled 2026-10-13.**)*

The inherited-context block rendered each sibling with REQ-ORCH-060's report block, so a long answer reached the child as 4,000
characters and a marker, while REQ-ORCH-047's block carried a dependency's answer unbounded. In the duress run the architect's
28,330-character analysis reached the writer as 14 % of itself and the verifier's 20,195-character report as 20 %; the writer
hunted for the rest with 7 calls, then wrote 7 of `docs/decisions.md`'s 8 file sections from its own reading, and the user's
answer credited them to the architect. No channel a child holds carries the rest.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** both hand-off channels revision 8 names,
the inherited-context block and REQ-ORCH-047's prior-agent-context block, carry each named sibling's or dependency's result text
whole (final response, else last response, else key findings, else summary), each block under a 100,000-character budget. An
answer that does not fit is given the larger of the remaining budget and 4,000 characters, and ends in a marker telling the child
what was omitted, that the rest is in neither the workspace nor the artifact store, and that its report must say what it did not
receive. The caller is warned at acceptance (for a `depends_on` answer already complete, a forecast), `delegate`'s description
says what each channel carries, and REQ-ORCH-060's cap stays on the resume message and the wait results. Recorded as
[`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) **revision 9**, "What an answer handed on carries" (it narrows
REQ-TOOLS-152, REQ-TOOLS-154 and, newly, REQ-ORCH-047). The falsified reason the block was built on, "a child inherits exactly
what its parent was told", is kept beside its replacement in `notify.ts`.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended revision 9 with both channels under one 100,000-character budget, a cut answer
  given the larger of the remainder and 4,000 characters so no child ever receives less than before, a marker telling the child
  what it lacks and that its report must say so, a warning to the caller, and a description sentence saying what each channel
  carries. The ruling followed A on the floor, since B's prefix rule would leave every later sibling a heading and a marker,
  less than a child gets today, and on making the description sentence required, since the coordinator's req 98 believed the
  architect had published no artifact.
- **Advocate B (the system's lens)** recommended the same budget and marker with a prefix rule, the cut warned to the caller as
  a forecast for `depends_on`, REQ-ORCH-060's cap kept on the resume message and wait results, the test cases, and the falsified
  `reportBlock` reason kept beside its replacement. The ruling took B's test cases and the kept reason.

Both rejected the artifact route (a child report's artifact holding its final response): it duplicates the stored report,
depends on an id the wait results do not carry, and drops an over-budget body whole. **Costs kept on record:** a child's payload
grows on every turn that carries it, up to about 300,000 characters across three blocks in the worst case; a `depends_on` answer
over 100,000 characters, unbounded until now, is cut; an implementation built from the specification alone caps the inherited
block at 4,000 characters.

**What a live run then shows.** In the next duress pack a writer handed the architect's or the verifier's answer through
`inherited_context` or `depends_on` sees it whole in its first request: 0 hand-off markers for answers under 100,000 characters
(the harness NOTE `hand-off answers a child received cut`), no hunting calls (`artifact_read`, `glob` or `read_file` of
`.rotaris`) for the missing answer, and no `background_output` verbatim retrieval or re-typed brief by the coordinator to hand a
report on. A `delegate` observation names a cut only when an answer exceeds the budget; the coordinator's resume and wait blocks
still show 4,000 characters per child.

*Built 2026-10-13 (fin38, `fin38-edits-handoff-classifier`); its first execution is reported in `PD-TOOLS-006` revision 9.*
`inheritedContext`, `priorAgentContextParts` and `handOffMarker` (`packages/engine/src/children/notify.ts`) under `HAND_OFF_BUDGET`
(`packages/kernel/src/hand-off.ts`); `Spawned.inheritedCuts` and `DelegateOutcome.handOff`, rendered by `handOffWarnings` beside the
attachment warning, and `HAND_OFF_SENTENCE` in `delegate`'s description (`packages/agent-tools/src/tools/delegation.ts`); the live
run's NOTE (`apps/desktop/scripts/lib/hand-off-cuts.mjs`). Pinned by `children/notify.test.ts`, `children/children.test.ts` and
`tools/delegation.test.ts`, red on the code before. The note is repaired.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** the hand-off was **NOT
REACHED** at `0bc3eee`: no delegation used `depends_on` or `inherited_context`, so the harness's 0 cut answers does not
discriminate. The duress pack named above is still owed; none has been made since `552d346`. Evidence: [`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in
[`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-257"></a>

**OQ-257 — Does `delegate`'s write-scope sentence tie file work to a writer, and what bound replaces OQ-216's target of zero
`write_scope` refusals?** *(REQ-TOOLS-152's `write_scope` as `PD-TOOLS-006` narrows it; revision 3, the refusal of a scope for a
persona that writes no files; revision 4, the catalogue; revision 8, the routing sentence; REQ-ORCH-028, the routing table;
OQ-216's target of zero; [OQ-250](54-spikes-and-later-questions-21.md#oq-250)'s reopening condition, whose first limb is "any `write_scope` refused for a
non-writer". Raised 2026-10-13 from finding V2 and the D3 verdict of the duress live-run autopsy at `552d346` (session
`18a9d22d`, #92), recorded in
[`the-routing-sentence-did-not-stop-a-write-scope-for-architect`](../../../defects/fixed/the-routing-sentence-did-not-stop-a-write-scope-for-architect.md);
the consortium's question V2. **Ruled 2026-10-13.**)*

With the routing sentence in 41 of 41 coordinator requests, req 59 still gave `architect` a `write_scope` for
`docs/decisions.md`, chosen by habit while reasoning about scope overlap, and revision 3 refused it in 5 ms before any record; the
next `delegate`, 30.0 s later, re-routed the work exactly as revision 8 prescribes. `delegate`'s sentence read "When the child will
write files, give write_scope: …", which makes the task the condition and never the persona, and the field had no description.
Every enforced bound held.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** `delegate`'s write-scope sentence, and
a description on the `write_scope` field, say that work writing files goes to a persona whose catalogue entry writes workspace
files and that a scope given to any other persona is refused before the child starts; both texts are fixed and name no persona.
Revision 3's refusal, the routing table's order and revision 8's sentence stay as built, and Advocate A's computed per-route clause
of OQ-250 is declined again, for OQ-250's reason. OQ-216's write-scope target of zero is replaced by a bound: at most one refusal
per duress run, each refused before any record exists and re-routed by the coordinator's next request; the falsified target is
kept beside the bound in OQ-216's entry, and the impossible-brief target of zero stands. Recorded as
[`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) **revision 9**, in the same revision as [OQ-256](#oq-256), and revision 8's
first live execution is reported in place under it.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended rewriting `delegate`'s write-scope sentence and giving the field a schema
  description, so that the moment the coordinator fills in a scope it is told file work goes to a persona whose entry writes
  workspace files, keeping revision 3's refusal as the tripwire and the routing order as it is, and replacing the target with a
  bounded, recovered refusal. The ruling followed A on the wording: the text the coordinator followed was `delegate`'s own
  sentence, and A's wording names no persona and makes the persona the condition of the file work, so a habitual scope on a
  non-writer still trips revision 3 rather than teaching the model to drop the scope.
- **Advocate B (the system's lens)** recommended confirming the tool, the refusal and the table as built and amending the record:
  the refusal counts as the enforced bound doing its job, OQ-216's target becomes a bound, the falsified target is kept, and the
  harness reports the seconds to re-route. The ruling took B's bound, the harness's seconds to re-route, revision 8's first
  execution recorded in place, and B's reopening limb for a non-writer briefed to write without a scope — the one risk A's change
  adds.

**Reopening condition:** more than one `write_scope` refusal for a non-writer in a duress run; a refusal whose work is not
re-routed by the coordinator's next `delegate`; a non-writer child briefed to write a file, with or without a scope (its report
says it cannot write); or at once if any enforced bound OQ-250 lists breaks. **Reopening condition met 2026-10-15 (duress
`2fe0a837`, two refusals); ruled as [OQ-331](63-spikes-and-later-questions-30.md#oq-331)**, which keeps this bound beside its per-task replacement. **Costs kept on record:** still advice; about 40
tokens more on every delegating request; a model that leaves out the scope but still briefs a non-writer to write is caught only
by the reopening limb.

**What a live run then shows.** Every delegating request's `delegate` description carries the new sentence and the offered schema
gives `write_scope` its description. In the duress run a design or decision document goes to a docs-writer, directly or with the
architect's answer handed on, and the scope is given to the writer; at most one write-scope refusal for a non-writer, refused
before any record and re-routed by the coordinator's next request, the harness NOTE printing the seconds to re-route; 0 briefs
offering a command or tool the target lacks, and no non-writer child reporting it was asked to write a file. The default run is
unchanged apart from the tokens.

*Built 2026-10-13 (fin38, `fin38-edits-handoff-classifier`); its first execution is reported in `PD-TOOLS-006` revision 9.*
`WRITE_SCOPE_SENTENCE` and `WRITE_SCOPE_FIELD_SENTENCE` (`packages/agent-tools/src/tools/delegation.ts`); the live run reads the bound
with the seconds to re-route (`routingMissReading`'s `rerouted`, `secondsToNext` and `flagged`, `apps/desktop/scripts/lib/routing-misses.mjs`).
Pinned by `tools/delegation.test.ts` and `lib/routing-misses.test.ts`, red on the code before. The note is repaired.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** at `0bc3eee` the new
sentence and the field's description were in 94 of 94 `delegate` offers, 8 write scopes went to writers only, and 0 were refused
for a non-writer. The default run is unchanged but for the tokens, as foreseen; the duress bound is still owed. Evidence:
[`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-258"></a>

**OQ-258 — Does the intent classifier's strict rung name the classification object's fields?** *(REQ-ORCH-010, the three-rung
ladder, rung 2's keys and example fixed and rung 1's wording open; REQ-ORCH-007 and REQ-ORCH-008, the fallback and the 12 s
bound, kept by OQ-114's ruling under R-071; REQ-ORCH-011, the result's fields; ADR-0026's third execution, "the schema
was meant to be the instruction"; `PD-ORCH-011` revision 2. Raised 2026-10-13 from finding V3 of the duress live-run autopsy and
finding Q2 of the default autopsy at `552d346`, recorded in
[`the-intent-classifiers-strict-rung-never-names-the-objects-keys`](../../../defects/fixed/the-intent-classifiers-strict-rung-never-names-the-objects-keys.md);
the consortium's question V3. **Ruled 2026-10-13.**)*

Every classifier request went out at `json_schema` with user text ending "Reply with the classification object only.", naming no
key, because the schema was to carry them; a reasoning model never sees `response_format` while it reasons. The duress
classification chose `whole_project` early, deliberated over the key from character 1,464 and was cut at 11,975 ms mid-way
through `{"classification":"whole_project"}`; the default pack was cut in 4 of 10 launches, three of them deliberating the same way
(the fourth received no bytes: the endpoint queueing), and faults-args lost its direct-work route.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the intent classifier's `json_schema`
rung names the classification object's three fields in its user text, in the same sentence the `json_object` rung carries and
without that rung's example. The `json_object` rung keeps its example; the text rung, the system prompt and the 12 s bound
(REQ-ORCH-008, OQ-114 as ruled under R-071) are unchanged. It is covered work under REQ-ORCH-010, REQ-ORCH-007, REQ-ORCH-008 and
REQ-ORCH-011, which leaves rung 1's wording open: **no directive**, no specification text and no symbol changes. ADR-0026's
reading "the schema was meant to be the instruction" is kept beside its replacement as falsified.

The two recommendations weighed, and the ruling followed **both** — they recommended the same repair (one keys sentence on rung
1, no example there, the bound kept):
- **Advocate A (the user's lens)** recommended naming the fields on rung 1, leaving the bound alone, reporting `PD-ORCH-011`
  revision 2's first execution in place as a NOTE, and keeping the falsified reason beside its replacement. The ruling took A's
  dated paragraph on the earlier fixed note and the reopening limb "cut after naming its category".
- **Advocate B (the system's lens)** recommended the same change as covered work under REQ-ORCH-010, the same sentence without
  the example and nothing else, with the gap recorded as a defect against ADR-0026's correction and reported back to every record
  that decided it. The ruling took B's shared constant, the ADR-0026 report-back, the `codebase.md` line and the count limb.

**Rejected:** a longer bound (the owner kept it on 2026-10-06, and terminal's queueing would make a longer wait pure loss);
confirming as built. **Reopening condition (OQ-114's intent-bound limb):** a default pack after this change that shows a
classification cut after its reasoning has named its category, with no deliberation about field names; or 3 or more cuts in 10
launches where the endpoint was not queueing (bytes were received before the cut).
*Sharpened 2026-10-15 by [OQ-332](62-spikes-and-later-questions-29.md#oq-332)'s ruling (R-072), the old wording kept above:* the first limb now reads "a
classification cut after its reasoning has named its category and not reopened that choice, the rest of the bound spent on field
names, format or the answer's wording". A category named and then reopened is category deliberation, read under the count limb,
which is unchanged.

**What a live run then shows.** Every `json_schema` classifier request's user text ends with the keys sentence naming `intent`,
`confidence` and `reason`, and the reasoning no longer debates `category`, `classification` or `intent` as the key. Cuts at the
12 s bound fall toward `a68f121`'s 2 of 10 and come only from category deliberation or a queueing endpoint; duress classifies
`whole_project` in time; faults-args classifies `single_file_change` and runs direct (about 43 s, against 169 s); launch audits
read `fallback: true` less often.

*Built 2026-10-13 (fin38, `fin38-edits-handoff-classifier`); its first execution is reported in ADR-0026's third execution, in
place, and in `PD-ORCH-011` revision 2's first live execution.* `KEYS_INSTRUCTION`, `SCHEMA_INSTRUCTION` and
`JSON_OBJECT_INSTRUCTION` (`packages/engine/src/intent/classifier.ts`); pinned by `intent.test.ts`'s OQ-258 case, red on the code
before. The note is repaired.

**Reported back 2026-10-13 (fin41), from the default pack at `0bc3eee`, "the next default pack":** the reopening
condition is **not met** on either limb. Every `json_schema` request (10 of 10) ended with the keys sentence naming `intent`,
`confidence` and `reason`; no reasoning debated `category`, `classification` or `intent` as the key; 9 of 10 launches
classified in 2.3 to 9.8 s, against 6 of 10 at `552d346`. The one cut, requirements at 11,973 ms, came after 91 kB of stream
while the reasoning was still weighing `small_feature`, `moderate_feature` and `single_file_change`: category deliberation, not
a category named and then lost, and 1 cut in 10, not 3. faults-args did run direct (46.1 s, against 169.1 s), but as
`explicit_trivial` 0.78 rather than the `single_file_change` foreseen above; terminal (`explicit_trivial` 0.92) ran its shapes
itself in 183.5 s against 338.8 s. Duress was not run at this head, so "duress classifies `whole_project` in time" is still
unmeasured. Evidence: [`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).

*Since 2026-10-13 (fin41, item N67) the live run prints this measure itself:* a NOTE over every launch it kept, each launch's
category, confidence and rung or its fallback and reason (the launch audit's `run_intent`), the seconds from the session's start
to its `intent:` line, and each cut's bytes received from the recorded traffic, counting the fallbacks and naming the count limb
where 3 cuts in 10 launches received bytes (`apps/desktop/scripts/lib/intent-reading.mjs`). Read over the `0bc3eee` pack it gives
the figures above without an autopsy: 10 launches, 1 fell back, the requirements cut at 12.0 s after 91,112 bytes, the other nine
2.4 to 9.8 s via `json_schema` (measured from the session's start line, so 0.1 s above the autopsy's 2.3 for the fastest). The
other limb — a cut after the reasoning named its category — still needs the reasoning read, which the NOTE does not do.
*(Since 2026-10-15, [OQ-332](62-spikes-and-later-questions-29.md#oq-332)'s ruling: it does, printing the last 300 or so reasoning characters of each cut from the
recorded traffic, `reasoningTail`.)*

**Reported back 2026-10-15 (fin46), from the default pack at `3c03287`** (pack `2026-10-15T03-10-08-908Z`, read by fin46's final
acceptance as finding F7): the reopening condition is **not met** on either limb, as [OQ-332](62-spikes-and-later-questions-29.md#oq-332) rules. The NOTE read
"intent classification over 17 launch(es): 2 fell back (2 cut at REQ-ORCH-008's bound, 2 after the endpoint had sent bytes)" —
2 in 17, under the count limb's 3 in 10. faults-args (record 0 of its traffic) was cut at 11,972 ms after about 95.6 kB: its
reasoning named `single_file_change` ("Let's settle: single_file_change. Confidence 0.85.") and then reopened the choice ("But if
explicit_trivial preferred? Let's re-evaluate."), debating no key; the scenario's pace fault holds back tool-call events only and
was not involved. It fell back to `moderate_feature` and delegated one child (70 s) where `0bc3eee` had run direct. edit was cut at
11,958 ms after 90.8 kB, still choosing between `small_feature` and `moderate_feature`: category deliberation. **Duress now
classifies `whole_project` in time** (about 5.0 s at `3c03287`), the measure this ruling's "What a live run then shows" left
unmeasured at `0bc3eee`. The first limb is sharpened above; the row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-259"></a>

**OQ-259 — Does a `write_file` insert into a CRLF file carry the file's line endings into the inserted lines?**
*(REQ-TOOLS-135, `insert` and its success; `PD-TOOLS-016` and `PD-TOOLS-017`, which keep a CRLF file's line endings for every
`edit`; `PD-STARTUP-001`, Windows the only platform shipped. Raised 2026-10-13 by fin38 from the R-072 consortium's ruling of
[OQ-254](54-spikes-and-later-questions-21.md#oq-254), which confirmed the case in the code and asked that it be recorded as its own note and question.
**Ruled 2026-10-13.**)*

`write_file`'s `insert` joins the file's lines and the content's lines with `\n`. The file's lines keep their `\r` and the
inserted ones have none unless the caller sent it: `a\r\nb\r\n` with `content` `X` at `insert_line` 1 leaves `a\r\nX\nb\r\n`,
beside "Inserted 1 line into … at line 1.". Recorded as
[`a-write-file-insert-writes-lf-lines-into-a-crlf-file`](../../../defects/fixed/a-write-file-insert-writes-lf-lines-into-a-crlf-file.md).
No requirement's text is contradicted: REQ-TOOLS-135 names `insert_line` and its bounds and says nothing of line endings.

**What the build proceeds under.** The inserted lines written as given.

**What a ruling decides.** Whether an insert into a CRLF file (by `PD-TOOLS-016` clause 2's test, read on the lines around the
insertion point or the file's other lines) gives each inserted line the file's `\r`, with `PD-TOOLS-017`'s success sentence
(extending REQ-TOOLS-135), or stands as built, `overwrite`'s and `insert`'s bytes being the caller's.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a `write_file` insert of non-empty
`content` into a CRLF file gives every line break it writes the file's `\r` — the break after each inserted line that a break
follows, and the break added after a previously unterminated last line — never doubling one and changing no byte of the file's
existing lines. The test is `PD-TOOLS-016` clause 2's, read on the file's line before the insertion point and the line at it
(the file's other lines when neither is followed by a line break; an empty file is not CRLF), and the success then adds
`content was written with the file's CRLF line endings.`. Minted as a new directive,
[`PD-TOOLS-018`](../../../product/directives/pd-tools-018.md#pd-tools-018), extending REQ-TOOLS-135 and naming `PD-TOOLS-016` and `PD-TOOLS-017`;
`PD-TOOLS-017` is not revised, its case being `operation: edit` and its no-op and `content_hash:` clauses edit-only. An insert
with empty `content` writes nothing new and stays outside the case.

The two recommendations weighed, and the ruling followed **both** — they recommended the same change and differed only on the
vehicle:
- **Advocate A (the user's lens)** recommended giving every line break an insert writes the file's `\r` with `PD-TOOLS-017`'s test,
  write rule and success sentence, recorded as revision 1 of `PD-TOOLS-017` with an insert clause, so that one directive holds "line
  endings belong to the file" for every incremental write. The ruling took A's edge cases, the unterminated end above all
  (`a\r\nb` + `X\n` at 2 → `a\r\nb\r\nX\r\n`), and its reading that no refusal is needed.
- **Advocate B (the system's lens)** recommended the same behaviour as a new directive, `PD-TOOLS-018`, since `docs/product/README.md`
  keeps a revision for a change to a directive's own case and `PD-TOOLS-017`'s is `edit` alone; and added that LF lines an insert
  leaves behind later fail `PD-TOOLS-016`'s test, so the 016/017 guarantees decay wherever an insert has been. The ruling took B's
  vehicle and that reason; A's point that one directive is easier to find is met by `PD-TOOLS-018` naming both and by its
  back-pointer at REQ-TOOLS-135.

**Costs kept on record:** an insert can no longer write LF lines into a CRLF file (`overwrite` and `create` still write the
caller's bytes); the test is local, so a mixed neighbourhood is written as given and existing drift is not repaired; an
implementation built from the specification alone writes `content` as given.

**What a live run then shows.** Nothing in the current live-run fixtures, which are LF files on Linux; an LF insert is unchanged.
On Windows, an agent's insert into a CRLF file leaves the file uniformly CRLF, and the success adds "content was written with the
file's CRLF line endings.".

**Live run, 2026-10-20** (the Windows ARM64 session; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; `crlf` pack `2026-10-20T08-14-16-333Z`, [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)): the insert into `greet.js` (#25) kept every `\r` and said it wrote the file's CRLF endings.

*Built 2026-10-13 (fin39, `fin39-insert-noop-optionals`); its first execution is reported in `PD-TOOLS-018`, in place.*
`carryInsert` (`packages/agent-tools/src/tools/files.ts`); pinned by the "PD-TOOLS-018" cases in `tools.test.ts`, red on the code
before. The note is repaired.
