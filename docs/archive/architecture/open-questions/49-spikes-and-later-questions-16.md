# Archived open questions — Spikes, and the questions raised since (16 of 35)

The ruled, closed, resolved and withdrawn entries of [part 49](../../../architecture/open-questions/49-spikes-and-later-questions-16.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-222"></a>

**OQ-222 — Do six back-pointers that name a directive whose disposition block omits their requirement mark reaches the
register left out, or are they cross-references written in a back-pointer's shape?** *(`docs/product/README.md`, "The
back-pointer, in place": "Use `Superseded by`, `Narrowed by` or `Extended by` to match the disposition"; `PD-TOOLS-002`'s
Narrows line and `PD-LIBRARY-002`'s Extends and `New:` lines; the notes at REQ-SANDBOX-104 (Narrowed by `PD-TOOLS-002`),
REQ-MONITOR-173, REQ-WORKSPACE-041, REQ-LIBRARY-017 and REQ-NOTIFY-251 (Extended by `PD-LIBRARY-002`), and at domain 14's
introduction, which names no requirement. Raised 2026-10-06 by the F15 repair, which recorded the six as
[`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md`](../../../defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md)
and left the reading per note to the directive's owner; opened here 2026-10-07 as the R-072 consortium's question BP1,
the number the round assigned it, and ruled the same day.)*

The generated register (`SUPERSEDED_BY`, `NARROWED_BY`, `EXTENDED_BY`) records nothing for five of the six requirements
under the directive their note names (REQ-WORKSPACE-041 only as narrowed by `PD-WORKSPACE-002`), so a reader of code is
told the requirement is untouched while the specification file says a directive reaches it. Either a disposition block
omits a requirement its rule reaches, or a note is a cross-reference in the shape of a back-pointer.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** five of the six notes mark
reaches that their directives' disposition blocks left out, and each block now names its requirement under the verb its
note already carries. `PD-TOOLS-002` Narrows REQ-SANDBOX-104, together with REQ-TOOLS-071 and REQ-TOOLS-072, because its
rule names each of the three by identifier and removes the same downgrade clause from each; `PD-LIBRARY-002` Extends
REQ-MONITOR-173, REQ-WORKSPACE-041, REQ-LIBRARY-017 and REQ-NOTIFY-251, and its `New:` line is retired. REQ-LIBRARY-017
is recorded under Extends because its clauses bind an analysis that a run triggered, and the directive reads it so
("no clause here is relaxed"). The note in domain 14's introduction names no requirement, so it is relabelled as a
cross-reference written in its own words. `back-pointers.test.ts` drops its known list: one case asserts that every note
agrees with the register, a converse case asserts that every register entry has its note, and both lists start empty
once the missing notes at REQ-TOOLS-069 and REQ-SHELL-119 are written. The generator refuses a `New:` line that names a
requirement and `New` beside another verb, the route this defect came in by. No directive is minted or revised: the two
disposition blocks are completed in place, each with a dated italic line beneath it, on the precedent of F15
(`PD-ORCH-014`'s REQ-CONFIG-135 line) and `PD-WORKSPACE-001`'s third execution; no rule text and no requirement text
changes, and no product behaviour changes. R-071's ruling on OQ-65 stands.

**The two recommendations weighed.** *Advocate A (the user's lens)*: the five reaches enter the disposition blocks under
their notes' verbs, the introduction becomes a cross-reference in the REQ-CONFIG-464 shape, the known list is deleted,
and the notes at REQ-WORKSPACE-041 and REQ-MONITOR-173 gain a sentence each so they stay true after OQ-65 and ADR-0065
decision 7; it named REQ-TOOLS-071, REQ-TOOLS-072 and REQ-LIBRARY-125 as unrecorded reaches. *Advocate B (the system's
lens)*: the same five entries and the introduction relabelled, plus this entry, a converse check that every register
entry has its note (with the notes at REQ-TOOLS-069 and REQ-SHELL-119 written so it starts empty), a generator refusal
of a `New:` line naming an identifier or standing beside another verb, and REQ-TOOLS-071 added to the Narrows line. **The
ruling followed both**: A's note amendments, B's entry, converse check and generator refusal, and REQ-TOOLS-071 and
REQ-TOOLS-072, which the rule names and narrows the same way as REQ-SANDBOX-104. `PD-LIBRARY-002`'s other candidate
reaches have arguable verbs and go to a note of their own, with two further questions the advocates raised:
[`pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md`](../../../defects/fixed/pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md),
[`pd-library-002-says-no-user-global-location-where-the-retrospective-reads-user-global-instruction-files.md`](../../../defects/fixed/pd-library-002-says-no-user-global-location-where-the-retrospective-reads-user-global-instruction-files.md)
and
[`the-unattended-advisory-is-empty-for-every-mode-where-pd-tools-002-keeps-it-for-ask-and-restricted.md`](../../../defects/fixed/the-unattended-advisory-is-empty-for-every-mode-where-pd-tools-002-keeps-it-for-ask-and-restricted.md),
recorded and not repaired.

**As built** (fin29, 2026-10-07). `PD-TOOLS-002`'s Narrows line names REQ-TOOLS-071, REQ-TOOLS-072 and REQ-SANDBOX-104 and
`PD-LIBRARY-002`'s Extends line the four, each block with a dated italic line beneath it; notes were written at
REQ-TOOLS-069, REQ-TOOLS-071, REQ-TOOLS-072 and REQ-SHELL-119, the REQ-MONITOR-173 and REQ-WORKSPACE-041 notes each
gained a dated sentence, and domain 14's introduction reads as a cross-reference. `docs/product/README.md`, "The
back-pointer, in place", states the cross-reference rule and the two-way check. `tools/symbol-artifact/generate.mjs`
refuses a `New:` line naming a requirement (on the line or its continuation) and New beside another verb; `pnpm symbols`
gains three narrowed and four extended entries (177 and 51 to 180 and 55 as built; the totals move
with every directive main gains, the delta does not). Pinned by `tools/symbol-artifact/back-pointers.test.ts` (no note
disagrees, red on the old record with the six; every register entry has its note, red with REQ-TOOLS-069 and
REQ-SHELL-119; the OQ-222 case, red on the old register) and by three counterfactuals in `pnpm directive-proof`, red
against the old generator (29/32) and 32/32 after. Notes moved to `docs/defects/fixed/`:
[`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md`](../../../defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md),
[`three-pd-tools-002-reaches-and-one-pd-shell-003-reach-lack-a-note-or-a-disposition.md`](../../../defects/fixed/three-pd-tools-002-reaches-and-one-pd-shell-003-reach-lack-a-note-or-a-disposition.md)
and
[`the-symbol-generator-drops-an-identifier-written-on-a-new-line.md`](../../../defects/fixed/the-symbol-generator-drops-an-identifier-written-on-a-new-line.md).
No product behaviour changed, so a live run shows nothing new.

*Added 2026-10-13:* the follow-up this ruling left to a note of its own is ruled as [OQ-236](51-spikes-and-later-questions-18.md#oq-236) (R-072):
`PD-LIBRARY-002` revision 2 Narrows REQ-LIBRARY-011, -020, -109, -124, -125, -130 and REQ-NOTIFY-250 and Extends
REQ-LIBRARY-126 and -128; the user-global question is [OQ-235](51-spikes-and-later-questions-18.md#oq-235).

<a id="oq-226"></a>

**OQ-226 — How is a foreground terminal call its run cancels recorded?** *(REQ-TOOLS-097, the hard bound whose observation
is returned "on reaching" it; REQ-TOOLS-099, the hard-timeout contract and its detail; REQ-TOOLS-179, 124 reserved for a
hard timeout; REQ-TOOLS-103, a failure before completion; REQ-TOOLS-100 and REQ-TOOLS-112, the closed `failure_kind` and
`outcome_kind` vocabularies, neither of which holds a cancellation kind; REQ-SESSION-136, the outcome-driven issues;
PD-ORCH-005 clause 3, a call a quit cut off "is recorded as interrupted"; OQ-144's handshake sentence. Raised 2026-10-07
from finding P2 of the orchestrator's final default live run at `a68f121` (the self-hosted endpoint), and ruled the same
day.)*

A foreground call the run cancels (the tool context's signal aborted: a pause past REQ-ORCH-134's tool deadline, a stop, a
quit, the explicit cancel, an agent's cancellation or its limit, a cancel during OQ-144's handshake) ends its process tree
and restarts the session, and was then reported as a hard timeout: exit 124, `timeout`, `TimeoutError`, "The command
exceeded its timeout of N seconds", a `terminal_timeout` issue at `error`, and a Timeouts count in `summary.md`. In that
run's terminal session (`5df89df3`), call `#36`, the re-run child's 45 s wedge, ran 3,505 ms before the quit cut it and is
recorded `failed`, `timeout`, exit 124, "The command exceeded its timeout of 100 seconds; … (the call was cancelled)";
issue 10 is `terminal_timeout` at `error`, and `summary.md` reads "Timeouts: 1". The console's NOTE said the hard cap was
not reached. Recorded as
[`a-foreground-terminal-call-the-run-cancels-reads-as-a-timeout.md`](../../../defects/fixed/a-foreground-terminal-call-the-run-cancels-reads-as-a-timeout.md).

**What the build proceeded under, until 2026-10-07.** Both abort branches of `ForegroundSession.run`
(`packages/agent-tools/src/terminal/foreground.ts`) returned 124 and `timedOut: true` with the error "the call was
cancelled", and `terminal/index.ts` read `timedOut` as the `timeout` kind and wrote REQ-TOOLS-099's detail.

**What a ruling decides.** Whether the cancel keeps the hard-timeout reading, is REQ-TOOLS-103's `execution_error` within
the vocabulary as it stands, or gains a kind of its own, the `interrupted` the question and delegation tools already carry,
under a directive that widens REQ-TOOLS-100's and REQ-TOOLS-112's closed sets; and whether such a call files an issue.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a new directive,
[`PD-TOOLS-013`](../../../product/directives/pd-tools-013.md#pd-tools-013), governs. A foreground terminal call that its run cancels is
recorded with `failure_kind` and `outcome_kind` `interrupted`, severity `warning`, `is_error` true, no exit code and
`timeout` false; this covers a pause past the tool deadline, a stop, a quit, the explicit cancel, an agent's cancellation or
limit, and a cancel during OQ-144's handshake. Its detail says the run cancelled the call, what became of the session and
what was restored, and the call files no outcome-driven issue. The hard-timeout reading (124, `timeout`,
`terminal_timeout`) stays reserved for a call that reached its hard bound, as REQ-TOOLS-097, -099 and -179 state, so the
timeout encoding a cancel carried is repaired as a defect against them. **The two recommendations weighed:** advocate A
(the user's lens) recommended repairing within the vocabulary, the cancel read as REQ-TOOLS-103's `execution_error` with no
exit code and a marker that suppresses the issue, and no directive; advocate B (the system's lens) recommended the
directive, `interrupted` as a fifth failure kind and an eleventh outcome kind at severity `warning`, the kind PD-ORCH-005
already gives every other call a run cuts short, with no issue filed and the gate unchanged. The ruling followed **B**: A's
`execution_error` reads a deliberate cancel at severity `error`, in the bucket of real backend faults, still departs from
REQ-SESSION-136's letter, and gives the gate a second way to mark an interrupted call, where B reuses the product's own
word and the gate's existing branch. It takes A's test plan (a mid-command cancel, the real timeouts pinned, Timeouts
reading 0). OQ-144's handshake parenthetical is revised in place beside the struck reading; R-071's ruled behaviour for
replaced and ended shells stands. The ruling's directive number was written as `PD-TOOLS-011` by advocate B, taken; it is
`PD-TOOLS-013`. Noticed while ruling and recorded, not repaired: the gate's catch and fetch still file a `tool_error` for
a call the run cancels
([`a-call-the-run-cancels-in-the-gate-or-in-fetch-files-a-tool-error-issue.md`](../../../defects/fixed/a-call-the-run-cancels-in-the-gate-or-in-fetch-files-a-tool-error-issue.md)).
**Built 2026-10-07 (fin31):** `ForegroundResult.cancelled` and both abort branches of `ForegroundSession.run` (no exit code,
`timedOut: false`), the `interrupted` kind, `InterruptedError` and the cancel's detail in `terminal/index.ts`, and the kind in
both vocabularies of `classify.ts`; `gate.ts` and `export.ts` unchanged. The ruling's dispositions could not stand as
written: the symbol generator admits one directive per verb on a requirement, and `PD-TOOLS-009` already narrows
REQ-TOOLS-112 and `PD-SESSION-003` REQ-SESSION-136, so PD-TOOLS-013 narrows REQ-TOOLS-100 and extends those two.
*Reversed 2026-10-13 by [OQ-237](51-spikes-and-later-questions-18.md#oq-237) (GV1): PD-TOOLS-013 narrows all three, as this ruling named them; the substitution and its
reason no longer stand.* Pinned by
the cases named in the repaired note and `pnpm driver-proof`'s launch 13d, a quit during `sleep 60`, red before and green
after.

<a id="oq-227"></a>

**OQ-227 — What does `single_file_change` mean to the intent classifier?** *(REQ-ORCH-006, the taxonomy and the three meanings
it fixes, none for `single_file_change`; PD-ORCH-011, "`explicit_trivial` and `single_file_change` are the two smallest
edits"; PD-ORCH-006, the direct-work bundle a `single_file_change` grants; REQ-ORCH-021, the micro group. Raised 2026-10-07
by fin30's repair of finacc3 A2-03,
[`slice-proof-reds-on-one-intent-answer-outside-the-accepted-set.md`](../../../defects/fixed/slice-proof-reds-on-one-intent-answer-outside-the-accepted-set.md).
Numbered past the round's assigned OQ-221 to OQ-224; raised as OQ-225, renumbered OQ-227 at landing because origin/main took
OQ-225 (the REQ-ORCH-029 hold, PD-ORCH-015) and OQ-226 (fin31, PD-TOOLS-013). Open.)*

The classifier's instructions (`CLASSIFIER_SYSTEM_PROMPT`, `packages/engine/src/intent/classifier.ts`) say what the
specification says and no more: `single_file_change` is one of "the two smallest edits". A live model classified "Add a
--json flag to the CLI that prints the effective configuration as JSON, with a unit test for it." as `single_file_change`
(0.82) once in two runs. Under PD-ORCH-006 that category grants the coordinator the direct-work bundle, so a feature and its
test would be worked by the coordinator alone, with no delegation. Nothing in the specification says that is wrong, and
nothing says the category means one file.

**What the build proceeds under.** The instructions are unchanged. `slice-proof` reads `single_file_change` as out of reach of
that prompt (its name, `lib/live-answers.mjs`) and asks once more on one such answer, going red on a second; the product is
held to nothing about it.

**What a ruling decides.** Whether `single_file_change` means an edit confined to one file (and the classifier is told so,
beside REQ-ORCH-006's three fixed meanings), whether a request that names a test beside its change is out of its reach,
and whether PD-ORCH-006's direct-work grant should follow the category or the size of the change.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** `single_file_change` SHALL mean a
small edit confined to one file, as the request states or implies. A request for a change together with a test of it, or
one that names several files to change, is outside the category unless the request puts all of it in one file. The
classifier's system prompt states this meaning on every rung. This is [`PD-ORCH-011`](../../../product/directives/pd-orch-011.md#pd-orch-011)
revision 2, which narrows REQ-ORCH-006. `PD-ORCH-006`'s direct-work grant keeps following the category, as REQ-ORCH-016
states, and `slice-proof` keeps its accepted sets and its single retry. The entry's status above ("Open.") is history.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended the one-file meaning as PD-ORCH-011 revision 2, one sentence in the system
  prompt, the grant left keyed to the category, and a first execution against the registered self-hosted endpoint: the
  identifier is on screen under REQ-ORCH-014, and the same prompt ran directly in one launch and delegated in the next.
- **Advocate B (the system's lens)** recommended the same, worded "a small edit confined to one file, as the request
  states or implies", with the micro group's glossary entry naming it: the system prompt goes out on every rung while only
  rung 2's example carried a meaning, and `slice-proof` already judged the product by a one-file meaning nothing in the
  record stated; B held that the live first execution needed the owner's fresh consent.

The ruling confirmed what both rest on: `CLASSIFIER_SYSTEM_PROMPT` goes out on every rung, only rung 2 carries the "one
file, one edit" example, and the 0.82 miss came through rung 1, so the category's meaning depended on which rung the
provider accepted. Letting the grant follow measured size would conflict with REQ-ORCH-008 and REQ-ORCH-016. It adopted B's
wording — "small" agrees with revision 1's "the two smallest edits" and keeps a large one-file rewrite out of micro — and
B's glossary step. On the first execution it followed A: R-068's standing authorization covers the unmetered self-hosted
default. The cost both name stays: a small change requested with its test now runs delegated and slower, and same-file test
languages depend on the request saying so.

*Built 2026-10-13 (fin34, `fin34-library-and-intent`); its first execution is reported in PD-ORCH-011's entry.* One sentence
in `CLASSIFIER_SYSTEM_PROMPT`, pinned on all three rungs by `intent.test.ts` (red before); `live-answers.mjs`'s `why` and
`intentOutcome` comment cite the revision; `packages/engine/CONTEXT.md`'s micro group names the meaning. Note moved:
[`the-intent-classifiers-rungs-give-single-file-change-different-meanings.md`](../../../defects/fixed/the-intent-classifiers-rungs-give-single-file-change-different-meanings.md).
**Not yet measured:** the live first execution (`pnpm slice-proof` against the registered self-hosted default), which the
orchestrator runs under R-068; it should show the flag prompt (3b) in the build groups and the README append in the micro group.

<a id="oq-232"></a>

**OQ-232 — When the loop classifier is cut on a raw-count trigger, are four consecutive calls of one tool evidence of a loop
whatever their arguments?** *(REQ-ORCH-104, the raw-count fallback's "≥ 4 consecutive same-tool calls — never from counts
alone"; REQ-NOTIFY-109, "back-to-back invocations of the same tool"; REQ-ORCH-101, the product's one comparison of two
actions, the tool name and the whole arguments; REQ-NOTIFY-102, no corrective message where no loop occurs; REQ-ORCH-100,
the raw count of 60; REQ-CONFIG-467 and OQ-114, the 2.0 s classification bound kept; OQ-126, the message limb. Raised
2026-10-07 from finding D6 of the final duress live run at `a68f121`, recorded in
[`the-raw-count-fallback-declares-a-loop-on-four-reads-of-different-files.md`](../../../defects/fixed/the-raw-count-fallback-declares-a-loop-on-four-reads-of-different-files.md),
and ruled the same day under the owner's delegation; the consortium's question D6.)*

The duress pack `2026-10-07T07-09-30-708Z` (session `e6747bd0`) holds the limb's first live firing. At
`wave2e-decisions`'s 60th call the classification (request 149) was cut at 1,915 ms, and the fallback found calls #229 to
#232: four `read_file` calls in two steps over `test/extra.test.js` and `docs/decisions.md`, a child checking its own
document. Timeline entry 43 (07:33:11.581, `trigger: raw-count`) told it "Pause and reassess read_file around
docs/decisions.md …", and the child spent request 150 (24.5 s, about 5 kB of reasoning) answering "nothing foreign — only my
own writes". The build compares the last four calls by tool name alone (ADR-0059 decision 5), as the text reads; the
specification does not say whether a read-only tool counts, or whether "same-tool" means the same action as REQ-ORCH-101's
repetition trigger does.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** when the loop classifier fails or
is cut on a raw-count trigger, REQ-ORCH-104's fallback counts four or more consecutive tool calls as evidence of a loop only
when they are the same action under REQ-ORCH-101 — the same tool name and identical whole arguments. Calls of one tool with
differing arguments count as counts alone, whatever the tool's facet, and no tool family is exempted. The message limb as
OQ-126 ruled it, the repetition, cycle and stuck rules, the deterministic message and the 2.0 s classification bound kept
under OQ-114 are unchanged. This is [`PD-ORCH-016`](../../../product/directives/pd-orch-016.md#pd-orch-016), which narrows REQ-ORCH-104 and
REQ-NOTIFY-109 (numbered 016: fin31's PD-ORCH-015 was assigned before it).

The two recommendations weighed, and the ruling followed **A**:
- **Advocate A (the user's lens)** recommended comparing whole actions by REQ-ORCH-101's rule, with no tool family exempted
  and the 2.0 s bound kept, as a directive narrowing both requirements: with this model every classification is cut, so the
  fallback's accuracy is what the user lives with, the limb's one live firing was false, and comparing whole actions covers
  reads and edits alike with a rule the product already has.
- **Advocate B (the system's lens)** recommended confirming the build: the text takes the tool as the unit, requiring
  identical arguments leaves the limb nearly redundant beside the repetition trigger, reading one file in shifting windows is
  the circling only this limb can see, and the cost — one step per three or four duress runs — is bounded.

The ruling agreed with B that the build is faithful, so a change needs a directive, and with both that no tool family is
exempted and the bound stays. On the limb it followed A: 9 of 9 classifications cut falsify ADR-0059's "activations are rare"
for this model, the one live firing was false, and the classifier's one late answer had judged a child's edits and
verification reads to be no loop. B's strongest point is the directive's stated cost: after the change the limb adds
evidence only where identical calls follow a pending raw-count trigger, and a single-tool loop with varied arguments is left
to the third activation's escalation, the stall watch or the ceiling.

*Built 2026-10-07 (fin32, `fin32-child-reports-and-limits`); its first execution is reported in PD-ORCH-016's entry.*
`rawFallbackHasEvidence` compares the last four tool events by `fingerprint`; `supervisor.test.ts` and `pnpm part-h-proof`'s
`raw-count-varied` and `raw-count-same` launches pin it. Beside the ruling, recorded and not repaired: the classification timer
is armed from `runtime.loop_classification_timeout` uncapped by REQ-NOTIFY-106's remaining budget
([`the-loop-classification-timer-is-not-capped-at-the-activation-budget.md`](../../../defects/fixed/the-loop-classification-timer-is-not-capped-at-the-activation-budget.md));
repaired 2026-10-13 (fin35): the bound is the smaller of the key and what remains of the 2 s budget, counted from the
activity that satisfied the trigger.
**Not yet measured:** a live run; the next should show no `loop_supervisor_activation` with `trigger: raw-count` unless the
agent's last three messages with text were normalised-equal or its last four tool calls were identical in name and whole
arguments.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** reached once, not
discriminating. The duress orchestrator's 60th call (`#300`, a `grep`) activated the supervisor; the classifier was cut at
1,994 ms by the activation budget, and the raw-count fallback found no evidence (three `read_file` calls on three windows and
the `grep`), so no `loop_supervisor_activation` was recorded and the run went on 2.02 s later. `#296` to `#299` were four
`read_file` calls, the case the ruling decided, but the trigger fell one call later. No default agent came near 60 calls.
Evidence: [`live-552d346-duress-autopsy.md`](../../../architecture/live-runs/live-552d346-duress-autopsy.md), [`live-552d346-default-autopsy.md`](../../../architecture/live-runs/live-552d346-default-autopsy.md), [`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).
