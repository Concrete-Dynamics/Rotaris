# Open questions — Spikes, and the questions raised since (3 of 35)

Part 36 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-148 – OQ-150, OQ-157 – OQ-160.

**Not a numbered spike, and deliberately so: a build-host obligation ADR-0056 creates.** Rule 4 of that
record requires a **build-time proof that each native binding loads under the shipped Electron binary,
from the packaged tree**, failing the build if it does not. It is the only check anywhere in the record
that catches an unloadable store binding, and the reason is an asymmetry worth stating once:
`REQ-STARTUP-156`'s release gate observes **first paint**, first paint does not open a store (ADR-0055
keeps the workspace read off the critical path, ADR-0058 opens after show), so **an artifact with an
unloadable store binding passes the release gate** — the property that makes the failure graceful is the
same property that makes the gate blind to it. The proof must run against the packaged tree under the
Electron binary that tree carries: run against `node_modules` in the checkout it proves nothing about
asar unpacking, and run under the host Node it passes on exactly the artifact that fails. **A proof
written the easy way is worse than none, because it reads as verified.** Somebody must establish that it
is constructible on all three release runners before it is relied on as the only defence.

**OQ-148 — In what order are children held on one `models:` key released when they belong to different sessions?**
*(REQ-ORCH-050, "Held children MUST be released in the order they were held, one returning to `queued` each time a child
bound to the same model key reaches a terminal state"; REQ-MONITOR-020, "the freed slot must promote exactly one waiting
agent"; REQ-CONFIG-094, which counts "children belonging to any other session running in the same process" against the
cap; ADR-0012 and ADR-0013. Raised 2026-09-30 under [R-067](../../product/requests.md#r-067) by the repair of
[`the-per-model-cap-counts-only-one-iterations-children.md`](../../defects/fixed/the-per-model-cap-counts-only-one-iterations-children.md),
acceptance finding A13. ~~Open;~~ ruled 2026-10-06; numbered OQ-146 when it was raised, renumbered OQ-148 on its branch once OQ-146 and OQ-147
were taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built, and `PD-ORCH-005` revision 6 states it in clause 39: the count is the process's and the queue each session's own; a slot freed in one session is offered to the other sessions first, in the order they joined, then to the freeing session.

REQ-ORCH-050 and REQ-MONITOR-020 were written against one ledger, where "the order they were held" is one queue. Once the
count is the process's (REQ-CONFIG-094), a slot freed in one session can be the slot a child held in another session is
waiting for, and the requirements do not say whether "the order they were held" is one order across the process or each
session's own. Two readings were weighed:
- **One order across the process.** Every held child on a key waits in one queue whatever its session, and a freed slot
  goes to the oldest. This needs a process-wide queue beside the per-session `model_slot_queue` rows, and a session's own
  scheduler could no longer promote its own held child while an older one waits in another session.
- **Each session's own order.** A session's held children are released in the order that session held them, from its own
  persisted queue, as before; which session takes a freed slot is whichever run's scheduler passes first.

**What the build proceeds under:** the second. The count is process-wide (`ModelSlots` in
`packages/engine/src/children/model-slots.ts`, joined by each session `Sessions` runs, while a run of it is under way or it
rests holding a place — OQ-149); the queue stays per session. When a child ends, its own run's scheduler passes after the
others are woken (`ModelSlots.freed` runs in the terminal listener, the freeing run's pass follows the child's execution),
so a slot freed in one session is offered first to the other sessions, in the order they joined, and then to the freeing
session. That order is where the mechanism puts the wake, not a choice made on its merits: a child held earlier in the
freeing session can be overtaken by one held later elsewhere, and a ruling for the freeing session first moves the others'
wake after the freeing run's own pass. A session never waits on a slot while the process-wide count is below the cap.

**What a ruling decides.** Whether release order is process-wide, and if so whether a session's own held child may be
passed over for an older one elsewhere; or, if per session, whether the freeing session or the others take a freed slot
first.

**OQ-149 — Does a paused child keep its slot on a `models:` entry while its session rests, against other sessions?**
*(PD-ORCH-005 clause 4, "A resumed agent's `child_timeout` starts afresh, and each agent keeps the place in every child
limit it already held"; REQ-CONFIG-094, which counts "every child agent currently running against that `models:` entry …
children belonging to any other session running in the same process"; REQ-ORCH-050; REQ-MONITOR-020, "only running and
summarizing agents count"; PD-ORCH-005 clauses 6 and 16. Raised 2026-09-30 under [R-067](../../product/requests.md#r-067)
by the verification of the repair of
[`the-per-model-cap-counts-only-one-iterations-children.md`](../../defects/fixed/the-per-model-cap-counts-only-one-iterations-children.md),
acceptance finding A13. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built, and `PD-ORCH-005` revision 6 states it in clause 39: a child paused out of `starting`, `running` or `summarizing` keeps its slot while its session rests; a session paused by an earlier process holds none until a run of it starts; a resting session's places do not lapse. REQ-MONITOR-020 and REQ-CONFIG-094 join the directive's Narrows list.

Within one session the question never arose: a resting session runs nothing else, so its paused children lost nothing by
not being counted. Once the count is the process's (OQ-148), a child paused out of `running` is not "currently running",
so by REQ-CONFIG-094 and REQ-MONITOR-020 alone its slot is free for another session — and clause 4 then resumes it into
`running` whatever the count, putting two children on a key capped at 1. Two readings were weighed:
- **The paused child keeps its place.** A child `paused` out of `running` or `summarizing` holds its slot while its
  session rests, and resumes into it. The cap is never exceeded; a paused session holds its places until it is continued,
  declined (clause 6) or its agents are cancelled (clause 16), so another session's child can wait behind a session no
  one is using.
- **A resumed child goes back through the cap.** The paused child's slot frees at the rest, and on resume a child whose
  slot is taken waits `waiting_on_model_slot` like any other. No session waits on a resting one, but the resumed agent
  loses the place clause 4 says it keeps.

**What the build proceeds under:** the first, as clause 4 reads. `holdsModelSlot` (`packages/engine/src/children/ledger.ts`)
counts a child `starting`, `running` or `summarizing`, or `paused` with that `resume_state`; a child paused while it
waited, or before its start was claimed, held none. `Sessions` keeps a session in `ModelSlots` from the first run of it in
this process until no run of it is under way and none of its children holds a place, reading its count from its store;
a decline, a cancel at rest, eviction and deletion let it go. Two edges follow and are left as they are: a session paused
by an **earlier process** holds nothing until a run of it starts in this one (the count is process state), so on continue
its resumed children may join a key another session already fills; and a paused session left unattended keeps another
session's child held for as long as it rests.

**What a ruling decides.** Whether a paused child keeps its slot against other sessions, or resumes through the cap;
if it keeps it, whether a session paused by an earlier process holds its places from launch, and whether a resting
session's places lapse after some time.

**OQ-150 — Is one `models:` key in two workspaces one entry for the per-model cap?**
*(REQ-CONFIG-094, "counted by the entry's key, across the whole process … Two different `models:` keys never share a count
even where they name the same provider model, since the cap is a property of the configured entry"; REQ-CONFIG-005 and
REQ-CONFIG-031, under which a workspace's configuration may define its own `models:` entries; ADR-0013. Raised 2026-09-30
under [R-067](../../product/requests.md#r-067) by the verification of the repair of
[`the-per-model-cap-counts-only-one-iterations-children.md`](../../defects/fixed/the-per-model-cap-counts-only-one-iterations-children.md),
acceptance finding A13. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the per-model cap counts by the key string across every session of the process, each session judging the sum against its own configuration's cap.

The run host serves sessions of several workspaces in one `Sessions`, each run configured from its own workspace's
loaded configuration. Two workspaces can define different entries under one key — `fast` a local endpoint with
`max_parallel: 1` in one, a hosted model in the other — or inherit one entry from the profile. The requirement counts by
the key "across the whole process" and calls the cap "a property of the configured entry", and does not say which governs
when the two part. Two readings were weighed:
- **The key alone.** Every child on a key counts against it, whichever workspace defines the key; each session judges
  the whole count against its own configuration's cap. No entry's cap is ever exceeded, but one workspace's children can
  hold another's unrelated entry at its cap.
- **The key and the entry it resolves to.** Children share a count only when their keys resolve to the same entry. A
  profile entry shared by two workspaces is still one count; two different entries under one key never share. This needs
  an identity for a resolved entry that both configurations agree on.

**What the build proceeds under:** the first. `ModelSlots.heldElsewhere` sums by the key string across every joined
session, and `ChildLedger.slotFree` compares that sum with the asking session's own cap (`modelCapFor` from its workspace's
configuration). It is the reading that can only err towards waiting.

**What a ruling decides.** Whether the count is by key or by resolved entry, and if by entry, what makes two workspaces'
entries one.

**OQ-157 — Which word, or which other record, takes each fact the product writes to the timeline under a name no
vocabulary has?** *(REQ-ORCH-139, "MUST NOT use any name outside those vocabularies", for the timeline and the issue
record alike; REQ-SESSION-134, REQ-SESSION-142, REQ-SESSION-199; REQ-ORCH-091 (a) and (d); REQ-MONITOR-086; REQ-NOTIFY-268;
`PD-ORCH-005`; ADR-0027 and ADR-0060, which decided three of the names; OQ-53, OQ-76 and OQ-127, which raised the same gap for
one mechanism each. Raised 2026-10-01 under [R-067](../../product/requests.md#r-067) by the repair of
[`the-run-writes-timeline-events-outside-its-closed-vocabulary.md`](../../defects/fixed/the-run-writes-timeline-events-outside-its-closed-vocabulary.md),
acceptance finding A29. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** as recommended — the specification gains the words, in one amendment with OQ-53's, OQ-54's, OQ-76's and OQ-127's: the fifteen run facts, OQ-127's three watchdog words and the three issue kinds join domain 01's lists ([`PD-ORCH-014`](../../product/directives/pd-orch-014.md#pd-orch-014), which also names REQ-NOTIFY-268's entry `notice`), the thirteen chat controls form the chat domain's own timeline vocabulary ([`PD-CHAT-009`](../../product/directives/pd-chat-009.md#pd-chat-009)), and OQ-76's two words join domain 05's ([`PD-TOOLS-011`](../../product/directives/pd-tools-011.md#pd-tools-011)). The pairing the build read (one mechanism, one entry word and one issue word) stands as built, and `tools/check-timeline-vocabulary.mjs`'s `AWAITING` is empty, so the vocabulary is closed again.

REQ-ORCH-139 closes the names of timeline events and of issues to the vocabularies of domain 01's Data & Formats and the
words other domains fix (domain 07's `run_start`, `run_end`, `session.interrupted_recovered` and `issue`; domain 05's
`permission_approved` and domain 10's `permission_mode_changed`; domain 06's two checkpoint entries; domain 09's
`hook_run`; domain 14's `artifact_published`). Domain 10's other permission entry, REQ-SANDBOX-104's `permission_mode_downgraded`, is not a
word: `PD-TOOLS-002` withdrew it ("no `permission_mode_downgraded` timeline event"), so the gate holds it in `FORBIDDEN`,
citing the directive, and fails a write of it. *(Corrected 2026-10-01 at verification: this paragraph first counted
"domain 05's and domain 10's permission entries" as words, and the gate's `VOCABULARY` accepted the withdrawn one, citing
the requirement the directive displaced.)*

**Where a vocabulary has the word for the fact, the repair used it:** the ladder's same-tier change writes `quota_fallback_model` and the `quota_fallback` issue (REQ-NOTIFY-090's "timeline entry for a quota-driven model
change"; REQ-NOTIFY-082's "usage limit" covers a rate limit too, and the metadata's `condition` still says which), its
unresponsive-model fallback writes `llm_unresponsive` as both entry and issue (REQ-ORCH-090's "a timeline event and an
issue"), and the children's hard-timeout retry writes `fallback_model` and the `timeout_fallback` issue (REQ-ORCH-088 —
the role's `fallback_model`, REQ-CONFIG-110). Those three were `model_fallback`, `unresponsive_model_fallback` /
`unresponsive_model` and `child_timeout_fallback`. The pairing — one mechanism, one entry word and one issue word, read
from the two lists' order — is this build's reading, and a ruling may pair them otherwise.

**Where no vocabulary has the word, nothing was renamed or moved.** Twenty-eight names remain, each listed with the fact
it records in `AWAITING` in [`tools/check-timeline-vocabulary.mjs`](../../../tools/check-timeline-vocabulary.mjs):
- **durable memory the product reads back** — `model_exhausted` and `model_override` (REQ-ORCH-091 (a) and (d), rehydrated
  on resume; ADR-0027), and `context_compressed` (REQ-MONITOR-086's count is seeded from them; ADR-0060 decisions 6 and 7,
  OQ-53);
- **`PD-ORCH-005`'s rest and resume** — `iteration_paused`, `iteration_resumed`, `child_paused`, `child_resumed`,
  `approval_withdrawn`, `question_withdrawn`, `run_pause_requested`, `run_pause_refused`; the live run's clause checks read
  their metadata;
- **the user's chat controls** — `steering_submitted`, `steering_injected`, `steering_not_delivered`, `prompt_queued`,
  `prompt_edited`, `prompt_removed`, `prompt_triggered`, `todo_edited`, `entry_model_switched`, `entry_reasoning_switched`,
  `transcript_cleared`, `pause_resolved`, `run_paused_message_limit`;
- **the rest** — `run_continuation_intent` (a continuation's audit payload, which the launch audit takes only once per
  session, REQ-SESSION-138), `loop_supervisor_activation` (an activation short of `circuit_breaker_escalation`),
  `context_selection` (what a child was given; REQ-SESSION-133's context-selection record is one the store does not keep,
  ADR-0024), and `notice` (REQ-NOTIFY-268 requires the entry and names no type for it).

Three issue kinds are outside the issue-kind vocabulary on the same terms and are left as they are: `model_wait`
(REQ-NOTIFY-090's wait issue), `validation_llm_error` (REQ-ORCH-092's validation retry) and `compression_failed`.

Two readings were weighed for the twenty-eight:
- **The specification gains the words.** Each fact keeps its entry, its metadata and its place in the export
  (REQ-SESSION-199); the names become a vocabulary's, in domain 01's list or the owning domain's. Nothing in the product
  changes but the record.
- **The facts move to another record.** OQ-76 and OQ-127 chose the session log (REQ-SESSION-142) for their own facts, at
  `WARNING`. Done for these, the log's default level would carry routine facts — a todo edited, a prompt queued — as
  warnings, or drop them at `INFO`; the three durable-memory names would need a home the product reads back (REQ-ORCH-091
  (d) says the override is persisted "in session state", which is a store change), against two accepted ADRs; and the live
  run's `PD-ORCH-005` checks would lose the metadata they read. The export would no longer reach any of them.

**What the build proceeds under:** the names stay as they are written, and the list is closed.
`tools/check-timeline-vocabulary.mjs`, in `pnpm lint`, reads every timeline write in the product's source and fails on a
name that is neither a vocabulary's word nor in `AWAITING`, and on a `FORBIDDEN` name; an `AWAITING` entry nothing writes
fails it too, and its test pins the list's names, so the list shrinks as rulings land and grows only by a deliberate test
edit, and domain 01's list is read from the specification so the two cannot drift. Until a
ruling, the twenty-eight are a recorded departure from REQ-ORCH-139's "MUST NOT", kept open in the note this question was
raised by.

**What a ruling decides.** For each group, whether the specification gains its words (and in which domain's list) or the
facts move to another record (and which); with them, OQ-76's two transitions and OQ-127's three records, which are the
same question, and the three issue kinds. Recommendation: one ruling that adds the twenty-eight to the vocabularies — the
chat controls to the chat domain's Data & Formats, the rest to domain 01's list — with OQ-76's and OQ-127's words beside
them, and names REQ-NOTIFY-268's entry type, because the timeline is what an autopsy reads first and the export reaches
it, and the session log is neither.

**OQ-158 — May a child be renamed off a root's name when no sibling under its parent holds that name?**
*(REQ-ORCH-044, "Child task names MUST be scoped per parent. A reused name is deterministically renamed `<name>_<n>` … and
the canonical name is used everywhere the task is referenced (transcripts, dependency resolution, artifacts)";
REQ-MONITOR-071, REQ-CHAT-069 and REQ-MONITOR-044, which the surfaces meet by name; PD-ORCH-005 clause 4 with OQ-97, under
which a root keeps its own persona's name; REQ-LIBRARY-093. Raised 2026-10-01 under [R-067](../../product/requests.md#r-067)
by the repair of
[`a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md`](../../defects/fixed/a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md),
acceptance finding A23. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the renaming is accepted as built: no child at any depth takes the canonical name or the persona of its own root or of any root the session has recorded, and such a child is renamed `<name>_<n>`. The remaining edge, a root named like an earlier child, is left until after the first release, and its note, [`a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md`](../../defects/fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md), closes with this ruling. [`PD-ORCH-010`](../../product/directives/pd-orch-010.md#pd-orch-010) narrows REQ-ORCH-044.

A transcript row, a tool call and an artifact know their agent by a name alone. The surfaces give the run-level agent every
row and artifact carrying the entry persona or a name one of the session's roots carries (`ownRow`, `artifactNames`,
`SessionRecord.entryRoots`), and a child every row carrying its canonical name. A child whose canonical name is a root's is
therefore drawn as both agents, and a name-only rule cannot tell them apart: the root's own rows carry the same name.
REQ-ORCH-044 makes a name unique under its parent and renames only a name "reused" there. The ledger already read the
root's own canonical name as in use under the root, so a direct child was never named after it; it did not for a deeper
child, nor for the names of an earlier root (a resumed root's persona, a root of a persona the canonicaliser rewrites).
Two readings were weighed:
- **A root's names are in use under every parent.** No child at any depth takes the canonical name or the persona of any
  root the session has recorded, or of the root it works under; it is renamed `<name>_<n>` by REQ-ORCH-044's own rule.
  A child the model names `orchestrator` two levels down is `orchestrator_1`, which the specification renames only when a
  sibling holds the name.
- **Only siblings' names are in use.** A child keeps the model's name unless a sibling holds it, and the rows carry an
  identity the ledger keeps unique across the session — a task id on every transcript row and tool call — which the surfaces
  match instead of the name. This widens the transcript row's envelope, and every row recorded before carries none.

**What the build proceeds under:** the first. `ChildLedger.spawn` (`packages/engine/src/children/ledger.ts`) counts as
taken, beside the parent's children's names, its root's canonical name and the entry persona it runs as, and every
recorded root's two names (`recordedRootNames` in `children/naming.ts`: each iteration's `root_persona` and
`root_canonical_name`, and each publishing root no iteration records, by its publish — the sources `entryRootsOf` reads).
Two edges are left as they are. A child named before this repair keeps its name. And a **root named like an earlier child**
— the entry persona changed to one an earlier child's canonical name already spells — is drawn as both, since the root's
name is its persona and no ledger names it
([`a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md`](../../defects/fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md)).

**What a ruling decides.** Whether a root's names count as in use under every parent, or the surfaces must tell a child
from a root by an identity the rows carry; with the second, whether rows recorded before keep the name-only rule.

**OQ-159 — Is the run-level agent's tool-call count its own, or the run's aggregate?** *(REQ-MONITOR-101, "Each agent node
exposes its live tool-call count and the set of tool names it has called; the synthetic root node exposes the aggregate run
count and the aggregate called-tool history"; REQ-MONITOR-044, under which each agent as presented carries its tool-call
count; REQ-MONITOR-052's meta line, `{state} · {elapsed or em-dash} · {N} tool calls`; REQ-MONITOR-043 and REQ-MONITOR-089,
which call the run's own agent its synthetic root, as ADR-0012 does; REQ-MONITOR-086 and REQ-MONITOR-060; REQ-MONITOR-102
with REQ-ORCH-097's cadence (OQ-116). Raised 2026-10-01 under [R-067](../../product/requests.md#r-067) by the verification of
the repair of
[`the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md`](../../defects/fixed/the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md),
acceptance finding A20. Raised on its branch as OQ-158 and renumbered OQ-159 at the merge, origin/main's OQ-158 keeping its number. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the run-level agent carries its own tool-call count and called history (the roots'), and REQ-MONITOR-101's aggregate run count is REQ-MONITOR-102's displayed total; the run-level agent's compression count stays the run-wide count. [`PD-MONITOR-003`](../../product/directives/pd-monitor-003.md#pd-monitor-003) narrows REQ-MONITOR-101.

The inspector, the Mission view and the persona windows present the run's own agent as the run-level agent
(`runLevelAgent`, `packages/ui/src/agents.ts`), and the record calls that agent the run's synthetic root (REQ-MONITOR-043,
REQ-MONITOR-089, ADR-0012). REQ-MONITOR-101 gives that node "the aggregate run count and the aggregate called-tool history";
REQ-MONITOR-044 and REQ-MONITOR-052 give every agent as presented its own tool-call count on its meta line, and do not
except the run-level agent. The two part whenever a child has called a tool: the aggregate is the session's total, the
agent's own count is the roots' share of it. The build already takes both readings, one per figure: the run-level agent's
compression count is the run-wide sum ("what the synthetic root shows", REQ-MONITOR-086), while its tool chips and called
history are the root's own (`SessionRecord.entryTools`, REQ-MONITOR-060) and so is its tool-call count. Neither reading
would have avoided A20: the session's total also read 0 while the root's turn ran, since a root's calls join it only when
the turn returns (REQ-ORCH-097, OQ-116).

**What the build proceeds under.** The agent's own count, as before the repair: the run-level agent's `{N} tool calls` is
the roots' share of the persisted total — the total less every child's persisted `children.tool_calls` — plus the live
root's calls not yet counted (`SessionRecord.entryToolCalls`, `entryToolCallsOf` in `packages/engine/src/sessions.ts`,
`Run.entryUncountedToolCalls`). The run's aggregate count is the displayed total of REQ-MONITOR-102
(`SessionRecord.toolCalls.total`), and the run-level agent's called history stays the root's own. Nothing about either
figure changes until a ruling.

**What a ruling decides.** Whether the run-level agent is REQ-MONITOR-101's synthetic root node, so its tool-call count
and called-tool history are the run's aggregate — and then whether that aggregate is the persisted total of REQ-MONITOR-102,
with its lag during a pass, or the persisted total plus every live agent's calls not yet counted; or whether it is an
agent as REQ-MONITOR-044 presents one, carrying its own count and history, and REQ-MONITOR-101's synthetic root node is
some other surface — the run header, or the run-wide totals of REQ-MONITOR-098.

*2026-10-02, the repair of
[`the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md`](../../defects/fixed/the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md):*
the compression reading recorded above was not what the build did — `runLevelAgent` summed `SessionRecord.agents`, which
holds the children alone, so a root's own compressions were counted nowhere. The record now carries the run-wide count
(`SessionRecord.compressions`, the session's maintained aggregate, the roots' included) and the run-level agent shows it, as
the reading says; the inspector and the persona window draw it. Nothing about the tool-call figure changed, and nothing is ruled.

**OQ-160 — Does the sidebar's "Last run failed: {message}" carry the failed task's whole output, or a bounded form of it?**
*(REQ-WORKSPACE-113, "a recorded failure appends 'Last run failed: {message}' to the hint"; REQ-WORKSPACE-093, which fixes a
failure's form as "{reason}: {detail}"; REQ-WORKSPACE-103, under which the recorded outcome is visible in Settings Project. Raised 2026-10-01 under
[R-067](../../product/requests.md#r-067) by the repair of
[`the-project-sections-failure-hint-runs-out-of-the-sidebar.md`](../../defects/fixed/the-project-sections-failure-hint-runs-out-of-the-sidebar.md),
acceptance finding A39. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the sidebar's `{message}` is the recorded failure whole, broken to the column (`overflow-wrap: anywhere`), and Settings → Project shows the same outcome. REQ-WORKSPACE-113 does not bound `{message}`, so this ruling settles it.

The recorded failure of the shipped code-intelligence task is its process's raw output: the exit, the platform's own log
lines (a `[pid:date/time:ERROR:dbus/bus.cc:406]` prefix among them) and the runtime's explanation. Measured in the built
app at 1440 × 900, the hint holding it is about 267 px tall in a 235 px column, most of the sidebar's free height. The repair
broke its unbroken tokens inside the column; it did not shorten it. REQ-WORKSPACE-113 names `{message}` and does not say
whether that is the whole recorded output. Two readings: the whole recorded message, broken to the column; or a bounded
form in the sidebar (its first line, or REQ-WORKSPACE-093's reason alone), with the whole output left to Settings
Project, where REQ-WORKSPACE-103 makes the recorded outcome visible.

**What the build proceeds under:** the first. `projectSidebarSection` (`packages/ui/src/settings/project-init.ts`) appends
`lastError` whole, and `.agents__project .settings__hint` breaks it with `overflow-wrap: anywhere` (`shell.css`).

**What a ruling decides.** Whether the sidebar hint's `{message}` is the recorded failure whole; if not, which part of it
the sidebar shows.
