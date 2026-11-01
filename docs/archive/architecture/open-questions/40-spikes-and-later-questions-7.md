# Archived open questions — Spikes, and the questions raised since (7 of 35)

The ruled, closed, resolved and withdrawn entries of [part 40](../../../architecture/open-questions/40-spikes-and-later-questions-7.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-172"></a>

**OQ-172 — At a close, which bounds a setup step's termination: REQ-MCP-099's 5 s grace, or the close's 5 s?**
*(REQ-MCP-099, "on cancellation or timeout the child SHALL be asked to terminate, given 5 seconds to exit and then
force-killed"; REQ-WORKSPACE-109, "Closing the application while a run is under way SHALL raise no dialog and SHALL
complete within 5000 ms, the run being stopped by force if it has not ended by then"; REQ-WORKSPACE-092, "when the
application is closed while setup is running, nothing the step launched SHALL still be running 5 s later". Raised
2026-10-01 by the repair of
[`an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`](../../../defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md),
on its verifier's finding; raised as OQ-171 on its branch and renumbered at the merge, OQ-170 having been taken on `main`
meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every stop of a setup step gets the 2 s grace
before the force-kill — a close, a workspace switch's cancellation, Cancel and, by the same reading, an exhausted stage
budget, which REQ-WORKSPACE-092 bounds by the same 5 s — so REQ-WORKSPACE-092's 5 s holds at each; by
[`PD-MCP-003`](../../../product/directives/pd-mcp-003.md#pd-mcp-003), which narrows REQ-MCP-099's 5 s grace. Built the same day
(`SETUP_TERMINATE_GRACE_MS` in `packages/mcp/src/setup.ts`, equal to `SETUP_SHUTDOWN_GRACE_MS`; `setup.test.ts`).

At an orderly quit the window's close cancels the initialization run, so the step in flight is asked to terminate under
REQ-MCP-099's cancellation: 5 s, then the force-kill. The run host's `shutdown` follows within milliseconds (measured
2026-10-01 on the built app: "mcp setup: cancellation requested" at 12:08:26.943, "ended by the run host's shutdown" at
.948). A step that uses its whole 5 s grace is force-killed only when the close's 5000 ms are already spent, with the
poll, the force-kill's own settling and the host's exit still to come, so REQ-WORKSPACE-109's close and
REQ-WORKSPACE-092's "5 s later" cannot both be met beside REQ-MCP-099's full grace. The specification states the grace for
a cancellation and the bound for a close, and says nothing of a cancellation that a close causes.

**What the build proceeds under** (`packages/mcp/src/setup.ts`, `SETUP_SHUTDOWN_GRACE_MS` and `terminateSetupChild`'s
`hurry`; `apps/desktop/src/run-host/mcp.ts`, `McpHost.endSetup`): at a close, REQ-WORKSPACE-109 and REQ-WORKSPACE-092
bound the step. The run host's shutdown asks the step's process group to terminate and force-kills it after 2 s, and a
cancellation already under way when the shutdown arrives has its remaining grace cut to 2 s from that moment. So at every
orderly quit with a step running, REQ-MCP-099's 5 s grace is not given. A cancellation while the application stays keeps
the full 5 s. The 2 s is the build's figure: it leaves the close room for the poll, the force-kill's settling and the
host's exit inside 5000 ms (measured: a step and a descendant that both ignore SIGTERM, force-killed, the quit 2234 ms and
2274 ms).

**Windows measurement, 2026-10-02.** `workspace-proof` on this host passed the project-switch cancellation and the
replacement's initialization, but failed two REQ-WORKSPACE-092 liveness checks: after a switch, the outgoing step's PID
was still present 5 s after the switch answered; after Cancel in the first of two windows, that window's step PID was
still present 5 s after Cancel answered. The product recorded the cancellations and the next workspace's completed
setup. Its log put the switch's cancellation request at 07:30:49.974 and the stopped step at 07:30:55.463 — 5.489 s
apart. The Cancel request was at 07:31:19.411 and its stopped step at 07:31:25.014 — 5.603 s apart. An orderly quit
in the same proof passed its 5 s child and descendant checks under the shorter shutdown grace. This extends the
question to a workspace switch and an explicit Cancel while the application stays open: REQ-WORKSPACE-092 gives each
the same 5 s liveness bound while REQ-MCP-099 gives cancellation a full 5 s before force-kill. The build still follows
the existing reading; no timing rule is changed by this observation.

**Windows re-measurement under PD-MCP-003, 2026-10-20** (the Windows ARM64 session's B8; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `9f898a00`). Both checks the
paragraph above found failing pass. Two `workspace-proof` runs: the switch's step ended 2,621 and 2,513 ms after the switch
answered, the Cancel's 2,612 and 2,520 ms after the Cancel answered, and the log puts each cancellation's request 2.441 to
2.604 s before its stopped step, where it read 5.489 s and 5.603 s; the orderly quit took 2,706 and 2,713 ms. Nothing the steps
launched was running straight after either run or 10 s later.

**What a ruling decides.** Whether a close's cancellation is REQ-MCP-099's cancellation, with its 5 s grace (and then
whether REQ-WORKSPACE-109's 5000 ms and REQ-WORKSPACE-092's 5 s give way, or the grace is counted inside them); or the
close's own, bounded by REQ-WORKSPACE-109 and REQ-WORKSPACE-092 alone; and, if the latter, what grace the step is given
before the force-kill.

<a id="oq-173"></a>

**OQ-173 — Is a wait the run imposes on an agent, or a compression's own model call, silence for the stall watchdog?**
*(REQ-MONITOR-117, "each agent is evaluated for a stall"; REQ-MONITOR-118, which excepts only "active tool calls",
reported "at informational level as waiting on N active tool calls instead of as a stall"; REQ-MONITOR-119, "no model
event or token"; REQ-ORCH-089; REQ-ORCH-091 (c) and REQ-ORCH-092, the suspended wait on a provider limit and the retry
backoffs; REQ-NOTIFY-083 to REQ-NOTIFY-087, the suspended wait's own notice; REQ-MONITOR-076 and REQ-ORCH-093 with
ADR-0060, the automatic compression and the condensation on a rejection; OQ-153; OQ-155; REQ-NOTIFY-112 and OQ-127,
whose no-output window the wait's end also restarts. Raised 2026-10-01 by the
repair of
[`a-provider-wait-or-a-compression-is-counted-as-a-stall.md`](../../../defects/fixed/a-provider-wait-or-a-compression-is-counted-as-a-stall.md).
~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current behaviour is accepted: a wait the run imposes on an agent (a retry backoff, a suspended wait on a provider limit) and a compression's own model call are outside the agent's stall watch, logged in the manner REQ-MONITOR-118 logs a wait on tools and with no timeline word, and the wait's end restarts the silence. The provider library's own short internal retries inside one model step stay counted as ordinary silence of that step. Read literally REQ-MONITOR-119 makes each of those waits a stall, so the ruling is carried, with OQ-155's, by [`PD-MONITOR-005`](../../../product/directives/pd-monitor-005.md#pd-monitor-005), which narrows REQ-MONITOR-118 and REQ-MONITOR-119 to the silence of a model step the agent has in flight.

An agent's stall watch counts the silence since its last model event or token. Between two of its model steps the run
can hold an agent where it has no step in flight and no tool call either: `resilientStep`'s backoff before a transient or
validation retry (at most 2 s), its suspended wait on a provider limit — the provider's retry-after, the local backoff
doubling from 60 s, or indefinitely for an exhausted provider — and a context compression, whose own model call runs
before the agent's next step (automatic) or inside it (on a rejection), up to REQ-MONITOR-080's 120 s. Read literally,
REQ-MONITOR-119 makes each of those, past the threshold (90 s by default), a stall: an `… appears stalled` warning, a
`stall` issue at every evaluation, and the `stalled Ns` badge, beside the wait's own notice (REQ-NOTIFY-083 to
REQ-NOTIFY-087), which already says the agent is waiting and why. REQ-MONITOR-118 tells a stall from a wait only by tool
calls in flight, and no requirement says whether a wait the run itself imposes, or a compression's model call, is the
agent's silence.

**What the build proceeds under.** As OQ-155 reads for a child waiting on its own children: the watch measures the
silence of the agent's own model steps, and a wait the run holds it in is not that silence. While the ladder backs off or
waits on a provider limit, and while a compression runs, the watch is told so (`StallWatch.imposedWait`, released when
the wait ends however it ends); an evaluation past the threshold then reports no stall, its callback reads *not stalled*,
so no `stall` issue is written and no stalled seconds reach the record. The silence is logged at REQ-MONITOR-118's
informational level, in its manner, as `… waiting on a provider limit: …` (or `a retry backoff`, `a context
compression`), at entry and at each repeat the throttle allows, to the session log through the run's `warn`, as OQ-127
reads for the wait on tools; no timeline word is minted. *(Since OQ-127's ruling, 2026-10-06, [R-071](../../../product/requests.md#r-071):
through the run's `info`, at `INFO`, by `stallRecords` in `packages/engine/src/children/stall.ts` — the `warn` channel
above no longer holds; still no timeline word for this wait. This is a correction of the build's state, not a ruling of
this question.)* A stall under way when such a wait begins is over, and not
recovered (OQ-153). The wait's end restarts the silence, as a tool call's result does, so the next step is counted from
it, and so is REQ-NOTIFY-112's window. The root's watch and each child's are wired alike (`Run.turn`, `execute`; tests
in `stall.test.ts`, `ladder.test.ts` and `compression.test.ts`; `resilience-proof`'s `quota-wait` scenario).

**What the reading does not cover.** The dispatch layer's own retries inside one model step (REQ-CONFIG-086's
`num_retries`, before the ladder; OQ-110) send no event while they wait either, and stay counted as the step's silence; a
manual compression (Part AO) runs beside the step in flight and is not a wait of the agent's.

**What a ruling decides.** Whether a wait the run imposes, and a compression's model call, are outside the stall watch
(as built), are stalls as REQ-MONITOR-119 reads literally, or are reported in words of their own — which REQ-ORCH-139's
vocabulary does not have — and whether the dispatch layer's retry delays are such a wait too.

<a id="oq-174"></a>

**OQ-174 — Does a child's recorded MCP grant keep a tool a mid-run list update withdrew?** *(REQ-MCP-065, "Each child
run's persisted state SHALL record both its granted native tools and its granted MCP tools"; REQ-MCP-060, a mid-run
update "SHALL only ever narrow" the callable set, the withdrawn name "ceases to be callable at once", and narrowing "SHALL
NOT … re-render the prompt"; REQ-MCP-114, the inspector's per-server list "sourced from the run's own recorded evidence,
so it reads the same for a finished run as for a running one"; REQ-MCP-100, the persona window's line per server from the
same evidence; REQ-MONITOR-060, the inspector's chips. Raised 2026-10-01 for
[`a-childs-recorded-mcp-grant-keeps-a-tool-a-mid-run-list-update-withdrew.md`](../../../defects/fixed/a-childs-recorded-mcp-grant-keeps-a-tool-a-mid-run-list-update-withdrew.md)
by the second triage of open defect notes, which judged it the owner's. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current behaviour is accepted, and the recorded grant is defined as what the child was given when it started (its tool port's readiness). A tool a mid-run list update withdraws stays in the row's `granted_mcp`, unmarked, and every surface that reads the record lists it as granted; it is no longer callable, and a call to it is refused (REQ-MCP-062). REQ-MCP-065's "granted" is that grant, so this ruling settles it; [`a-childs-recorded-mcp-grant-keeps-a-tool-a-mid-run-list-update-withdrew.md`](../../../defects/fixed/a-childs-recorded-mcp-grant-keeps-a-tool-a-mid-run-list-update-withdrew.md) closes with it.

A child's row records its MCP grant once, when its tool port is ready (`ChildLedger.recordGrant` →
`SessionWriter.recordChildGrant`, once per execution). When a carried server then publishes a changed tool list,
REQ-MCP-060's recomputation narrows the callable set: the port deletes the withdrawn tool's executor from its callable
map and logs the withdrawal (`McpHost.executorsFor`'s `onToolsChanged`, `apps/desktop/src/run-host/mcp.ts`, through the
port's `remove`, `apps/desktop/src/run-host/tools.ts`). The row's `granted_mcp` is not rewritten, so the inspector
(REQ-MCP-114, REQ-MONITOR-060) and the persona window (REQ-MCP-100) go on listing the withdrawn tool under its server,
for the rest of the run and for the finished run. The specification says "granted" for what configuration allows and
"callable" for what a mid-run update leaves, and does not say which the record holds. Not reproduced in a built app:
`mcp-proof`'s launch 4 narrows the run-level agent, whose grant is not recorded on a row.

**What the build proceeds under.** The recorded grant is the grant at readiness. A tool withdrawn mid-run stays in the
row's `granted_mcp`, unmarked, and every surface that reads the record lists it as granted; it is no longer callable,
and a call to it is refused per REQ-MCP-062 (`mcp-proof` launch 4). The prompt is not re-rendered (REQ-MCP-060), and the
record, a different reader, is not rewritten either.

**What a ruling decides.** Whether the record keeps the grant at readiness (as built); follows the callable set, the
withdrawn tool dropped from the row when the update narrows it; or keeps it marked as withdrawn mid-run, so a finished
run's record shows both what was granted and what was taken away — and, for either of the last two, whether the surfaces
draw a withdrawn tool at all.

<a id="oq-175"></a>

**OQ-175 — What is a code-intelligence setup step's detail when REQ-WORKSPACE-092's "last 400 bytes of its output" has
nothing to give?** *(REQ-WORKSPACE-092, "every other step's detail SHALL be the last 400 bytes of its combined standard
output and standard error"; REQ-WORKSPACE-091, "where a stage's subcommand is unavailable, that stage SHALL fail and be
reported under REQ-WORKSPACE-093 as any other stage failure is"; REQ-WORKSPACE-093, "{reason}: {detail}"; REQ-MCP-099 and
REQ-MCP-112, whose words for the same steps stay the MCP category's. Raised 2026-10-01 by the repair of
[`the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`](../../../defects/fixed/the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md),
as OQ-174, and renumbered OQ-175 at its merge because `origin/main` had taken OQ-174 meanwhile. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the current behaviour is accepted, the trim included: a step not attempted and a step that wrote nothing have an empty detail, a step whose command could not be started reads in the launch's own error text, a failed stage with an empty detail takes the setup's final sentence as its `{detail}`, and the last 400 bytes are taken of the output once it is trimmed of its leading and trailing blank space. [`PD-WORKSPACE-006`](../../../product/directives/pd-workspace-006.md#pd-workspace-006) narrows REQ-WORKSPACE-092 and REQ-WORKSPACE-093.

`code-intelligence-setup`'s step rows now read in this domain's words: a stopped step in REQ-WORKSPACE-092's two fixed
sentences, a creation the marker skipped and the two stages a `non-code` workspace skips in REQ-WORKSPACE-091's, and every
other step in the last 400 bytes of its output, with no prefix. Three kinds of step have no output to give: a step **not
attempted** (an earlier one failed, or the setup was cancelled between steps), a step whose command **could not be
started** (the launch itself failed — no such file, no permission), and one that ran and **wrote nothing**, whether it
succeeded or exited non-zero. Read literally, each detail is empty, and a failed stage's error is then "{reason}: " with
nothing after it.

**What the build proceeds under** (`apps/desktop/src/main/initialization.ts`, `stepDetail`, from the facts the run host's
status carries beside its own `detail`: `skipped`, `output` and `startError` on `McpSetupStep`): a step not attempted and a
step that wrote nothing have an **empty** detail — the step's status (`not-attempted`, `succeeded`, `failed`) says what
happened. A step that could not be started reads in the **launch's own error text** (for example "spawn /opt/ci ENOENT"),
without the run host's "the setup command could not be started: " — the nearest thing to output such a step has, and the
only account of why the stage failed. A failed stage whose detail is empty takes the setup's final sentence as the error's
"{detail}" ("A step failed, so the workspace is only partly set up."), as `resultOf` already did for a failed setup with no
failed step; that sentence is the run host's (REQ-MCP-112's final outcome). The output's tail is cut where a UTF-8
character begins, so a cut never splits one (`lastUtf8Bytes`), and it is the captured output trimmed of its leading and
trailing blank space.

**What a ruling decides.** Whether an empty detail is what REQ-WORKSPACE-092 means for these steps or each has a sentence
of the specification's own; whether a step that could not be started reads in the launch's error, in a fixed sentence, or
empty; and what a failed stage's "{reason}: {detail}" reads when its detail is empty — the build's reading borrows the
run host's final sentence there, REQ-MCP-112's words in this domain's error, the same crossing of categories the repair
removed from every other detail. It also decides whether "the last 400 bytes of its combined standard output and standard
error" are counted on the output as written or, as built, on the output trimmed of its leading and trailing blank space:
the two differ for output that ends in blank lines, and for a tail whose first characters are blank.

<a id="oq-176"></a>

**OQ-176 — Does REQ-SHELL-166's 100 ms echo hold on a host whose CPUs other processes oversubscribe?** *(REQ-SHELL-166,
echo latency "within the 100 ms gesture budget of REQ-SHELL-150, measured from the key press to the frame that shows it";
REQ-SHELL-150, whose "sustained load" is a burst of changes in the shell, "a build that misses any of the three under
sustained load fails this requirement". Raised 2026-10-01 while repairing (measured that day; first committed 2026-10-02)
[`terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md`](../../../defects/fixed/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md)
under R-062. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the specification is amended: REQ-SHELL-166's 100 ms echo applies on a machine whose CPUs other programs do not oversubscribe, a load average at or below the CPU count; a red taken above it is run again with the host quiet, and a red on a quiet host is the product's. The bound itself is not relaxed. [`PD-SHELL-007`](../../../product/directives/pd-shell-007.md#pd-shell-007) narrows REQ-SHELL-166.

`pnpm terminal-proof`'s `live.echoUnder100ms` was run 120 times on 2026-10-01, with busy loops pinned beside the proof on
one or two of the host's four CPUs and another plan's agents on the host. It went red in 10 runs, at load averages 9.1 to
13.6. Each time one keystroke of three missed the bound (100 to 144 ms), and the other two passed at 18 to 93 ms. The time
went into the run host's frame (key to frame up to 130 ms) or into waiting for the frame to paint. Where it was recorded,
the key had waited in the renderer's queue for at most 11 ms. With no busy loops beside it, the same probe read key to
paint at 20 to 30 ms. The requirement's load is the shell's own (a burst of changes), and REQ-SHELL-166 states no host
condition; neither says whether the bound applies when other processes keep the CPUs busier than the product can be.

**What the build proceeds under.** The bound is kept as stated and is not relaxed for load. The proof records the host's
load average and CPU count beside the reading (`results.live.echoLoad`) and how long the key waited in the renderer's queue
(`queuedMs`). Since 2026-10-02 the reading starts at the key event's own time stamp, so that wait is inside the bound
(`from: 'event'`); until then it started when the page's listener ran and the wait was recorded beside it. A red taken at a load average above the CPU count is run again alone, as the host's own rule says
(`.agents/skills/orchestrated-build/references/environment.md`, "Load"). A red alone is the product's.

**What a ruling decides.** Whether the 100 ms applies on any host the product runs on, whatever else that host runs;
or on a host whose CPUs are not oversubscribed, so a red under a load above the CPU count is evidence about the host; or
on a stated reference host and load.

<a id="oq-177"></a>

**OQ-177 — Does a user's switch of the entry model onto the model the run was configured with end a move the ladder made?**
*(REQ-MONITOR-142, "A switch of the run's entry model … applies from the next iteration onward"; REQ-ORCH-090, the role's
fallback "tried once per child by rebuilding the agent and transparently re-running"; REQ-ORCH-091 (b), "at most one
same-tier automatic model fallback per child", and (d), a manual model change "persists the override in session state for
the rest of the session"; REQ-MONITOR-194, a pair chosen explicitly is "eligible again". Raised 2026-10-02 by the repair of
[`an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md`](../../../defects/fixed/an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md),
as OQ-176, and renumbered OQ-177 at its merge because `origin/main` had taken OQ-176 meanwhile. Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every explicit switch wins — a switch of the
entry model from the run header or the inspector ends an automatic fallback, as built, and also takes back any earlier
quota-wait override of the chosen pair, as the quota-wait surface already does, so the entry agent runs on the pair chosen
from the next iteration; an agent that had already followed the override stays where it moved. Minted as
[`PD-ORCH-013`](../../../product/directives/pd-orch-013.md#pd-orch-013), narrowing REQ-ORCH-091 (d) and REQ-NOTIFY-089, and built the same
day (`Run.setEntryModel` calls `takeBackOverrideOf` on the header path; plan fin21). The reading below is kept as the build
proceeded under it until then.

After the ladder moves the entry agent off its configured model — to the role's fallback when the model is unresponsive
(REQ-ORCH-090), or to a same-tier model on another provider after a rate-limit or quota response (REQ-ORCH-091 b) — the
user can switch the entry model to the configured key from the run header or the inspector. The specification says a
switch applies from the next iteration and says nothing of a switch that names the model the run already asked for, which
only the ladder's move makes a change. Read as a switch, it ends the move: the user chose that model. Read as no change,
the move stands, since nothing the user asked for differs from what the run was asked to use. The same question arises
for a switch onto a pair a change-model resolution moved during an earlier wait (REQ-ORCH-091 d), whose override the
requirement keeps "for the rest of the session", and REQ-MONITOR-194, which lets an explicit choice of an excluded pair
make it eligible again, bears on it without settling it.

**What the build proceeds under** (`packages/engine/src/run/run.ts`, `rootResilience`, `setEntryModel`,
`setEntryReasoning`; `ResilienceMemory.overrideReaching`): a switch is the user's choice and applies. From the next
iteration the root's cell is rebuilt on the chosen model, ending a REQ-ORCH-090 or REQ-ORCH-091 b move, whether or not the
key names the model already requested; the cell's once-per-agent budgets (the one unresponsive fallback, the one same-tier
fallback, the pairs already attempted) carry over, so the ladder does not move the agent automatically more often than the
requirements allow. A reasoning switch is not a model switch: the move stands and the level changes on the model the cell
has. A change-model resolution's override (REQ-ORCH-091 d) is left standing for the rest of the session, as the
requirement says, so a switch onto the pair it moved runs on the override's model, and the row says so in place of "it
applies from the next iteration": "Entry model switched to X, but Y, chosen for P/M during an earlier wait, stands for the
rest of the session: the entry agent runs on Y from the next iteration." The iteration in flight finishes on the setting
it had: the root's ladder is read once per root turn, so a root resumed after its children in the same iteration is not
moved by a switch made meanwhile. The exclusion of an exhausted pair is not touched by a switch (whether an explicit choice
clears it is REQ-MONITOR-194's, recorded in
[`an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md`](../../../defects/fixed/an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md); *since 2026-10-02 an explicit choice clears it, on a switch and in a quota wait, where the waiting pair itself may be chosen*).

**What a ruling decides.** Whether a switch onto the configured key ends a ladder move (as built) or leaves it in force —
and, if it leaves it, what the row says; whether a later switch onto a pair an override moved supersedes that override for
the entry agent, or the override stands (as built) and only the row says so. REQ-MONITOR-194's clearing is in force beside
it since 2026-10-02, which sharpens the second half: a pair a quota wait moved is both excluded and overridden, and a later
switch onto it clears the exclusion while the override, as built, still sends the entry agent elsewhere — so the pair the
user explicitly chose is not what runs, and only the row says so. The wait path is read the other way, and the two
readings stand side by side: a choice made on a wait surface (REQ-MONITOR-303's "change model now … resolves the wait as a
retry on the chosen model") takes back any override an earlier choice set from the pair chosen, so the agent resumes on it
as the wait's row says (`Run.takeBackOverrideOf`, since 2026-10-02, the third round of
[`a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md`](../../../defects/fixed/a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md));
a ruling that a switch also supersedes the override would make the header and inspector path match it.
