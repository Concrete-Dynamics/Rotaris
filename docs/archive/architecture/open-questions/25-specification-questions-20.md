# Archived open questions — Specification questions (20 of 27)

The ruled, closed, resolved and withdrawn entries of [part 25](../../../architecture/open-questions/25-specification-questions-20.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-114"></a>

**OQ-114 — Do the specification's fixed figures still hold when the model on the critical path reasons before it answers?** *(REQ-ORCH-108 and REQ-ORCH-110, the report-producing pass before the parent resumes, two attempts within 120 s; REQ-ORCH-007 and REQ-ORCH-008, the 12.0 s intent bound and its fallback; REQ-TOOLS-006, whose `coordinator_only` control removes the orchestrator's terminal; REQ-CONFIG-467 and REQ-ORCH-104, the 2.0 s loop-classification bound and its fallback; REQ-LIBRARY-127 and REQ-CONFIG-118, analysis cancelled at shutdown and its 60 s bound; REQ-TOOLS-039 under REQ-TOOLS-033, the recursive-delete deny rule; `PD-ORCH-004` revision 2, "nothing of the continued child is injected". Raised 2026-09-29 from the live runs' frictions F1 to F5 and the duress run's continuation under [R-067](../../../product/requests.md#r-067). ~~Open.~~ **Ruled 2026-10-06.** Raised as OQ-113 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every figure this question names is kept for this release — the
report summariser's pass, the 12 s intent bound, the 2 s loop-classification bound, the analyst's 60 s, the starter
recursive-delete rule — and a continuation still starts with no part of the child it continues; the continuation offer and
`delegate`'s description of `continuation_of` now tell the parent that a continuation starts with no memory, so that it
writes a complete brief. By [`PD-ORCH-004`](../../../product/directives/pd-orch-004.md#pd-orch-004) revision 5.

The live runs of 2026-09-29 ran the built product against the owner's self-hosted endpoint (`qwen3.8-flash-next`, a
model that reasons before it answers; packs `2026-09-29T02-41-56-779Z` and `2026-09-29T03-06-14-929Z`). The product met
each requirement below as written, and each written figure cost the run time or tokens on its critical path.

- **The report summariser (F1).** Every child's report waits on a summarising call before its parent resumes. Summariser
  time on the critical path: `edit` 47.0 s; `requirements` 60.0 s and 39.2 s; `frictions` 40.8 s; `terminal` 9.7 s and
  33.9 s — 230.6 s of the 1,182.0 s wall clock of the four delegating runs (19.5 %). Each summary is a short JSON and
  took 647 to 3,430 output tokens, most of them reasoning. In the duress run seven summaries took 172.8 s, and 8,743 of
  their 10,838 output tokens were reasoning.
- **The intent bound (F2).** The pre-flight classification waited 3.5, 12.0, 10.2, 8.0, 4.5, 5.9 and 12.0 s (56.1 s in all)
  and ran into its 12 s bound twice, taking REQ-ORCH-007's fallback (`moderate_feature`); each answer took 207 to 1,641
  output tokens for three fields. The same bound was raised from 8.0 s under ESC-35 for a slow first token; here the
  cost is the reasoning. And the orchestrator holds no terminal (REQ-TOOLS-006): asked to run `node --test` itself, it
  told the user to run it.
- **The loop-classification bound (F3).** The 2.0 s bound cannot be met by this model: one classification took 8.5 s and
  610 output tokens, and in the duress run the classifier answered `"loop_detected": false` 23 s after the fallback had
  already declared a loop on counts (recorded as D3, a defect of the fallback's own).
- **The improvement analysis (F4).** No post-run analysis completed in either run: `improvement_artifacts` holds no row.
  Each scenario quit within 3 s of its run ending, and REQ-LIBRARY-127 cancels an analysis in progress at shutdown; the
  six analyst calls took 22 to 134 s at the endpoint, three of them beyond REQ-CONFIG-118's 60 s bound. *(2026-10-07: the
  bound now has a Settings control, 10–600 s, and a timed-out analysis says so in its notice — OQ-223, PD-CONFIG-003
  revision 2; the 60 s default stands.)*
- **The recursive-delete rule (F5).** The starter deny rule refused `rm -rf /tmp/mut` on a scratch path outside the
  workspace (`edit`, tool call #38), as REQ-TOOLS-039 states it.
- **The continuation that starts from nothing.** `PD-ORCH-004` gives a continuation no part of the continued child, and
  the duress run's continuation `d2` of the cut-off `d` made 34 reads before its first edit — 6 min 40 s of its 515 s —
  re-deriving what `d` had known, beside a report whose summary denied `d`'s edits (OQ-111).

**What the build proceeds under.** Every figure as written; nothing here is a defect of the code.

**What a ruling decides.** Whether any of these figures or rules should change for a model of this kind — for example
whether the summarising pass may run off the parent's critical path or be skipped where the report's deterministic facts
suffice, whether the intent and loop-classification bounds should scale with the model's measured latency or request no
reasoning, whether an analysis in progress may finish within a bound after the last window closes, whether the
recursive-delete rule should admit a scratch directory, and whether a continuation should be given its predecessor's
record or report beyond the offer. Each is a change to a requirement or a directive that states the behavioural target
or the owner's choice, so each would be a directive or a revision, not a repair.

*(Added 2026-10-03, a further case of the continuation that starts from nothing, from finding U2 of the orchestrator's
duress live run at `1763f7f` (pack `2026-10-03T06-15-52-273Z`)
([`a-continuation-is-briefed-as-if-it-remembered-and-rebuilds-its-brief-from-the-products-store.md`](../../../defects/fixed/a-continuation-is-briefed-as-if-it-remembered-and-rebuilds-its-brief-from-the-products-store.md)).
The parent is not told that a continuation starts from nothing: neither the cut-off offer ("the remaining work may be
delegated to a new child as a continuation of this one", `packages/engine/src/children/cut-off.ts`) nor `delegate`'s
description of `continuation_of` (`packages/agent-tools/src/tools/delegation.ts`) says so, and no requirement fixes either
wording. The orchestrator briefed both of the run's continuations as if they remembered — #287 "You had already run
everything … each of the nine claims from your brief adjudicated", #170 "You had already read the sources". The
verification continuation, holding no brief, rebuilt it from the product's own session store through its terminal: 31
calls on the per-user data directory (#301 to #328, #341, #342, #344) of `strings`, `grep -a` and `python3` `sqlite3` reads,
two of which opened the live store without `mode=ro`, and one `grep -rl` through the tree that holds the leased credential
file, printing only names. The 146,921 characters it read took its prompt from 22,621 to 74,608 tokens and were re-sent in
33 later requests, about 1.7M input tokens, roughly 18 % of the session. The orchestrator told the user. The run was
unconfined by the live-run harness's choice (`permission_mode: autonomous` with REQ-SANDBOX-052's
`allow_unsandboxed_autonomous: true`, `sandbox_mode` left `off`), but REQ-SANDBOX-060 leaves reads unrestricted under
confinement too, so the reads were within what the specification allows either way. What the build proceeds under: the
current behaviour, unchanged until the owner rules — the payload carries nothing of the continued child, and the offer and
the description keep their wording. What a ruling of this question adds for this case: if a continuation is to go on
starting from nothing, whether the offer and `delegate`'s description should tell the parent so, so that it writes a
self-contained brief; and if it is to be given its predecessor's brief, record or report, the case does not arise. Whether
an agent's terminal may read the product's own data directory is not asked here: REQ-SANDBOX-060 answers it, and a change
there would be a directive of its own.)*

*(Added 2026-10-04, a further case of the intent bound (F2), from run 5 of `slice-proof` on 2026-10-03 (`katalyst`), recorded in
[`fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`](../../../defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md).
The third intent prompt's classification ran into the 12 s bound and took REQ-ORCH-007's fallback ("the classification
call timed out after 12 s"). The load on this host was 0.7, and another live run (the acceptance run, started
05:56:26 UTC) shared the endpoint from before the classification until after it. The same prompt classified in time on
the seven other runs of 2026-10-03 that reached it (runs 1, 3 and 6 to 10; runs 2 and 4 went red before it), and on every
run of 2026-10-04 whose evidence this session keeps but one. *(Corrected 2026-10-04 at the repair round: this sentence first
said "the five other runs whose evidence reached it", missing runs 8, 9 and 10.)* So the bound also meets an endpoint whose
latency depends on who else is using it, not only on the model's reasoning. The one is the repair round's first
`slice-proof` run (build `0de4a7c`, classification launched 14:11:59 UTC): the same prompt fell back at the bound with the
host's load at 2.16 and no other live run or `slice-proof` on this host (another host's use of the endpoint cannot be seen
from here), and the run after it (load 0.52) classified it `moderate_feature` (0.68) in time. So the bound is also reached
with no concurrent run in sight. What the build proceeds under is unchanged: the 12 s default, and the fallback
when the call reaches it. `slice-proof` still treats a fallback as a red. It now names this question in the red, and records
the host's load at each launch (`apps/desktop/scripts/lib/live-answers.mjs`, `lib/proof-reds.mjs`). [Added 2026-10-15 under
OQ-332's ruling (R-072; F8 of fin46's final acceptance): no longer so for a fallback at the 12 s bound. That fallback is
REQ-ORCH-007's specified answer, so `slice-proof` reports it as a NOTE with the bound and the time it took, keeps the
attempt as `intents-<n>.attempt-1.log`, and asks once more, sharing the one extra ask an answer outside the set gets; a
second problem of either kind is the red, and any other fallback is still a red at once
(`docs/defects/fixed/slice-proof-reds-on-an-intent-classification-timed-out-at-req-orch-008s-bound.md`).] This case adds one thing
to what a ruling of this question decides: whether the bound should allow for a self-hosted endpoint shared by concurrent
runs.)*

*(Added 2026-10-06, a further case of the intent bound (F2) and the report summariser (F1), from finding G4 of the
orchestrator's final default live run at `27a5127` (pack `.live-run/runs/2026-10-06T01-30-08-282Z/`, the self-hosted
endpoint; `live-run PASSED`). Nine classifications took 59.9 s on the critical path, and two of them (`resume`'s launch,
`resume/model-traffic.jsonl` #0, 11,980 ms; `requirements`' launch, `requirements/model-traffic.jsonl` #0, 11,971 ms) were
cut at the 12 s bound while still reasoning, with 3.5k to 3.8k reasoning characters and no answer, and took REQ-ORCH-007's
fallback. The report summariser held its parent's wait for 93.1 s in all (`requirements` 55.3 s, `terminal` 19.6 s,
`resume` 11.2 s, `edit` 7.0 s), each pass ending within 10 ms of the `wait_for_tasks` or foreground `delegate` it held:
about 153 s of the 924 s of session wall time, the largest single cost of the run. Nothing here is a defect of the code,
and nothing new is asked: the case adds figures to what a ruling of this question weighs, and what the build proceeds under
is unchanged.)*

*Built 2026-10-06 (fin20, `fin20-continue-and-continuation`).* The offer (`cutOffReport`,
`packages/engine/src/children/cut-off.ts`) and `delegate`'s description (`packages/agent-tools/src/tools/delegation.ts`)
carry the sentence; every figure is unchanged. Pinned by `cut-off.test.ts` and `delegation.test.ts`'s "OQ-114 as ruled"
cases, each red on the wording before.

*(Added 2026-10-07, a further case of the loop-classification bound (F3), from finding D6 of the final duress live run at
`a68f121` (session `e6747bd0`) and [OQ-232](49-spikes-and-later-questions-16.md#oq-232)'s ruling. All three classifications of that run were cut at the 2.0 s
bound (requests 149, 201 and 284, at 1,915, 1,975 and 1,979 ms), and across the three duress packs on the reasoning model
all 9 were (`c2fdd6a` 4, `c2a9444` 2, `a68f121` 3), so with such a model REQ-ORCH-104's fallback decides every raw-count
activation. The bound is kept as ruled on 2026-10-06; what changed is the fallback's evidence, by
[`PD-ORCH-016`](../../../product/directives/pd-orch-016.md#pd-orch-016), whose cost the run measured: one 24.5 s step of a child told to pause
over four reads of its own document.)*

*(Added 2026-10-13, a further case of the intent bound (F2), from findings V3 and Q2 of the live runs at `552d346` and
[OQ-258](55-spikes-and-later-questions-22.md#oq-258)'s ruling. The default pack was cut at the 12 s bound in 4 of 10 launches and the duress launch too; three of
those cuts (duress, resume, faults-args) were spent deliberating which key to write the category under, because the strict rung
named none, one (edit) was applying the tie-break, and one (terminal) received no bytes, the endpoint queueing. The bound is kept
as ruled on 2026-10-06; what changed is the strict rung's text, which now names the object's three keys. **The intent-bound limb
reopens** if a default pack after that change shows a classification cut after its reasoning has named its category with no
deliberation about field names, or 3 or more cuts in 10 launches where the endpoint was not queueing (bytes were received before
the cut). [Sharpened 2026-10-15 by [OQ-332](62-spikes-and-later-questions-29.md#oq-332)'s ruling (R-072), the old wording kept: the first limb now
reads "a classification cut after its reasoning has named its category and not reopened that choice, the rest of the bound spent
on field names, format or the answer's wording"; a category named and then reopened is category deliberation, read under the
count limb, which is unchanged. At `3c03287` neither limb is met: 2 cuts in 17 default launches, both category deliberation.])*

<a id="oq-115"></a>

**OQ-115 — Should the bundled code-intelligence server's tool descriptions reach the system prompt verbatim?** *(REQ-MCP-101, which renders each tool's description text in the persona's MCP section; REQ-MCP-015, which puts usage-instruction retrieval in the READ tier every persona carrying the server holds. Raised 2026-09-29 from the first live run's finding L8 under [R-067](../../../product/requests.md#r-067). Open until 2026-10-06; ruled then, below. Raised as OQ-114 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** as recommended, the bundled server's binding
manifest carries a neutral, product-written description for the usage-instruction tool, keyed by capability, which the
prompt section and the tool's definition use in place of the runtime's own for the server launched through the reserved
token; the tool stays in the read tier and every grant. Minted as [`PD-MCP-001`](../../../product/directives/pd-mcp-001.md#pd-mcp-001),
which narrows REQ-MCP-101 and extends REQ-MCP-116, and built under it (fin21).

`packages/config/src/mcp/prompt.ts:29` renders each server tool's description as REQ-MCP-101 requires, and the bundled
server's usage-instruction tool describes itself imperatively ("IMPORTANT: If you have not yet read the manual, call this
tool immediately …"; bound as `initial_instructions` in READ by
`packages/config/src/mcp/code-intelligence-manifest.generated.ts:36`). Every agent's system prompt carries it, and agents
obey it. In the live run of 2026-09-29 it was called three times — the orchestrator's first call in `requirements`
(2,188 ms), the verifier in the same session, and a child in `frictions` (2,244 ms) — and again by the orchestrator and
one child in the duress run. Each call returns 7.1 to 7.5 thousand characters, which every later request of that agent
re-sends: 33 requests in the first run, about 60,000 input tokens. The instruction also moves each agent's first step
onto a manual about a tool it may not need.

**What the build proceeds under.** REQ-MCP-101 as written: the description rendered verbatim. No requirement lets the
product rewrite a server's own description, and REQ-MCP-015 grants the tool.

**What a ruling decides.** Whether the product may substitute its own description for a bundled server's tool (a
product-owned override the manifest carries), whether usage-instruction retrieval should leave the READ tier or the
built-in grants, or whether the cost stands. Each departs from REQ-MCP-101 or REQ-MCP-015, which state the target.

<a id="oq-116"></a>

**OQ-116 — Is a run's displayed tool-call total the persisted one while a long pass is still running?** *(REQ-ORCH-097, which accumulates per-child tool-call counters "after each successful execution pass"; REQ-MONITOR-102, which persists a session-wide total and has a displayed total be the persisted value. Raised 2026-09-29 from the duress live run's finding D4 under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-115 on its branch and renumbered at the merge, OQ-109 having been taken on `main`.)*

The root's calls are added to the persisted total after its turn returns, and a child's when it settles
(`packages/engine/src/run/run.ts`, `packages/engine/src/children/orchestration.ts`). In the duress run of 2026-09-29 (pack
`2026-09-29T03-06-14-929Z`, session `379f1490`) the root's one execution pass lasted the whole 40-minute run: at the
deadline `sessions.tool_calls` read 240 against 309 `tool_calls` rows — the orchestrator's 54 and the running child
`f`'s 15 missing, `f`'s own `children.tool_calls` 0 — and the autopsy's header said 240 above a per-tool breakdown summing
to 309. REQ-ORCH-097's "after each successful execution pass" is met to the letter, and a surface following REQ-MONITOR-102
shows a figure 69 calls behind the record for as long as the pass lasts. The crash half of the same finding — calls made
before a crash that never reach the total — is a defect of its own,
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](../../../defects/fixed/a-roots-calls-before-a-crash-never-reach-the-session-total.md), repaired 2026-09-29 without moving this cadence.

**What the build proceeds under.** REQ-ORCH-097 as written: accumulated at the end of each pass.

**What a ruling decides.** Whether the counters are accumulated as each call completes, so the displayed total follows the
record during a pass, which would amend or narrow REQ-ORCH-097's timing; or whether the lag stands and the surface says
the total is as of the last completed pass.

*Reported 2026-10-01 by the repair of
[`the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md`](../../../defects/fixed/the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md)
(acceptance A20, R-067), which leaves this cadence and the displayed total as they were.* The per-agent figures no longer
wait for it: a child's count already read the tracker's live count beside its persisted one, and the run-level agent's now
reads the roots' persisted share plus the live root's calls not yet counted (`SessionRecord.entryToolCalls`). So during a
pass the per-agent figures may sum to more than the displayed total; a ruling that accumulates per call would close that
gap as well. Whether the run-level agent's figure is its own at all, or REQ-MONITOR-101's aggregate run count, is OQ-159.

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** each call is added to the saved totals as it
completes, so the displayed total always matches the record. Carried by [`PD-ORCH-008`](../../../product/directives/pd-orch-008.md#pd-orch-008),
which narrows REQ-ORCH-097's timing. The reading taken where the ruling leaves a detail open: "as it completes" is when the
call's result returns, so a call still in flight is not in the total yet and the live per-agent figures (which read the
tracker) may lead it by those calls; the agent's own count moves with the total in the same write, for every agent, a plan
cycle's root included (store v32, `sessions.plan_root_tool_calls`); what a pass's end adds is only what was not counted as it
completed; and a call an attempt REQ-ORCH-088's fallback retry replaced made stays counted. OQ-159's reading of the run-level
agent's figure is kept as it is. **Built 2026-10-06 (fin20):** `countRootCall` (`packages/engine/src/run/run.ts`), `countCall`
(`packages/engine/src/children/orchestration.ts`), `SessionWriter.countToolCalls`'s `planRootCall`, the plan cycle root's
crash record (`packages/engine/src/run/crash.ts`); cases in `agent-links.test.ts`, `run/crash.test.ts`, `run/ladder.test.ts`
and `store.test.ts`.

<a id="oq-117"></a>

**OQ-117 — What is an iteration told of a task it takes up that is not the run's own, and with what?** *(REQ-CHAT-040, whose queued prompt becomes a task "carrying the prompt text as its content"; REQ-ORCH-004 and REQ-ORCH-135, whose task a resumed session carries on and "stays anchored"; REQ-ORCH-072, which gives the root execution record "the task's execution payload"; REQ-CHAT-090 and REQ-CHAT-091, which let the user rename a task; and `PD-ORCH-005` clause 17 with OQ-102, whose message is told in words of its own. Raised 2026-09-29 by the repair of [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../../../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md) under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 31: the task part is worded as built and carries the task's content, not a queued prompt's name; a task that repeats the launch content's request, and a renamed own task, are told nothing more; and no images are carried.

No requirement says what an iteration's first message holds when the task it selected is not the one the launch
content states: a queued prompt (REQ-CHAT-040), a task a pause, a stop or a death put back and a later message's run
takes up (REQ-ORCH-135), a task after a plan decision's gated one, or an improvement run's proposal (REQ-LIBRARY-059,
whose launch prompt lists every proposal). The recorded defect sent such an iteration the launch content alone, so the
task was marked done without ever reaching a model.

**What the build proceeds under.**

- **The launch content is the base, and the task follows it.** Every execution iteration's first message is the launch
  content — which keeps the three flows the defect named: the approved plan, the executor's instructions and the
  continuation's handoff — then, when the selected task is not the run's own (`RunDeps.taskId`) and its text is not the
  launch content's request, a text part naming it the task to work on: "The task for this iteration is the task below,
  from the session's todo. Work on it now. What precedes it is what this run was launched with: read it as context, and
  leave any other work it asks for to its own task." followed by the task's text. The words are the build's; a
  continue's message keeps OQ-102's. The alternative — the task's text alone, in place of the launch content — was
  tried and reverted in `PD-ORCH-005` phase 2, because it loses all three flows.
- **A task of the same text as the launch content's request is told nothing more**, whichever task it is: the Continue
  action that restates a pending request, a plan decision's gated request, or a queued prompt that repeats the launch
  prompt word for word. The launch content already states it.
- **The run's own task is told nothing more even when the user renamed it** (REQ-CHAT-091): its iteration is sent the
  launch content, which still states the request as it was sent.
- **Only the task's text is sent.** A task holds its text only, so a request put back and taken up by a later run is sent
  without the images its prompt carried, as OQ-102 reads for a message.
- **The handoff is not rebuilt** (OQ-104, OQ-106).

**What a ruling decides.** Whether the product should word the task part otherwise, or name a queued prompt as
REQ-CHAT-040's "Queued Prompt: <id>"; whether a task that repeats the launch content's request should still be told it;
whether a renamed own task should be sent its new text; and whether a task taken up by a later run should carry the
images its prompt was sent with, which needs a task to hold them.

*Added 2026-10-01 by the repair of
[`a-queued-prompts-task-is-not-named-queued-prompt.md`](../../../defects/fixed/a-queued-prompts-task-is-not-named-queued-prompt.md)
(acceptance A28, R-067).* The task a queued prompt becomes is now named as REQ-CHAT-040 and REQ-ORCH-071 state: a todo task
carries an optional `name` beside its text, and `Run.consumeQueued` names it "Queued Prompt: <first 8 characters of the
prompt id>" with the prompt text as its content. The Todo pane draws the name, and so does the handoff's todo list,
whose lines REQ-SESSION-115 states as "task display titles cut to 80 characters" (as OQ-104 reads them), and so does the
plan gate's list of implied tasks (REQ-ORCH-153, PD-ORCH-002), which lists each task as the pane draws it; the entry
agent's todo lines across a compression (REQ-MONITOR-084 (4), "todo items carried across one for one", which states no
display title) carry the name and then the content, as an agent task's line carries its name and then its description.
A rename renames the name and keeps the content, as an agent task's rename keeps its description (REQ-CHAT-091). The
iteration that takes the task up is still sent its content alone, as the first bullet above reads: what the model is to
do is the prompt, and the name is the plan's; the `task` field of the iteration's records (`iteration.start`, and the
iteration's end record and `iteration_end` message) carries the content too, and is part of what stays open here. That a queued prompt's task is *named* is REQ-CHAT-040's and REQ-ORCH-071's
own words; which of name and content the compression's lines and the iteration's task part carry is the built reading
above, not something the requirements state, and whether the task part should also state the name stays open with the
rest. *Corrected 2026-10-01 at verification:* this note first read the handoff's lines as carrying the name and then the
content; REQ-SESSION-115 names them display titles, so they now carry the name alone. *Corrected 2026-10-01 at the
second verification:* this note first left the plan gate out of the readers; its implied-task list still showed a queued
prompt's task by its prompt text, and now lists the name.

<a id="oq-118"></a>

**OQ-118 — May the end-of-run summary say which rest a person asked for, and what a continue will resume?** *(REQ-ORCH-082
rule 1, "not asserting which of the two person-stops it was" and "no rule of this list may distinguish the two";
REQ-MONITOR-125, a paused session persists "with an interruption message"; `PD-ORCH-005` clauses 2, 3 and 21, under which
a pause and a stop leave agents a continue resumes and the explicit cancel leaves none, and all three record the stop
reason `user_cancelled`. Raised 2026-09-29 by the repair of
[`a-paused-runs-notice-says-a-person-stopped-it.md`](../../../defects/fixed/a-paused-runs-notice-says-a-person-stopped-it.md)
under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the neutral wording is kept: REQ-ORCH-082's rule 1 reads "The run came to rest at the user's request." for every rest a person asked for, and the transcript's row, the timeline and the Continue action's count tell the difference. `PD-ORCH-005` revision 6 records it in clause 32; REQ-ORCH-082 is not narrowed, since the wording keeps it.

The note asked for rule 1's message to say which rest it was — a pause, a stop or the explicit cancel — and whether a
continue resumes the agents, since `PD-ORCH-005` made that matter. REQ-ORCH-082 forbids exactly that: its rule 1 conveys
that "the run came to rest because a person stopped it" without "asserting which of the two person-stops it was", and "no
rule of this list may distinguish the two, there being nothing on the stop-reason axis to distinguish them by". Clause 21
confirms the axis is still empty (a stop and a pause "record the same stop reason"), and no directive names REQ-ORCH-082.
Wording the arm by rest, as the triage proposed (passing `restCause`, the final stop and the pause request to
`summarise`), would change a clause, so it was not built.

**The reading built.** Rule 1's message is worded so it fits all three rests and names none: "The run came to rest at the
user's request." It no longer says "stopped", which a paused session's banner set beside its own row "Run paused at the
user's request" read as a stop. It bakes in no persisted status, so it stands whatever a rest persists (clause 21's
`paused`, R-067's ruling 2). Which rest it was is told by the transcript's system row ("Run paused at the user's request;
continue it from the composer." after a pause, "Run paused: interrupted by user." after a stop or a cancel) and by the
timeline; what a continue resumes is told by the Continue action's count (`resumable`, clause 6 and clause 19), which
reads nothing after the explicit cancel because nothing is left to resume.

**What a ruling decides.** Whether REQ-ORCH-082 should gain a way to tell a pause, a stop and the explicit cancel apart
in the summary (a directive naming it, or a stop reason of the pause's own in REQ-MONITOR-301's closed set), so that the
one notice a rest raises can say which it was and whether a continue resumes its agents; or whether the neutral wording
stands and the row and the Continue action are where the difference is told.
