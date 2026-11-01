# Archived open questions — Spikes, and the questions raised since (10 of 35)

The ruled, closed, resolved and withdrawn entries of [part 43](../../../architecture/open-questions/43-spikes-and-later-questions-10.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-192"></a>

**OQ-192 — The sessions card's rows carry a token label, a duration label and a detail caption, which the listing
record's closed field set does not hold.** *(REQ-MONITOR-171, each sessions-card row carries "a detail caption, … the
branch, a token label, and a duration label"; REQ-SESSION-030, the listing record "MUST hold exactly these fields" and
"Every attribute a listing shows about the session itself MUST be one of these — making a new attribute list-visible is a
change to this field set, not a reader-side extension"; REQ-SESSION-042, "Building the list MUST read nothing but those
listing records". Raised 2026-10-03 by
[`the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md`](../../../defects/fixed/the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md)
(fin11, bundle `fin11-strip-labels-and-auxiliary-windows`). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the three labels stay on the card, and the listing record's field list gains the token total, the run start time and the workspace path. The duration label is the latest run's, as built. [`PD-SESSION-001`](../../../product/directives/pd-session-001.md#pd-session-001) narrows REQ-SESSION-030. [`the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md`](../../../defects/fixed/the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md), whose checkpoint half closed on 2026-10-03, closes with this ruling.

REQ-SESSION-030's twelve fields are `session_id`, `created_at`, `updated_at`, `execution_status`, `schema_version`,
`internal`, `worktree`, `checkpoint_count`, `task_title`, `requirement_id`, `unit_id` and `awaiting_input`. None is a token
total, a duration or a caption, and the requirement forbids showing any attribute of the session that is not one of them.
REQ-MONITOR-171 requires each row of the Overview's sessions card to show all three. The branch is not in the
disagreement: it is the `worktree` binding record's. Neither requirement names the other, and no directive governs either.

**What the build proceeds under** (`Sessions.list`, `packages/engine/src/sessions.ts`; the sessions card,
`packages/ui/src/OverviewView.tsx`): REQ-MONITOR-171's row, drawn from columns of the same session row the listing record
is read from, so building the list still reads one row per session and nothing else of the session's: the token label is
`tokens_input + tokens_output`, the duration label is `durationLabel(run_started_at, …)` and the detail caption is
`workspace_root`. No transcript, state or history is read for them.

**What a ruling decides.** Whether the three labels stay on the card (and REQ-SESSION-030's field set gains them, the
"change to this field set" it names), or leave it (and REQ-MONITOR-171 is amended).

*(Added 2026-10-06, a case of the duration label, from finding G8 of the orchestrator's final default live run at `27a5127`
([`fixed/a-continuations-run-timing-starts-after-its-pre-flight-where-a-launchs-counts-it.md`](../../../defects/fixed/a-continuations-run-timing-starts-after-its-pre-flight-where-a-launchs-counts-it.md)).
The label is the latest run's duration: for a session paused and continued it leaves the first run out (the live run's
`resume` session ran 87.7 s over two runs; its label counts the continuation alone, 64.9 s once that repair counts the
continuation's pre-flight). Neither REQ-SESSION-154 ("a relative-time duration label") nor REQ-MONITOR-171 ("a duration
label") says whether it is the latest run's or the session's. What the build proceeds under is unchanged: the latest run's,
`durationLabel(run_started_at, …)`. What a ruling adds, if the label stays: which of the two it is.)*

<a id="oq-193"></a>

**OQ-193 — What does the status strip's branch item show on a detached HEAD, outside a repository and before the first
read: REQ-GIT-161's conveyed states, or REQ-WORKSPACE-020's empty item?** *(REQ-GIT-161, the item "SHALL convey that the
checkout is on no branch when the workspace, or the focused session's worktree, is on a detached HEAD, and SHALL convey that
there is no branch to show when the folder is not a Git repository at all — a state distinct from a repository whose branch
could not be read", each "distinguishable from an ordinary branch name and from the other"; REQ-WORKSPACE-020, "The item
SHALL render as empty text — no icon, no arrow, no tooltip — exactly when the snapshot's branch name is empty, which per
REQ-WORKSPACE-029 covers git being unavailable, the folder not being a repository, a detached HEAD, and an unborn branch";
REQ-SHELL-042, which owns the item and names neither state. Raised 2026-10-03 by the repair of
[`the-status-strips-branch-item-has-no-branch-icon-and-its-tooltip-no-full-stop.md`](../../../defects/fixed/the-status-strips-branch-item-has-no-branch-icon-and-its-tooltip-no-full-stop.md)
(fin11, bundle `fin11-strip-labels-and-auxiliary-windows`). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the visible words and tooltips stay as built, and REQ-WORKSPACE-020 is amended to match them: `detached HEAD`, `no git repository`, `no git` and `—` before the first read, each with its tooltip and no icon. The base checkout's tooltip keeps its full stop and its singular or plural commit wording as built, REQ-GIT-122's form read as a template of them. [`PD-WORKSPACE-008`](../../../product/directives/pd-workspace-008.md#pd-workspace-008) narrows REQ-WORKSPACE-020 and REQ-GIT-122. [`the-status-strips-branch-item-has-no-branch-icon-and-its-tooltip-no-full-stop.md`](../../../defects/fixed/the-status-strips-branch-item-has-no-branch-icon-and-its-tooltip-no-full-stop.md) closes with this ruling. The ruling does not reach two states this entry never named: an unborn branch, and a repository whose branch could not be read. REQ-WORKSPACE-020's empty item (and, for the unreadable branch, REQ-GIT-161's empty value) still governs them, and the build departed there: it drew the branch icon, `—` and the tooltip "Branch this workspace is on: —.", as if `—` were a branch's name. Found by the verifier of this round and recorded, not repaired, in [`the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md`](../../../defects/fixed/the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md); repaired by fin22 the same day, the item now REQ-WORKSPACE-020's empty item in both states.

REQ-GIT-161 requires a detached checkout and a non-repository to be conveyed, each in words or markers distinct from a branch
name and from each other, and a repository whose branch could not be read to take REQ-GIT-112's empty value. REQ-WORKSPACE-020
requires the item to be empty, with no tooltip, in exactly those cases (and for git being unavailable and an unborn branch).
One item cannot do both. Neither requirement names the other, and no directive governs either.

**What the build proceeds under** (`branchStripItem`, `packages/ui/src/GitView.tsx`; `stripItems`,
`packages/ui/src/composer.ts`): REQ-GIT-161's words, unchanged by this repair. A detached HEAD reads `detached HEAD` with the
tooltip "This workspace is on no branch (detached HEAD)."; a folder that is not a repository reads `no git repository`
("This folder is not a Git repository."), and with git unavailable `no git` ("Git is not installed or not on PATH."); before
the first read the item reads `—` ("Branch this workspace is on: not read yet"). The detached and absent states are set in
italics. None of these draws REQ-SHELL-042's branch icon, which is drawn only before a branch name.

Two readings recorded beside it, which a ruling may revisit: the base checkout's tooltip ends with REQ-WORKSPACE-020's full
stop ("Branch this workspace is on: main.", "…, 1 commit ahead.", "…, {n} commits ahead."), since REQ-SHELL-042 leaves the
wording to the implementation; and REQ-GIT-122's backticked `Branch this workspace is on: <branch>` with `, N commit(s)
ahead` is read as a template rather than a literal, since REQ-SHELL-044 forbids rendering `(s)` as written.

**What a ruling decides.** Which requirement's treatment of the detached, non-repository, git-unavailable and unread states
stands for the strip's branch item, and an amendment to the other.

<a id="oq-194"></a>

**OQ-194 — Which root do REQ-MCP-035's filesystem fill-in, REQ-MCP-043's default working directory and REQ-MCP-070's
`lsp_init` call name for a run in an isolated working tree?** *(REQ-MCP-034, "For a run against an isolated working tree,
the appended path SHALL be that tree's root"; REQ-MCP-035, "with no path arguments, the workspace root SHALL be appended";
REQ-MCP-043 and REQ-MCP-050, `cwd` "the entry's configured value, or the workspace root when unset"; REQ-MCP-070, `lsp_init`
"called once with the arguments `{"root": "<workspace_root>"}`". Raised 2026-10-03 by the repair of
[`fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md`](../../../defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md)
(fin12, bundle `fin12-worktree-bound-code-intelligence`). Open until 2026-10-06; ruled then, below.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** as recommended, for a run in an isolated tree
REQ-MCP-035's fill-in, the default `cwd` of REQ-MCP-043 and REQ-MCP-050, and REQ-MCP-070's `lsp_init` root all name the
tree's root, by extending the rebinding that already moved REQ-MCP-034's project path; only what the product filled in
moves, and a path or `cwd` the user configured stays. Minted as [`PD-MCP-002`](../../../product/directives/pd-mcp-002.md#pd-mcp-002), which
narrows REQ-MCP-035, REQ-MCP-043, REQ-MCP-050 and REQ-MCP-070, and built under it (fin21).

REQ-MCP-034 names the isolated tree's root for the one path it appends. The three neighbouring rules say "the workspace root"
and say nothing of an isolated run, while the requirements domain separates the anchoring workspace (where the record stays)
from the root a run executes in (REQ-WORKSPACE-050, REQ-GIT-140). Read literally, a filesystem server carried by a persona of
an isolated run is pointed at the main checkout — the escape REQ-MCP-034's clause closes for code intelligence — and a server
named `lsp` is initialised on it.

**What the build proceeds under** (`mcpConfigurationForExecutionRoot`, `packages/config/src/mcp/index.ts`; the tool port's
`ready()`, `apps/desktop/src/run-host/tools.ts`): the literal reading. Only the path REQ-MCP-034's stage appended is
rebound to the tree's root; REQ-MCP-035's fill-in and the default `cwd` stay the workspace root, and the session's
connections keep the workspace root for `lsp_init`. The shipped configuration carries no filesystem server and no server
named `lsp`, so nothing a default run launches is affected.

**What a ruling decides.** Whether "the workspace root" in REQ-MCP-035, REQ-MCP-043/050 and REQ-MCP-070 reads as the run's
execution root for an isolated run (an amendment naming it, as REQ-MCP-034 does), or stays the anchoring workspace.

<a id="oq-196"></a>

**OQ-196 — How long may a child at its time limit take to finish the model step in flight, and what is kept when that bound
is reached?** *(REQ-ORCH-088, on expiry "gracefully pause the child", narrowed by `PD-ORCH-004`; REQ-MONITOR-123, a pause
"finishes its current step and then stops", narrowed by `PD-ORCH-005` revision 2; REQ-CONFIG-131's
`graceful_pause_tool_deadline`, which bounds in-flight tool calls only; REQ-CONFIG-113's `child_timeout`, the "hard per-child
wall clock". Raised 2026-10-03 from finding U1 of the orchestrator's duress live run at `1763f7f`
([`a-child-at-its-ceiling-has-the-model-step-in-flight-aborted-30-s-later.md`](../../../defects/fixed/a-child-at-its-ceiling-has-the-model-step-in-flight-aborted-30-s-later.md)).
~~Open, the owner's.~~ **Ruled 2026-10-06.**)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current bound stays and is written down — what a child has in
flight when its `child_timeout` expires has at most 30 s to end and is then aborted, so the child's time limit stays hard;
of a model step so cut, its streamed reasoning is kept in the transcript and nothing else of it is kept. As built; by
[`PD-ORCH-004`](../../../product/directives/pd-orch-004.md#pd-orch-004) revision 5, with back-pointers at REQ-ORCH-088 and REQ-CONFIG-113.

The duress run of 2026-10-03 (pack `2026-10-03T06-15-52-273Z`, endpoint `katalyst`, a model that reasons before it answers)
had two children reach the 1200 s ceiling, each in the middle of a model step. The ceiling asked each to land; the landing
backstop aborted each step at exactly ceiling + 30.0 s — traffic #100 after 115.4 s and traffic #186 after 87.0 s, 202.4 s of
generation in all. Neither step had produced text or a tool call. Their streamed reasoning stayed in the transcript as
`thinking` rows; nothing of either reached the child's conversation, its report or its continuation. #186's reasoning ended
"Now let me write docs/verification.md"; the continuation that then wrote the file took 746 s. At `71ad8e8` all three
landings finished their step. Both children were continued once and both continuations succeeded.

The specification asks for a graceful pause and a hard ceiling, and states one bound between them for tool calls alone.
A model step's landing has none, and single steps of the two cut-off children took up to 131.9 s in this run, four times
the 30 s the build allows.

**What the build proceeds under** (`CHILD_LANDING_GRACE` in `packages/engine/src/children/orchestration.ts`, which is
ADR-0014 rule 1's one 30 s allowance, `STOP_GRACE` in `packages/engine/src/run/grace.ts`): the current behaviour, unchanged
until the owner rules. At the ceiling the turn stops before its next model step, and a step in flight then has 30 s to end;
at that bound it is aborted, and its partial output reaches nothing but the transcript's reasoning rows. The report is
built from the last assistant message that carried text, the child ends `failed` with REQ-ORCH-088's timeout report, and
`PD-ORCH-004`'s cut-off lines and continuation offer follow where it was making progress.

**What a ruling decides.** How long a model step in flight at the ceiling may run to land — the same 30 s, the configured
`graceful_pause_tool_deadline`, a bound of its own, or until the step ends — and what is kept when the bound is reached:
nothing, as now; the step's partial text or reasoning in the child's report; or the partial step handed to the
continuation. A longer landing pushes back the ceiling REQ-CONFIG-113 calls hard, so either answer changes a requirement
or a directive; neither is a repair.

*Recorded 2026-10-06 (fin20, `fin20-continue-and-continuation`).* No code changed. The bound is reported back into
[`adr/0012-the-delegated-child-scheduler.md`](../../../architecture/adr/0012-the-delegated-child-scheduler.md) and beside `CHILD_LANDING_GRACE`,
where its reason promised a report, and the note is closed as ruled as built.

<a id="oq-197"></a>

**OQ-197 — Does a write of the permission mode that leaves the file's value unchanged displace an unsaved Settings
selection?** *(REQ-CONFIG-423, "for this one field the last write wins over an unsaved selection on this screen" and "a
change to the same field made while Settings is open by any other surface … lands in that pending state"; REQ-CONFIG-420, a
refresh never discards an edit in progress "with the single exception REQ-CONFIG-423 states for the permission-mode field,
where a mode already applied to a live run displaces an unsaved selection"; REQ-CONFIG-288, the composer's control writes
that key alone. Raised 2026-10-03 by the repair of
[`fixed/a-permission-mode-written-elsewhere-loses-to-an-unsaved-settings-selection.md`](../../../defects/fixed/a-permission-mode-written-elsewhere-loses-to-an-unsaved-settings-selection.md)
(fin13, bundle `fin13-settings-last-write-and-record-pointers`), as OQ-196, and renumbered OQ-197 at its merge of
`origin/main` because the landing-grace question had taken OQ-196 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current behaviour is kept: only a change of the saved permission mode displaces an unsaved Settings selection, and a write that leaves the file's value unchanged keeps it, as every other field's edit is kept. REQ-CONFIG-423's "last write" is read as a write that changes the field's value, as its own "a change to the same field" and REQ-CONFIG-420's exception have it, so `config:changed` keeps its contract and no directive is minted.

The screen learns of a write made elsewhere only from the reloaded snapshot main announces after it, and a snapshot carries
values, not the writes that produced them. Settings holding an unsaved `plan` over a saved `ask`, the composer writing `ask`
(the value the file already holds) yields a snapshot identical to the one a sign-in's reload yields; the two cannot be told
apart on the screen. REQ-CONFIG-423's "last write" read literally would have the composer's `ask` displace `plan`; its
"change to the same field" and REQ-CONFIG-420's "a mode already applied … displaces" read as a change of the value.

**What the build proceeds under** (`rebasePending`, `packages/ui/src/settings/config-state.ts`): a change of the value. A
reloaded snapshot whose permission mode differs from the one the screen last saved displaces the unsaved selection; one whose
mode is unchanged keeps it, as every other field's edit is kept (REQ-CONFIG-420). The composer shows the file's mode in that
case and Settings the unsaved selection until it is saved or discarded.

**What a ruling decides.** Whether a write of the unchanged value must also displace the selection — which would need the
announcement to name the key a `config.setField` wrote (a contract change on `config:changed`) — or whether the change
reading stands.

<a id="oq-198"></a>

**OQ-198 — Does `explicit_trivial` reach a request that changes nothing, and may the tie-break choose `moderate_feature`
where no build is plausible?** *(REQ-ORCH-006, which names `explicit_trivial` without a meaning and fixes only
`problem_resolution` ("diagnose AND fix"), `exploration` ("investigate only") and the tie-break ("when several categories
are plausible the tie-break prefers `moderate_feature`"); REQ-ORCH-021, which groups `explicit_trivial` with
`single_file_change` (micro) and apart from `question` and `exploration` (answer); REQ-ORCH-153, whose plan gate exempts the
answer group alone. Raised 2026-10-04 by the repair of
[`fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`](../../../defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md)
(fin15, bundle `fin15-slice-proof-live-answers`). ~~Open, the owner's.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** `explicit_trivial` means a small edit, and the tie-break chooses only among the plausible categories, so a request that changes nothing belongs to the answer group. [`PD-ORCH-011`](../../../product/directives/pd-orch-011.md#pd-orch-011) narrows REQ-ORCH-006. The classifier's instruction is unchanged, and `slice-proof` now expects the answer group alone for its question (`INTENTS` in `apps/desktop/scripts/lib/live-answers.mjs`, pinned by `live-answers.test.ts`).

Against the registered self-hosted endpoint (`katalyst`, a model that reasons before it answers), the product's classifier
answered "What is the first heading of README.md?" with `question` in eight of the nine runs of 2026-10-03 that reached
it (runs 1, 3 and 5 to 10; run 2 went red before it), and with `explicit_trivial` (0.99, by the strict schema, no fallback)
in one, run 4. Every run of 2026-10-04 whose evidence this session keeps answered `question`. *(Corrected 2026-10-04 at the repair round:
this paragraph first said "five of the six runs … (runs 1, 3, 5, 6 and 7)", counting only the first seven runs' evidence
and missing runs 8, 9 and 10, which the record of
[`fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`](../../../defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md)
keeps.)* The product's own classification instruction calls
`explicit_trivial` and `single_file_change` "the two smallest edits" (`packages/engine/src/intent/classifier.ts`), but no
requirement does. The name says an explicit, trivial request, and a one-line question about one file is that. The group says
an edit. The two readings route the run differently. Under REQ-ORCH-021 the question takes the micro group's playbook
cells instead of the answer group's. In `plan` mode REQ-ORCH-153 holds it at the plan gate, which exempts the answer group
alone.

The tie-break leaves a second question. Read as a tie-break, it chooses among the categories that are plausible, so it never
brings `moderate_feature` into reach of a prompt no build is plausible for. Read literally, any prompt for which several
categories are plausible (the README question is one, on the first question's broader reading) should be classified
`moderate_feature`. The classification instruction passes the sentence on to the model in those words.

**What the build proceeds under.** The product classifies as it does; nothing here is a defect of the code. `slice-proof`
(`INTENTS` in `apps/desktop/scripts/lib/live-answers.mjs`, each prompt with its reason) accepts `explicit_trivial` for the
README question, because no requirement keeps it out. It reads the tie-break as a choice among the plausible categories, so a
`moderate_feature` that is not a fallback is still a red for the question and for the one-line append.

**What a ruling decides.** Whether `explicit_trivial` is meant for edits alone. If it is, a requirement says so, the
proof accepts the answer group alone for the question, and the classifier's instruction stays as it is. If it is not, the
instruction stops calling it an edit. A ruling also decides whether the tie-break may reach outside the plausible set.

<a id="oq-199"></a>

**OQ-199 — May a run complete when its entry role ended without writing an answer?** *(REQ-ORCH-069, the run stops with
`tasks_complete` once every non-abandoned task is completed; REQ-ORCH-113, the completion classifier; REQ-ORCH-115, which
skips that classifier for reports attributed to the coordinator role; REQ-ORCH-079, relentless mode (default off), the only
check that compares the outcome with the request; REQ-TOOLS-180, a run terminates when the agent produces a message
addressed to the user and requests no tool call in that turn; REQ-ORCH-095, a child's ending assessed into six categories,
tool calls made counting as `work_performed`. Raised 2026-10-04 by the repair of
[`fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`](../../../defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md)
(fin15, bundle `fin15-slice-proof-live-answers`). ~~Open, the owner's.~~ **Ruled 2026-10-06.**)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** an execution iteration's entry role that ends its turn with neither
text nor a tool call is asked once more to answer, in its own conversation, as a delegated child is re-prompted; if it
still writes nothing, the run completes as before and the person is told it ended without an answer (a transcript row and
a warning `incomplete_execution` issue). A plan cycle's root is not asked. By
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009), which extends REQ-ORCH-069.

Run 2 of `slice-proof` on 2026-10-03 (`katalyst`, load 2.5) asked "Read README.md in this workspace and tell me its first
heading, in one sentence." The intent was `question`. The orchestrator read `README.md` and globbed the workspace, both calls
settled, and then ended its turn with reasoning and no text. Its reasoning addressed requests the run never made: a list of
the installed skills, and a test suite under `src/core/parser.ts`. Neither string occurs in the product's prompts. The run
ended `completed` (`tasks_complete`) after 22 s. The transcript holds the person's message, three reasoning groups, two reads
and "The run completed." It holds no answer. The product did what the requirements say: the iteration ended, its task was
done, REQ-ORCH-115 skipped the completion classifier for the coordinator's report, and REQ-ORCH-069 stopped the run. No
requirement says a run that was asked a question must answer it before it completes. REQ-TOOLS-180 names the turn that
terminates a run (a message to the user and no tool call) and is silent on a turn with neither; the build reads it as the
condition that hands a message on, not as the only turn that may end a run. REQ-ORCH-095 assesses a delegated child's
ending, and the root execution record is not one (REQ-ORCH-072); even read across, two settled reads are
`work_performed`, which it accepts without a re-prompt
(`packages/engine/src/children/orchestration.ts`, where a re-prompt follows only an ending with no call and no text).

**What the build proceeds under.** The run completes as it did. `slice-proof` reports such a run as the model's, keeps its
evidence (`run.attempt-1.log`, `.png` and `.json`: the session, the row kinds, the reasoning; copied into
`.proof/slice-proof-answerless/`, where the next run does not remove it) and runs scenario 3 once more.
The second run is held to every check, and a second answerless run is a red that names both
(`answerlessCompletion` in `apps/desktop/scripts/lib/live-answers.mjs`).

**What a ruling decides.** Whether an entry-role turn that ends with neither text nor a tool call should be told so and
continued, re-queued as `partial`, or reported to the person as a run that ended without an answer, rather than completing.
Each would add to REQ-ORCH-069, REQ-ORCH-113 or REQ-ORCH-115, so each is a revision or a directive, not a repair.

*Built 2026-10-06 (fin20, `fin20-continue-and-continuation`).* `Run.turn`'s follow-up (the one REQ-ORCH-078's correction
uses, `runWithChildren`'s `followUp`) sends `ANSWER_REPROMPT` once when the root's turn returned `succeeded` with empty text
and the run is not stopping, pausing or coming to rest (`correctionDue`), before any plan correction; a turn that still
returns empty text writes "The run ended without an answer: <role> ended its turn without writing one, even when asked
once more." as a `system` row and an `incomplete_execution` warning issue. Pinned by
`packages/engine/src/run/answerless.test.ts` (two of its three cases red before). `slice-proof`'s answerless rerun
(`answerlessCompletion`) is unchanged: an answerless run is now one whose root stayed silent after the re-prompt too, and
its transcript says so. *Corrected before landing (the verifier's review):* the row is written where what follows the
iteration is known (`Run.tellUnanswered`) — "The run ended without an answer: …" only when the run ends after it, and
"Iteration <n> ended without an answer: …" when the run goes on, parks or only pauses — and only the turn the re-prompt led
to is read, so a later plan correction's silent turn does not count; pinned by two more cases in `answerless.test.ts` and
one in `coordinator-plan.test.ts`, each red on the first form (PD-ORCH-009's first-execution report).
