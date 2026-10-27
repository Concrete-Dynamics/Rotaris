# Open questions — Spikes, and the questions raised since (15 of 35)

Part 48 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-215, OQ-219, OQ-224, OQ-223, OQ-225.

**OQ-215 — Do the built-in search and listing tools skip the code-intelligence runtime's marker directory, and do its
memories leave the workspace?** *(REQ-TOOLS-140, the hard-coded ignore components, a closed list holding `.rotaris` and not
the runtime's directory; REQ-TOOLS-139, the scan filters, which honour "the workspace's `.gitignore`" and nothing else, and
serve a file named by its path; REQ-TOOLS-134, the directory and parent listings, which skip "entries whose name is one of
the ignore components of REQ-TOOLS-140"; REQ-MCP-116, the binding manifest that names the marker file; REQ-MCP-034,
REQ-MCP-099 and REQ-MCP-102, the runtime's project path, its marker and the memories that persist across runs;
REQ-WORKSPACE-100; OQ-161's ruling, which accepted the listing; OQ-195, deferred. Raised 2026-10-07 from findings L3 of the
orchestrator's duress live run at `c2fdd6a` and N6 of its duress live run at `c2a9444` (2026-10-06, the self-hosted
endpoint), and ruled the same day.)*

OQ-161's ruling (R-071) accepted that the file tools list the runtime's directory: the load writes it to the repository's
`info/exclude`, so Git treats it as the product's housekeeping, while the scan reads only the root `.gitignore` and shows it
to the agents as the user's content. That clause was accepted on one run's evidence (`27a5127`, finding H3: 38 calls by 5
agents and 80 rows naming `.serena`). The two duress runs since measured it again. At `c2fdd6a` (L3), 5 agents made 41 calls
and wrote 112 rows naming it, and 37 of the failed child d2's 45 requests, 1,142.5 s of its 1,222.6 s of generation, reasoned
about `.serena`, `.rotaris` or `.git` on the run's critical path; both defects the user was told of concerned product files.
At `c2a9444` (N6), 28 calls and 96 rows named it, a `write_memory` put a file in the tree, and the delivered overview listed
the runtime's files as repository files. The build handled the directory two ways: REQ-TOOLS-140's `cache` hid its `cache/`
and listed `project.yml` and the memories.

**What the build proceeded under, until 2026-10-07.** OQ-161's ruling as built: `IGNORE_COMPONENTS`
(`packages/agent-tools/src/tools/search.ts`) held REQ-TOOLS-140's list alone, so grep, glob and `read_file`'s listings walked
the directory; the version-control half (`keepScopeDirIgnored`, `packages/config/src/load.ts`) held in all four duress runs.

**What a ruling decides.** Whether the directory joins the hard-coded components (a directive extending REQ-TOOLS-140's
closed list), the scan honours `info/exclude` (a rewrite of REQ-TOOLS-139 that covers no workspace where no line is
written), or the memories leave the tree (against REQ-MCP-034, REQ-MCP-099 and REQ-MCP-102, on a runtime option no manifest
field records); or the ruling stands.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** the code-intelligence runtime's
marker directory joins REQ-TOOLS-140's hard-coded ignore components under
[`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012). Its name is read from the binding manifest of REQ-MCP-116. grep and
glob scans and `read_file`'s directory and parent listings therefore skip it as they skip `.rotaris`, and `read_file` and
`haet_read` still serve a file inside it when it is named by path. The rest of OQ-161's ruling stands as built: `.rotaris/`
alone goes in `.gitignore` and the marker's directory in the repository's `info/exclude`; the marker and its memories stay in
the workspace root and are reached through the memory tools; the agents' instructions are unchanged; and where an isolated
tree's memories live stays with OQ-195, which the owner deferred. **The two recommendations weighed:** advocate A (the
user's lens) recommended revising OQ-161's listing clause so the directory, named from the manifest, joins the hard-coded
components, with the memories, the exclude line and the instructions left as built; advocate B (the system's lens)
recommended the same revision, minted as `PD-TOOLS-012` extending REQ-TOOLS-140, in a new entry with a superseding line in
OQ-161's. The ruling followed **both**, in B's shape for the record; A's later sentence in the agents' instructions waits on
measurement. A scan rooted inside an ignored component, which the ruling found still walked, is a separate question, OQ-219.
**Built 2026-10-07 (fin27):** `IGNORE_COMPONENTS` takes `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]` from `@rotaris/config`; the
one set feeds the walker and `listing` (`files.ts`). The ruling's premise that the parent listing of a missing path already
skipped `.rotaris` was false: it skipped nothing, recorded and repaired in the same bundle
([`a-missing-paths-parent-listing-shows-the-ignore-components.md`](../../defects/fixed/a-missing-paths-parent-listing-shows-the-ignore-components.md)),
so it now reads the same set. Pinned by the case "the code-intelligence marker directory is a
hard-coded ignore component, named by the manifest" in `packages/agent-tools/src/tools/tools.test.ts`, red on `d12f1f2`.
Findings L3, N6 and H3 close with it; the next duress live run is the measurement.

**Measured 2026-10-07, the first live execution (the duress run at `a68f121`, pack `2026-10-07T07-09-30-708Z`, session
`e6747bd0`, finding D4):** the file tools held as ruled — the six whole-tree `glob **/*` calls (#1, #24, #29, #73, #126, #135)
and `**/.*` (#65) listed neither directory, and 0 file-tool calls named one — and the terminal remainder cost: 21 calls and
32 rows named the directories (against 28 / 96 at `c2a9444`), and they reached the delivered report, the answer and a project
memory. So the remainder clause fired, and it is raised as OQ-230. **Instructions clause revised 2026-10-07 by OQ-230 (below)
([R-072](../../product/requests.md#r-072)):** "the agents' instructions are unchanged" no longer holds: every agent receives a
product statement as its last context unit (`PD-TOOLS-012` revision 2). The text above is kept as it was ruled.

**Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`:** the duress measure. No
file-tool result listed the marker directory, no memory, answer or delivered file named it, and `.rotaris` reached a deliverable
only as `docs/overview.md`'s faithful quote of the workspace's `.gitignore` line; the calls and rows naming either directory are
read in [`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012)'s report-back, which breaks down why their count is not like for
like with `a68f121`'s. Held as ruled. Evidence: [`live-552d346-duress-autopsy.md`](../live-runs/live-552d346-duress-autopsy.md). The row is in [`first-executions.md`](../first-executions.md).

**OQ-219 — Beneath an explicit `grep` path or `glob` base inside an ignored directory, what does a scan return?**
*(REQ-TOOLS-139, the scan filters: "paths containing a hard-coded ignore component are skipped", the workspace's
`.gitignore` honoured with "directories pruned during traversal", and the explicit-naming exemption given to `read_file`
and `haet_read` alone; REQ-TOOLS-140, the components; REQ-TOOLS-141, a `glob` base "outside the workspace or not a
directory is silently ignored"; REQ-TOOLS-138, workspace-relative result paths; REQ-TOOLS-134, whose listing skips "entries
whose name is" a component. Raised 2026-10-07 by the R-072 consortium while ruling OQ-215 (live-run finding L3 at
`c2fdd6a`, where the failed child d2 tried `glob .rotaris/**`, `.git/**` and `**/HEAD` and got unexplained empty answers),
and ruled the same day.)*

The walker tested only the names of entries below a base, never the base or its ancestors, and tested gitignore rules
against each entry's full path, whose rules also match descendants. So the answer for a base inside an excluded directory
depended on how the user spelled one line: under `node_modules/` a scan rooted at `node_modules/pkg` served the package's
top-level files and dropped every subdirectory; under `node_modules` it served nothing; with no line it served everything but
nested `dist`, `build`, `out`, `cache` and `node_modules`. `glob '*.js' base_path='node_modules/x'` returned a file that
`glob 'node_modules/x/*.js'` did not, and `glob '*' base_path='.rotaris'` listed the product's own state. A `grep` entry
naming one file walked its parent's whole subtree and compared lower-cased paths, so on a case-sensitive disk naming
`src/a.ts` also searched `src/A.ts`. Recorded as
[`an-explicit-search-base-inside-an-ignored-directory-is-walked.md`](../../defects/fixed/an-explicit-search-base-inside-an-ignored-directory-is-walked.md).

**What a ruling decides.** Whether an explicit base is the caller's decision (the component and gitignore filters stand
aside below it, as `read_file`'s exemption does for a named file, which needs a directive), whether REQ-TOOLS-139 governs as
written (a scan beneath any base returns exactly the whole-workspace scan beneath it), or whether the build's middle reading
(the base honoured, nested components still skipped) is confirmed.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** REQ-TOOLS-139 governs as written.
Beneath any explicit grep `paths` entry or glob `base_path`, a scan returns exactly what the whole-workspace scan returns
beneath that base, so no result path contains a REQ-TOOLS-140 component or lies under a directory the workspace
`.gitignore` prunes, and a grep entry naming one file is searched only when the whole-workspace scan would search that file.
An excluded base stays the base (REQ-TOOLS-141 replaces only a base outside the workspace or one that is not a directory)
and answers `No matches found` or `No files found`. The grep and glob descriptions state this filter and direct the caller to
`read_file`, which serves a named file, searches it with its `grep` argument and lists a named directory. **The two
recommendations weighed:** advocate A (the user's lens) recommended that the caller decides on an explicit base, the
component and gitignore filters standing aside below an excluded base under a directive, so a search inside a named
dependency is not a false `No matches found`; advocate B (the system's lens) recommended the literal reading of REQ-TOOLS-139
as one invariant, a scan rooted at a base equal to the root scan restricted to it, repaired without a directive. The ruling
followed **B**: A's exemption would need a directive and would open `.rotaris` and `.git` to bulk scans, and no autopsy
records a scan rooted in an ignored directory; A's point that an unexplained empty answer is read as fact is kept in the two
descriptions. No directive is minted: the requirement is faithful and the code departed from it. **Built 2026-10-07
(fin27):** `scanExcludes` and the base test in `walkFiles`, and the direct search of a named file in `grepTool`
(`packages/agent-tools/src/tools/search.ts`); pinned by the five cases under "an explicit base or a named file inside an
excluded directory yields nothing" in `packages/agent-tools/src/tools/tools.test.ts`, four red on `d12f1f2` (the fifth, a
run rooted under `.rotaris/worktrees/<w>`, guards the repair). Noticed while ruling and recorded open, not repaired here:
[`a-re-included-directory-under-an-ignored-glob-keeps-its-files-ignored.md`](../../defects/fixed/a-re-included-directory-under-an-ignored-glob-keeps-its-files-ignored.md). **Repaired 2026-10-07 (fin30):** a rule now matches
the path itself and nothing beneath it, and `ignoredBy` asks every proper directory prefix before the path, in git's
order, so `gen/*` then `!gen/keep/` keeps `gen/keep/f.ts` for the search tools and the contains-code walk alike
(`packages/config/src/init/gitignore.ts`).

**OQ-224 — For REQ-GIT-119's lock, REQ-GIT-120's force and refusal and REQ-MONITOR-251's placement, which runs are "another
run is active"?** *(REQ-GIT-119, the launch dialog's mandatory isolation "while another run is active", its tooltip and hint;
REQ-GIT-120, "whenever any run is active" a launch without an explicit tree is forced into one and a base-workspace session's
resume refused; REQ-MONITOR-251, "the second and any subsequent concurrent launch"; REQ-GIT-124, which counts "a session lock
in this workspace" and calls itself consistent with REQ-GIT-119 and REQ-GIT-120; REQ-MONITOR-256 and REQ-MONITOR-258, the
resume half scoped "there" and "in a workspace where a run is already executing"; `PD-SHELL-002`, "while any run is active in
the workspace, the dialog SHALL lock", and "a window of another project is untouched by all of this". Raised 2026-10-07 by
the R-072 consortium as its question GI1, from
[`the-launch-dialog-locks-isolation-only-for-a-run-in-its-own-workspace.md`](../../defects/fixed/the-launch-dialog-locks-isolation-only-for-a-run-in-its-own-workspace.md)
(fin28's repair round 1), and recorded here as OQ-224, the number the round assigned it. ~~Open.~~ **Ruled 2026-10-07.**)*

The launch dialog locks isolation on for a busy session of its own workspace (`currentBusy || listBusy` over the window's
session list, `apps/desktop/src/renderer/main.tsx`), while `session.start` forces a launch without an explicit tree into
`rotaris/session/<id>` whenever the run host counts a run anywhere in the instance (`runs.active` with the empty id, since
fin28's repair round 1, `32ac0c0`). So in an idle project's window, while another project's run executes, the dialog offers
isolation unchecked and the launch it shows on the base tree lands in a worktree; and in a non-Git folder, a subfolder of a
repository or a detached HEAD the forced launch fails, about a run in another window. REQ-GIT-120's "any" reads
instance-wide; REQ-GIT-119's hint ("Two runs sharing one working tree would overwrite each other's edits") and the
requirements around it read per workspace. Neither surface agrees with the other, and a workspace folder nested inside
another open workspace shares files with it whichever reading is taken.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** in REQ-GIT-119, REQ-GIT-120 and
REQ-MONITOR-251, a run is active for a launch or a continue in a workspace when it is active and either belongs to that
workspace, whatever tree it runs in, or writes in a tree that is that workspace's folder, lies inside it or contains it. A run
of an unrelated project never counts. Main asks the run host that one count. The launch dialog shows main's answer when it
opens: locked, with REQ-GIT-119's tooltip and hint, when the count is above zero or cannot be read, and unchecked and
enabled, with REQ-GIT-118's hint, otherwise. `session.start` forces the default tree on the same answer, and every time it
forces it raises an informational notice carrying REQ-GIT-119's hint and the branch. REQ-GIT-120's refusal to continue a
base-tree session is built on the same count, with that session excluded. This is recorded as
[`PD-GIT-001`](../../product/directives/pd-git-001.md#pd-git-001), which narrows REQ-GIT-119, REQ-GIT-120 and REQ-MONITOR-251.

**The two recommendations weighed.** *Advocate A (the user's lens)*: "another run is active" means a run active in the
launching window's own workspace, a workspace folder nested inside or around it counting as the same workspace; main asks
that one count and the dialog shows main's answer; recorded as `PD-GIT-001`, narrowing the three requirements. *Advocate B
(the system's lens)*: the same per-workspace reading, as equality of the session row's workspace — the dialog as built, main
pointed back at the window's own count, classified as covered with no directive, and the unbuilt resume half recorded and
built. **The ruling followed both**: the per-workspace reading both take, which PD-SHELL-002, REQ-GIT-124 and
REQ-MONITOR-256/258 support; A's directive, whose back-pointer stops a later reader of REQ-GIT-120's "any" re-keying it as
fin28's verifier did, and A's containment rule, without which a base-tree launch in `/repo` would share files with a live run
in a window open on `/repo/app`; and from B the history corrected beside the claim it replaces and the resume refusal placed
at continuing, with the session excluded. Neither settled two things, which the ruling adds: an unreadable count locks the
dialog and forces the worktree, and a forced placement says so.
[`a-base-tree-session-continues-beside-another-run-in-its-workspace.md`](../../defects/fixed/a-base-tree-session-continues-beside-another-run-in-its-workspace.md)
records the unbuilt resume half, written before its code.

**OQ-223 — Does Settings › Runtime keep an "Improvement analysis timeout" control, and on what terms?** *(REQ-CONFIG-256's
"Written keys are exactly", REQ-CONFIG-263's Tier B overlay, REQ-CONFIG-323's four runtime policy toggles, REQ-CONFIG-325's
"two numeric policy limits" and REQ-CONFIG-417's destination 1, none naming `runtime.improvement_collector_timeout`;
REQ-LIBRARY-041, the improvement domain's one Settings row, the toggle; REQ-CONFIG-118 and REQ-LIBRARY-039, the key and its
60 s default; REQ-NOTIFY-100 and REQ-LIBRARY-023/124, a timed-out analysis and its notice; OQ-114's F4, the measured analyst
calls. Raised 2026-10-07 by the R-072 consortium as its question IT1, from
[`the-improvement-analysis-timeout-control-writes-a-key-no-settings-list-names.md`](../../defects/fixed/the-improvement-analysis-timeout-control-writes-a-key-no-settings-list-names.md)
(noticed while building OQ-218), and recorded here as OQ-223, the number the round assigned it. ~~Open.~~ **Ruled
2026-10-07.**)*

The runtime policy card draws a numeric "Improvement analysis timeout" control after the "Improvement loop" toggle, over
`runtime.improvement_collector_timeout` in seconds, committed by Save. No list the specification keeps names the key — the
desktop save's written keys, the Tier B overlay, the card's toggles, destination 1 — and the build left it out of
`TIER_B_RUNTIME_KEYS` too, so its on-screen value never reached a run unsaved; it got through only because
`DesktopSaveSchema` accepted any runtime key. Its hint names "the collector", it takes any positive number and has no unit
suffix. Whether the control stays (a directive) or goes (covered by the lists), the specification does not say.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** Settings › Runtime keeps the
"Improvement analysis timeout" control directly after the "Improvement loop" toggle. It shows whole seconds with a "seconds"
suffix, is clamped at the widget to 10–600, starts from the effective `runtime.improvement_collector_timeout` (60 by
default), is committed by Save, and is laid on the next run start by Tier B. A stored value outside 10–600 is shown clamped
with its exact seconds stated beneath and is kept until the field changes. When a post-run analysis reaches the limit, the
zero-proposal notice's detail says so. All of this is [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 2,
and the desktop save's runtime keys become a closed list that the screen's runtime keys must equal (REQ-CONFIG-256).

**The two recommendations weighed.** *Advocate A (the user's lens)*: keep the control and make it complete under a revision 2
of PD-CONFIG-003 — the seconds suffix, a 10–600 clamp, Save, the Tier B overlay, the four lists, a hint a person can act
on — and have a timed-out analysis's notice say so; the bound that decides whether the analyst's chosen model finishes
belongs beside the toggle it qualifies, and OQ-218 settled the same day that a kept ceiling is one the person can move.
*Advocate B (the system's lens)*: remove the control, keep the key file-only as REQ-CONFIG-118 and REQ-LIBRARY-039 state it
— covered work with no directive — and close the desktop save's runtime key set so REQ-CONFIG-256's "exactly" is enforced.
**The ruling followed A**: OQ-114's F4 timed three of six analyst calls past the 60 s that R-071 kept, a timed-out review
read as an ordinary empty one, and removing a working control just before ship would leave that outcome with no on-screen
remedy; B's counter-evidence (analysts cut about 4 s in) measured the live harness's quit. From B it took the closed save
list, the equality tests that would have caught this defect, and the objection to a delegation-titled directive, answered by
widening PD-CONFIG-003's heading. It departs from A on the dispositions: REQ-CONFIG-323's four toggles are untouched
(extended), and REQ-CONFIG-325's "two numeric policy limits" is the count that changes (narrowed). R-071 is not revised: the
60 s default stands.
[`a-timed-out-improvement-analysis-reads-as-one-that-found-nothing.md`](../../defects/fixed/a-timed-out-improvement-analysis-reads-as-one-that-found-nothing.md)
records the notice's half, written before its code.

**OQ-225 — What does the run do when REQ-ORCH-029's hold fires on an iteration that has answered?** *(REQ-ORCH-029, the
coordinator "does not report the run successful while a todo item is non-terminal or while a todo item's recorded state
disagrees with what happened"; REQ-ORCH-075, the re-queue's continuation payload, the stripped base payload plus the marker;
REQ-ORCH-078, todo-correction retries reusing the validation-retry setting, "default 0: … re-queues without an
in-conversation retry"; REQ-ORCH-072, a fresh root per iteration; REQ-TOOLS-155, a new root refused the previous root's
children; REQ-ORCH-067, iteration ends visible in the transcript; REQ-ORCH-077, the give-up at the third pending outcome;
PD-ORCH-009, the re-prompt of an answerless root. Raised 2026-10-07 from finding P1 of the final default live run at
`a68f121`, the pack's one FAIL: in session `5df89df3` (terminal) the coordinator answered in full (traffic #24, transcript
row 48) while its plan's "Report one line per command" read `PENDING`; with no correction the task was re-queued, the fresh
root (traffic #25: the task and the marker only; tool call `#25`, `background_output`, refused "not found among your
children") re-delegated the whole probe, and transcript row 54 told the person the report "never delivered". Recorded as
[`a-re-queued-tasks-fresh-root-cannot-see-the-answer-its-iteration-was-held-back-for.md`](../../defects/fixed/a-re-queued-tasks-fresh-root-cannot-see-the-answer-its-iteration-was-held-back-for.md),
repaired by fin31.
Ruled the same day.)*

The hold behaves as the specification states, and the G5 repair's note priced its cost ("the fresh root, which has none of
the previous conversation, may redo work to finish it"). What the specification does not settle is what a re-queued root
learns of the iteration it continues, and whether the root that wrote the answer should first be asked to record its plan's
true state while it still holds the evidence: REQ-ORCH-078's default of 0 says it is not.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** if the coordinating root of an
execution iteration answers `succeeded` while items of its own plan are still open, the run sends it at least one plan
correction in its own conversation. The count is the larger of 1 and `runtime.auto_retries_validation`. When the root has
already answered, the correction says the answer has been shown and asks the root to record each item's true state with the
todo tool. A turn that follows the correction is never asked again for an answer the execution has already written. If the
corrections are used up and the task is still re-queued (REQ-ORCH-075) or given up on (REQ-ORCH-077), the run writes one
`system` row in the transcript saying so. The re-queued task's next fresh root receives the held iteration's answer, cut to
6,000 characters, beside the continuation marker. The run never marks a plan item itself. Recorded as
[`PD-ORCH-015`](../../product/directives/pd-orch-015.md#pd-orch-015), which narrows REQ-ORCH-078 and extends REQ-ORCH-075, and as
[`PD-ORCH-009`](../../product/directives/pd-orch-009.md#pd-orch-009) revision 2. REQ-ORCH-092, REQ-CONFIG-120 and REQ-NOTIFY-100 (the
validation-retry setting's own default of 0) are untouched.

**The two recommendations weighed.** *Advocate A (the user's lens)* recommended an in-conversation correction by default,
with the count the larger of 1 and the validation-retry setting, a correction text saying the answer was shown and a done
item is recorded rather than redone, no re-prompt after an answer, and, where the hold still re-queues, a `system` row and
the held answer with the open item ids carried to the fresh root. *Advocate B (the system's lens)* recommended the same
floor of one correction kept apart from REQ-ORCH-092's default, the correction naming ABANDONED as a true state, a revision
of PD-ORCH-009 so a correction's silent turn after an answer is not re-prompted, and a `system` row on the re-queue, with
the fresh root's payload unchanged. **The ruling followed both**: B in keeping the floor off the shared setting's default,
its ABANDONED wording and its transcript row (extended to the give-up, which REQ-ORCH-067's iteration-end visibility already
asks for), and its numbering of the PD-ORCH-009 revision; A on the fallback, since without the held answer a root that
ignores its correction reproduces P1 one step later. It dropped A's item ids and children's replies. Both advocates rejected
letting the run tick a "report" item from the answer's wording (it would make the run's guess the plan's record), and so
does the ruling. Related and repaired separately, as a defect: finding P4, the follow-up payload's "Recent iterations" reading
timeline entries nothing writes.

**Built 2026-10-07 (fin31).** `Run.turn`'s correction closure counts to `max(1, validationRetries)`, keeps the execution's
answer (the re-prompt fires only while it is empty; the answer stays the report's text when the correction's turn writes
less), and `planCorrectionText(open, answered)` carries the ruling's two sentences; `Run.iterate` stores `Task.heldAnswer`
beside `planLeftOpen`, writes the `system` row (`planHeldRowText`) for a re-queue and a give-up, and `planCarryText(open,
heldAnswer)` hands the answer to the same task's next fresh root. The ruling's step 2 said both "the last non-empty text a turn
wrote" and "a correction turn's text replaces it only when it is longer"; the build keeps the first answer and replaces it only
with a longer one, which is what the ruling's own test ("Recorded." keeps the answer) asks. Pinned by eight cases in
`packages/engine/src/run/coordinator-plan.test.ts` (seven red on `a68f121`) and `run-pure.test.ts`; shown by `pnpm
part-h-proof`'s `plan-correction` launch. First execution reported in [`PD-ORCH-015`](../../product/directives/pd-orch-015.md#pd-orch-015)
and in [`first-executions.md`](../first-executions.md); the live terminal scenario waits on the orchestrator's next default run.
*Not reached at `552d346` (2026-10-13), written back by fin42:* the default and duress live runs met no root that answered with
its plan open (0 of 174 requests carry the correction; terminal session `8cf99832` closed both of its items before answering)
and no re-queue (0 requests carry "previous iteration on this task"), and no root answered empty (0 re-prompts). The terminal
outcome held by the model's behaviour, not by the correction. The live measure stays owed and a default run does not reliably
owe it, so fin42 wrote the opt-in `plan-open` and `empty-answer` scenarios; the report is in `PD-ORCH-015` and `PD-ORCH-009`.
*Built-app evidence added 2026-10-13 (fin42):* `pnpm part-h-proof`'s `plan-held` launch measures the held answer — the ignored
correction, the `system` row and the answer carried to iteration 2's root — and its `answerless` and `answer-when-asked` launches
the re-prompt; the live measure is the two scenarios' first run, the orchestrator's. No ruling under R-072 has said the scripted
evidence is enough, and none is asked: the scenarios exist to take the measure.
