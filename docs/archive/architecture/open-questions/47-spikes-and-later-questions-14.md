# Archived open questions — Spikes, and the questions raised since (14 of 35)

The ruled, closed, resolved and withdrawn entries of [part 47](../../../architecture/open-questions/47-spikes-and-later-questions-14.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-216"></a>

**OQ-216 — Is the coordinator told which personas hold a terminal or a file-writing tool?** *(REQ-ORCH-028, a routing table
from need to role, with two capability clauses (`codebase-analyst` "reads the workspace but does not modify it", `librarian`
"likewise does not modify the workspace") and no persona's tools; REQ-TOOLS-001, the three facets every public tool declares;
REQ-TOOLS-006, the controls that narrow a grant; REQ-TOOLS-152, `delegate`'s fields; REQ-CONFIG-100, a configured
`system_prompt` replacing the built-in one; `PD-TOOLS-006` revision 3, which refuses a `write_scope` for a persona that holds
no file-writing tool and names the ones that do. Raised 2026-10-07 from the final live runs' findings L4 (the `c2fdd6a`
duress autopsy) and N3 with N2 (the `c2a9444` duress autopsy), recorded in
[`the-coordinator-is-not-told-which-personas-hold-a-terminal-or-a-file-tool.md`](../../../defects/fixed/the-coordinator-is-not-told-which-personas-hold-a-terminal-or-a-file-tool.md),
and ruled the same day under the owner's delegation; the consortium's question L4.)*

In both duress runs of 2026-10-06 the orchestrator briefed `docs-writer` children, which hold no `terminal`, to "Run
`node --test` yourself in the terminal". At `c2a9444` the two failed children (2,443.5 s of the critical path) spent 22 of
57 and 23 of 35 rows reasoning about the missing shell, one wrote `.tmp-run-tests.sh` as a workaround, and the answer to the
user said the continuation "ran the suite". At `c2fdd6a` the brief appeared twice, a child called a `run_command` tool that
does not exist, the coordinator wondered whether `verifier` had a shell, and the answer blamed the timeouts on the missing
shell. Each run spent 34 to 37 s on two `write_scope` refusals, `codebase-analyst` given a write task in both. Nothing the
coordinator reads states a persona's tools: the built routing table names roles, and `delegate`'s description was a fixed
list of the built-in names. The specification does not say whether the coordinator is told.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** `delegate`'s description is
built for each calling agent from the persona catalogue. It names every persona that agent can delegate to, with the
REQ-TOOLS-001 facets (reads workspace files, writes workspace files, runs commands) that a child of that agent would be
granted after REQ-TOOLS-006's controls, and it tells the caller to ask a persona only for work its tools allow; revision 3's
write-scope refusal stays as built. By [`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) revision 4, which already
extends REQ-ORCH-028 and narrows REQ-TOOLS-152: the symbol generator admits one directive per requirement for each
relation, so a new directive extending REQ-ORCH-028 could not be built. *(No longer so since 2026-10-13, [OQ-237](51-spikes-and-later-questions-18.md#oq-237): Extends
may repeat freely; the revision stays where it landed.)* Separately, the built routing table carries the two
capability clauses REQ-ORCH-028 states for `codebase-analyst` and `librarian`; that repair is covered by REQ-ORCH-028 and
needs no directive
([`the-built-routing-table-drops-req-orch-028s-capability-clauses.md`](../../../defects/fixed/the-built-routing-table-drops-req-orch-028s-capability-clauses.md)).

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended building `delegate`'s description per caller from the resolved catalogue,
  each persona with the facets its child grant would hold, telling the caller to brief a persona only for work its tools
  allow, recorded as `PD-TOOLS-006` revision 4 with the write-scope refusal kept. The ruling followed A on the vehicle and
  on the record: revision 4, not a new directive.
- **Advocate B (the system's lens)** recommended the same per-caller catalogue, generated from the same resolution that
  builds the child's grant, and found what A missed: the built routing table drops REQ-ORCH-028's own clauses for
  `codebase-analyst` and `librarian`, the role given write tasks in both runs. The ruling followed B on restoring the
  clauses as covered work, on the run host computing the facets from the child's own grant resolution (the engine and
  `agent-tools` do not import each other), and on the equality test between the catalogue and the grant a child receives.
  B's proposed new `PD-ORCH` directive was not followed, since the generator refuses it.

Both advocates rejected a refusal for this case: the request to run a command sits in free text, and REQ-TOOLS-001 never
infers a facet from prose. Both rejected the system prompt as the vehicle: REQ-CONFIG-100 replaces it whenever configuration
supplies one, and it cannot apply each caller's `tool_restrictions` (OQ-145). The statement is advice and enforces nothing;
whether it removes the impossible briefs is measured at the next duress live run.

*Built 2026-10-07 (fin27, `fin27-delegate-and-summariser`).* The routing table carries REQ-ORCH-028's two clauses (`ROUTING`,
`packages/engine/src/children/personas.ts`). `delegate`'s description is the caller's catalogue: `delegateCatalogue` and
`resolveAgentGrant` in `apps/desktop/src/run-host/tools.ts`, rendered by `renderDelegateCatalogue` in
`packages/agent-tools/src/tools/delegation.ts`. The first execution found nothing against the ruling and stated three readings
in `PD-TOOLS-006`'s report: the facets include what REQ-TOOLS-004's prerequisites remove (a run with no terminal backend
tells the caller no persona runs commands); `git_commit`, having no executor, never reads as a writer; the catalogue names
`orchestrator`, which the ledger accepts. Pinned by `delegation.test.ts`, `run-host/tools.test.ts` (each known role's facets
told equal to its child port's grant) and `personas.test.ts`. ~~**Not yet measured:** the duress live run that counts briefs
asking a persona without a terminal to run commands (2 to 3 per run before; target 0) and `write_scope` refusals (2 per run;
target 0).~~ **Measured 2026-10-07 at `a68f121` (the duress live run, session `e6747bd0`, finding D3):** the catalogue was in 35 of
35 coordinator requests; one `write_scope` refusal remained, against 2 per run before (`#115` gave `architect`
`docs/decisions.md`; the refusal answered in 170 ms naming the writers, and request 77 re-briefed a docs-writer in 19.4 s); one
impossible brief remained, against 2 to 3 before (`#114` offered `node --test` to a docs-writer, which called `run_command`,
`#164`, refused at the gate in a 2.5 s step; issues 3 and 4); 16 of 117 docs-writer requests carried a one-sentence missing-shell
aside, against 22 to 23 rows per failed child before; no stray file, no impossible brief on a failed child's path, and the answer
claimed no test run. The default run at `a68f121` chose by facet in 71 of 71 requests. **The target stands at 0, and its first
reading is falsified for revision 4 alone:** revision 4's catalogue did not by itself bring either count to zero, because the
routing table sent the work a route implies to the route's persona (the same task went to `codebase-analyst` at `c2fdd6a`, `#107`,
and to `architect` here). OQ-250 rules the next step, `PD-TOOLS-006` revision 8, measured against the same target.
~~The `write_scope` refusal target: 0 per run.~~ **Falsified 2026-10-13 and replaced by a bound ([OQ-257](55-spikes-and-later-questions-22.md#oq-257), ruled under
[R-072](../../../product/requests.md#r-072)):** at the duress run at `552d346`, with revision 8's routing sentence in 41 of 41 coordinator
requests, one refusal remained (`#92`, `architect` given `docs/decisions.md`, refused in 5 ms before any record and re-routed by the
next `delegate` 30.0 s later); a target of zero for one stochastic sample is replaced by an enforced, recovered bound — at most one
`write_scope` refusal for a non-writer per duress run, each refused before any record exists and re-routed by the coordinator's
next request. The impossible-brief target stays at 0 (0 at `552d346`).
~~At most one `write_scope` refusal for a non-writer per duress run.~~ **Falsified 2026-10-15 and replaced by a per-task bound
([OQ-331](63-spikes-and-later-questions-30.md#oq-331), ruled under [R-072](../../../product/requests.md#r-072)):** the duress run at `2fe0a837` refused two (`#105`,
`architect` given `docs/decisions.md`, re-routed 26.9 s later; `#231`, `verifier` given `docs/verification.md`, re-routed 15.9 s
later), one for each task of its request that routes to a non-writer. A run may have at most one refusal for each such task (two in
duress, zero elsewhere), each refused before any record and re-routed by the same agent's next `delegate` within 60 s, and no task
refused twice.

<a id="oq-217"></a>

**OQ-217 — What is the report summariser told of how the child ended?** *(REQ-ORCH-088, a timed-out child recorded failed
with a report of the form "Child timed out after <N>s"; REQ-ORCH-108, the report condenses what already happened;
REQ-ORCH-110, the pass's bounds and its fallback, silent on what the pass is given; REQ-ORCH-112, the report status mapped
to the terminal state; OQ-111, which gave the pass the run's deterministic facts; OQ-120, the facts' 12,000-character bound
keeping its head; `PD-ORCH-004`, the cut-off statement. Raised 2026-10-07 from the final live runs' findings L5 (the
`c2fdd6a` duress autopsy) and N5 (the `c2a9444` duress autopsy), recorded in
[`a-timed-out-childs-report-summary-reads-as-success.md`](../../../defects/fixed/a-timed-out-childs-report-summary-reads-as-success.md),
and ruled the same day under the owner's delegation; the consortium's question L5.)*

Two of the five timed-out children of the two duress runs got summaries that read as success beneath status `failed`:
"The agent completed the requested documentation task" (`c2fdd6a`) and "The agent reconciled documentation …" (`c2a9444`).
The pass is given the task, the most recent part of the transcript and OQ-111's facts, and not the status or the end
reason, which the run decides before the pass runs (`packages/engine/src/children/orchestration.ts`). The artifact copies
neither the errors nor `cut_off`, so the sentence is the only place on its paths a cause could stand. The specification
does not say what the pass is told of the outcome.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the report summariser is told how
a failed child ended. For every child the runner settles other than `succeeded`, the facts it is given open with an Outcome
line: the runner's status, its end reason as the run recorded it and, for a child cut off while making progress,
PD-ORCH-004's statement. The pass is asked to state that outcome in the summary's first sentence, then condense what the
agent did, and never to call the task completed. A succeeded child's request stays as it is, the no-model fallback stays as
REQ-ORCH-110 states it, and no summarising pass can raise a status the runner settled as failed. This fills REQ-ORCH-110's
silence on the pass's inputs, as OQ-111 did, and needs no directive: REQ-ORCH-088, REQ-ORCH-108, REQ-ORCH-110,
REQ-ORCH-112 and PD-ORCH-004 keep their text. The status guard brings the build into line with REQ-ORCH-088 and
REQ-ORCH-112 as written
([`the-summarising-pass-can-raise-a-failed-childs-report-status.md`](../../../defects/fixed/the-summarising-pass-can-raise-a-failed-childs-report-status.md)).

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended giving the pass the run's status and recorded end reason as one more
  runner-owned fact beside OQ-111's, the summary stating the outcome in its first sentence and then what the child did,
  the status staying the run's. The ruling took A's wording on what remained: the summary says what the transcript shows
  was left, and never claims more was left undone than it shows, since a timed-out child's work may be whole.
- **Advocate B (the system's lens)** recommended the same Outcome line at the head of the facts, so OQ-120's head-keeping
  cut never drops it, the plumbing for the cut-off statement, and a guard in `shape` so a pass can never raise a failed
  child's status. The ruling took all three. It departed from B on one point: a succeeded child gets no Outcome line,
  because the runner's `succeeded` means only that the turn ended with an answer, and stating it would invite a completion
  claim over a child whose answer was that it could not do the work.

Both rejected a label beside the summary (it leaves the false sentence stored), a run-written prefix or a separate reason
field (each needs a directive over REQ-ORCH-111 or REQ-LIBRARY-088), and confirming the behaviour as built. OQ-111 is the
precedent: its facts took report denials from 5 of 7 to 0 of 6 with this model.

*Built 2026-10-07 (fin27, `fin27-delegate-and-summariser`); its first execution, reported here as the ruling's record.*
`reportFacts` opens a non-succeeded child's facts with `outcomeLine`'s Outcome line, the ask gains the three sentences when it
is present, `shape` keeps a non-succeeded child's status, and `orchestration.ts` hands PD-ORCH-004's statement on as
`ReportInput.cutOffStatement` (`packages/engine/src/children/report.ts`, `orchestration.ts`). The first execution found
nothing against the ruling and settled two readings it left to the build. "Outcome: failed" is written with the status the
runner settled, since a cancelled child never reaches the pass (it takes the fallback) and `failed` is the only other status
a pass sees; and where the run recorded no end reason the line reads "Outcome: failed" alone, which a child whose turn
failed with no report of its own can produce. Unit cases in `report.test.ts` (the line and the instruction, the reasons'
words, the head kept past the 12,000-character bound, the status guard; each red on the code before) and the two PD-ORCH-004
cut-off cases in `children.test.ts` (the request a scripted run sends carries the line, with the statement and without it).
**Not yet measured:** the duress live run, which should show every failed child's summarising request opening its facts with
"Outcome: failed — Child timed out after 1200s" (and the statement where the child was making progress), each such stored
summary stating the limit in its first sentence and claiming no completion, every such report's status `failed`, and
OQ-111's count of zero denials holding.

*First live execution, 2026-10-07: the duress live run at `a68f121` (pack `2026-10-07T07-09-30-708Z` of the live worktree,
session `e6747bd0`; its autopsy's L5 verdict and finding D9), reported here with the repair it led to (fin32).* **It held.**
The two failed children, `wave3-verify-all` and its continuation `wave3b-finish-verification`, both cut off at the 1200 s
limit while making progress, were summarised from facts opening "Outcome: failed — Child timed out after 1200s." with the
cut-off statement; both stored summaries opened with the timeout and claimed no completion; both reports and both
`child_end` records read `failed`. **Two things were wrong beside it, neither in the ruling.** (1) wave3b's facts also read
"Edited files: (none)" over 11 `ok` edits through the code-intelligence EDIT tier, so its summary called the edits
"attempted": the Outcome line was right and the fact it sat beside was false — PD-ORCH-004's changed-paths reading (finding
D1), repaired by fin32
([`a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md`](../../../defects/fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md)).
(2) Both summaries opened "The run failed because the child [agent] timed out after 1200s …", and the timeline relayed them
as "Child wave3-verify-all reported failed: The run failed because …" (entries 74 and 98) while the session completed
`tasks_complete`: the sentence the ruling asked for read as the session failing (finding D9). **The repair, inside the
ruling:** the line now says whose outcome it is — "Outcome of this agent, not of the session: failed — Child timed out after
1200s." (`OUTCOME_HEAD`, `packages/engine/src/children/report.ts`) — and the ask names the agent, asks for the first sentence
as what happened to the agent ("This agent was stopped at its time limit while …"), and forbids opening with "The run failed"
or "The session failed", since the session may continue and succeed. The reading taken in the first execution above,
"'Outcome: failed' is written with the status the runner settled", is kept with its new head. Pinned by `report.test.ts`'s
case "OQ-217's first sentence is the agent's own outcome …" and the updated line cases there and in `children.test.ts`, red
on the wording before ([`a-timed-out-childs-summary-opens-as-if-the-run-failed.md`](../../../defects/fixed/a-timed-out-childs-summary-opens-as-if-the-run-failed.md)).
**Not measured:** a live run since the repair; it should show each failed child's summary opening with the agent and its own
outcome, and no "The run failed" on the timeline of a session that completed. The row is in
[`first-executions.md`](../../../architecture/first-executions.md).

*2026-10-13 (fin42, the survey's N50): the live measurement written, not run.* No live run had cut a child off since the
repair (the 552d346 duress pack: 0 failed children at a 2,700 s limit). `live-run.mjs`'s opt-in `cutoff` scenario sets the
Per-agent timeout to one minute through Settings and gives one child more work than that, then reads, for every child cut
off: the recorded summarising request carrying "Outcome of this agent, not of the session: failed — Child timed out after
60s." with the agent's name, the stored summary's first sentence stating the limit and not opening "The run failed", and no
`child_result` entry relaying "The run failed" when the session completed (`apps/desktop/scripts/lib/cut-off-reading.mjs`,
pinned by its test against the engine's `OUTCOME_HEAD`). It is the orchestrator's to run (`--only=cutoff`); a child the
limit never reaches is a NOTE there.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** the repair's live measure,
**NOT REACHED**. No child failed or timed out in any of the three packs, so no summarising request opened its facts with an
Outcome line and no timeline entry could read "The run failed". Found nothing, because nothing met the case. Evidence:
[`live-552d346-duress-autopsy.md`](../../../architecture/live-runs/live-552d346-duress-autopsy.md), [`live-552d346-default-autopsy.md`](../../../architecture/live-runs/live-552d346-default-autopsy.md), [`live-0bc3eee-default-autopsy.md`](../../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-214"></a>

**OQ-214 — Does a working child's 1200 s ceiling stay when a model that reasons before it answers fills each life with
generation?** *(REQ-ORCH-088, the child timeout and its expiry path; REQ-CONFIG-113, `runtime.child_timeout`, default 1200;
REQ-NOTIFY-100; REQ-MONITOR-121; REQ-ORCH-062 and REQ-TOOLS-156, which forbid a separate deadline on a wait because every
child is bounded; REQ-ORCH-093, each parent resume bounded by it; REQ-ORCH-144, the per-role stall threshold for slow
models; [`PD-ORCH-004`](../../../product/directives/pd-orch-004.md#pd-orch-004) revisions 1 to 5, R-048's limit kept and R-071's 30 s landing
(OQ-196). Raised 2026-10-07 from findings L1 of the orchestrator's duress live run at `c2fdd6a` (pack
`2026-10-06T16-02-48-699Z` of the live worktree) and N4 of its duress live run at `c2a9444` (pack
`2026-10-06T17-59-41-271Z`), the self-hosted reasoning model, and ruled the same day.)*

The two duress runs cut five working children off at the ceiling while each was making progress: at `c2fdd6a` d (reconcile),
e (decisions) and d2 (d's continuation), at `c2a9444` d (reconcile) and d-continuation. Each landed 0.39 to 26.7 s after the
ceiling (+7.3, +0.39, +26.7, +1.44, +7.23 s), none aborted; every report carried the cut-off statement and its changed paths;
the three that were not continuations carried revision 5's offer with its sentence, and the two continuations carried none
(read from the packs' `children` rows). Reasoning was 76 to 96 % of the children's output, mean steps 18 to 43 s. Of the eight
continuations made since 2026-09-29, five succeeded; the three that failed all continued the reconcile item. f succeeded at
1,087 s, 91 % of the ceiling. The children's time went largely to work other rulings own: d reasoned about a terminal it does
not hold in 22 of its 66 requests at `c2fdd6a` and its successor in 23 of 35 at `c2a9444` (L4/N3), d2 named `.serena`,
`.rotaris` or `.git` in 37 of its 45 requests (L3/N6, OQ-215), d-continuation met the empty file an undone create left (N2,
repaired, [`undoing-a-create-leaves-an-empty-file.md`](../../../defects/fixed/undoing-a-create-leaves-an-empty-file.md)), and e had a
complete file by minute five.

**What the build proceeds under.** `runtime.child_timeout`, default 1200 and minimum 1
(`packages/config/src/sections/runtime.ts`), handed to the run (`apps/desktop/src/run-host/configuration.ts`); the timer and
`CHILD_LANDING_GRACE`, the run's one 30 s allowance (`packages/engine/src/children/orchestration.ts`); one continuation, never
chained (PD-ORCH-004).

**What a ruling decides.** Whether the default rises, the ceiling extends while the child makes progress, the ceiling scales
with the model, a continuation may be chained or longer, or the ceiling stands as R-048 and R-071 left it.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the working child's ceiling stays
as ruled. `runtime.child_timeout` keeps its 1200 s default and its hard bound with the 30 s landing, a piece of work is
continued once and never chained, and PD-ORCH-004 (revisions 1 to 5), R-048 and R-071 stand unrevised. The five cut-offs of the
2026-10-06 duress runs were each handled as written and are reported back into PD-ORCH-004 as revision 5's live execution.
The question reopens on new evidence: either (a) once the marker-directory (L3/N6, OQ-215) and personas'-tools (L4/N3) rulings
are built, a live run cuts off both a child and its continuation while each spent more than half its requests on its own task,
or (b) any child of a default live run reaches the ceiling. **The measure for (a)** is the autopsy's per-request
classification as L1 and N4 counted it: a request counts as off-task if its reasoning addresses a tool the child does not hold,
the code-intelligence marker directory, or a file outside its brief; on-task otherwise. **The two recommendations weighed:**
advocate A (the user's lens) recommended confirming the ceiling as built, since the long children were circling problems more
time would only multiply, and reporting the two runs back into PD-ORCH-004 with a two-lives reopening test; advocate B (the
system's lens) recommended the same confirmation, since REQ-TOOLS-156, REQ-ORCH-062 and REQ-ORCH-093 rely on the hard bound,
PD-ORCH-004's progress test passes a looping child and the model did not predict the hits, with a reopening criterion measured
per request. The ruling followed **both**: A's report-back, made mandatory by revision 5's "evidence owed", and A's two-lives
test measured by B's per-request count. Two facts stay on record as risk: f succeeded at 91 % of the ceiling, and no surface
presents the setting (REQ-MONITOR-286), which is OQ-218's question. **Recorded 2026-10-07 (fin27):** no code, test, view or
specification text changed; PD-ORCH-004's report-back and its row in `first-executions.md` are written. Findings L1 and N4
close as ruled.

**Reopened and ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** reopened under
condition (a) by finding D2 of the final duress live run at `a68f121` (pack `2026-10-07T07-09-30-708Z` of the live worktree,
session `e6747bd0`), the first duress run after the marker-directory (OQ-215) and personas'-tools (OQ-216) rulings were built.
The 1200 s ceiling cut off the verifier `wave3-verify-all` and its continuation `wave3b-finish-verification`, both testers
working on their own task: by the measure above, wave3 spent 45 of its 58 requests (78 %) and wave3b 33 of 47 (70 %) on its
own task, even counting every request that so much as mentions the marker directory as off-task. Both were making progress —
their last calls completed 1.5 s and 8.8 s before the ceiling — and both landed inside the 30 s bound, at +4.25 s and +0.44 s,
running an edit; reasoning was 75 % and 90 % of their output. The verification took 2,526.3 s, 60.7 % of the run's 4,162.6 s,
for a deliverable two `failed` children held. The longest child of the same model's default pack lived 204.4 s, and e finished
at 88 % of the ceiling.

**The ruling:** the working child's ceiling stays as the owner ruled it. `runtime.child_timeout` defaults to 1200 s and is a
hard bound with the 30 s landing, and a piece of work is continued once and never chained. PD-ORCH-004 (revisions 1 to 5),
R-048, R-071 and PD-CONFIG-003 stand unrevised, because R-072 delegates open questions and does not reach a clause the owner
has already decided: R-048's "the limit itself is not raised" and R-071's "never longer" are the owner's, so a raised default,
an extension while the child makes progress, a per-model figure or a chained continuation would each reverse one of them, and
each goes to the owner as a recommendation. For long work on a slow reasoning model the relief is
[`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003)'s Per-agent timeout: the duress live harness sets it to 45 minutes for
its own launch, as such a user would, and records that value (`LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN`). The question reopens under
**(a′)** a duress run with the Per-agent timeout at 45 minutes cuts off a child that spent more than half its requests on its
own task, measured as above; or **(b)**, unchanged. Either sends any raise of the default, or any softening of the bound, to the
owner as a recommendation in `docs/product/requests.md`; the consortium rules only inside the owner's rulings.

**The two recommendations weighed, and the ruling followed both.** *Advocate A (the user's lens)*: confirm as built; the duress
harness, acting as a user on a slow reasoning model, sets the Per-agent timeout to 40 minutes, the product default when the
variable is unset; R-071's premise written down beside its new count; any change to the default the owner's. *Advocate B (the
system's lens)*: confirm as built; the harness sets it to 45 minutes by default, `=20` re-measuring the default, checking that
the setting took effect; condition (a) replaced by (a′) measured at the raised value. The ruling took B's 45 minutes —
PD-CONFIG-003's first execution drove exactly 2,700 s through Save to the run host, while 40 minutes barely covers the 2,345 s
the two lives generated — and B's harness default; and A's NOTE, the unit-tested rewrite of the stored value, and R-071's
premise kept beside its new count (5 of 9). On the merits both agreed: no signal the product can read separates on-task wave3
from off-task d2 at `c2fdd6a` (both passed PD-ORCH-004's progress test and both wrote late), REQ-ORCH-062 and REQ-TOOLS-156
rely on the hard bound, and no default-pack child came near the ceiling.

**Recorded 2026-10-07 (fin32).** No product code, specification text or view changed. The harness:
`apps/desktop/scripts/lib/runtime-key.mjs` (`withRuntimeKey`, `runtime-key.test.ts`), which faults-args' stall-threshold rewrite
now uses too; the duress launch writes `runtime.child_timeout: <min×60>` into the workspace's `agents.yaml`, copies it to
`duress/agents.yaml` in the pack, restores the original after, checks the run host's `child_timeout=<s> s`, records
`childTimeoutS` in `results.json` and NOTEs any value but 1200; a value outside 1–240 stops the harness before any launch.
`AGENTS.md` carries the recipe (`LIVE_RUN_DURESS_MS=7800000`). PD-ORCH-004 gains the second live execution of revision 5 and its
reaffirmation; PD-CONFIG-003's "not measured" item names the next duress run as its measurement. Finding D2 and this
question's reopening measure (the a68f121 autopsy's first-execution list) close as ruled. **Not yet measured:** the next duress
live run, the harness change's first execution — its `app.log` should read `child_timeout=2700 s`, `results.json` carry
`childTimeoutS: 2700` with the NOTE, and the pack hold `duress/agents.yaml`; a wave-three child may then work past 20 minutes,
finishing in one life or cut off at 2,700 s plus at most 30 s and handled as PD-ORCH-004 says; its autopsy reports each child's
lifetime, any compression inside a child, any parent resume, and whether a cut-off child spent more than half its requests on
its own task (condition a′). The question of whether a child cut off at its per-agent timeout names the Settings control where
the person sees the failure is raised and ruled on its own, not here: [OQ-234](50-spikes-and-later-questions-17.md#oq-234), ruled as
[`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003) revision 3.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** the harness change's first
execution, read from the duress pack. `duress/app.log` read `child_timeout=2700 s` (lines 13 and 31), `results.json` carried
`childTimeoutS: 2700` with its NOTE, and the pack holds `duress/agents.yaml`. Each child's life: a 208.5 s, b 150.2 s, c 123.0 s,
d 449.2 s, e1 547.9 s, e2 389.9 s, **f1 1,253.2 s**, f2 515.3 s. No child was cut off, none compressed inside its life (the largest
child prompt 55,449 tokens), no parent resumed, and condition a′ does not apply. f1, the verifier, is the case the raise was
for: 1,217.2 s of its 1,253.2 s generating, ten steps over 45 s, its last step landing at +1,221.5 s; at the 1,200 s default
the ceiling falls inside that step and the child would have ended `failed`, the third duress verifier to do so. What the raise
costs elsewhere is not shown: only f1 crossed 1,200 s. Evidence: [`live-552d346-duress-autopsy.md`](../../../architecture/live-runs/live-552d346-duress-autopsy.md). The row is in [`first-executions.md`](../../../architecture/first-executions.md).
