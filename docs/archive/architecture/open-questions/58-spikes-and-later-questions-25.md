# Archived open questions — Spikes, and the questions raised since (25 of 35)

The ruled, closed, resolved and withdrawn entries of [part 58](../../../architecture/open-questions/58-spikes-and-later-questions-25.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-280"></a>

**OQ-280 — Does match level 3 compare a line without its carriage return?** *(REQ-TOOLS-136, the four match levels — level 2
"each line equal once trailing whitespace is ignored", level 3 "each line equal once one uniform leading prefix is added or
removed"; REQ-TOOLS-189, `haet_edit`'s exact match; [`PD-TOOLS-014`](../../../product/directives/pd-tools-014.md#pd-tools-014)'s near miss at
levels 2 and 3, [`PD-TOOLS-015`](../../../product/directives/pd-tools-015.md#pd-tools-015)'s level-3 shift, and
[`PD-TOOLS-016`](../../../product/directives/pd-tools-016.md#pd-tools-016), each stating that REQ-TOOLS-136's levels are unchanged. Raised
2026-10-13 by fin42 (N52) from
[`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md`](../../../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md);
numbered from the top of the plan's range, OQ-271 to OQ-280, to keep clear of its sibling bundles. Ruled 2026-10-13 under
R-072, below.)*

On a CRLF file every line ends in `\r`, and an `old_string` a model writes as a JSON string almost never carries one. Level 2
strips trailing whitespace, the `\r` with it, so an LF `old_string` matches a CRLF file there (`PD-TOOLS-016` was ruled for
exactly that). Level 3 as built (`matchEdit`, `packages/agent-tools/src/tools/files.ts`) compares each window line with the
shifted `old_string` line exactly, so the `\r` keeps an LF `old_string` one indent off from level 3 on a CRLF file. Measured
in the built app (`pnpm edits-proof`, `shift-lf`) and with the tools directly, the same three-line block one tab shallow:
on an LF file, `write_file` applies at level 3 with `PD-TOOLS-015`'s shift and `haet_edit` gives `PD-TOOLS-014`'s near miss with
the quote; on a CRLF file, `write_file` applies at "Match level: 4 (similarity: 0.91). Verify the result." and writes the block
**one tab too shallow beside a success**, and `haet_edit` gives the plain "not found exactly" with no quote. A shorter window
scores under 0.85 and reads "not found at any of the four match levels". Windows is the only platform shipped
(`PD-STARTUP-001`), where CRLF files are ordinary; the guarantee `PD-TOOLS-015` was ruled for (OQ-233: a mis-indented block
never lands beside a success) holds there only for an `old_string` that carries the file's `\r`s.

**What the build proceeds under.** The letter of REQ-TOOLS-136 as built: level 3 compares lines exactly, `\r` included; on a
CRLF file an LF `old_string` one indent off reaches level 4 or no match. Nothing was changed; `edits-proof` records the reading
and asserts neither way.

**What a ruling decides.** Whether level 3's "each line equal" reads a line without its line ending (the `\r` of a CRLF line
being part of its ending, not its text) — so that an LF `old_string` one indent off matches a CRLF file at level 3 and
`PD-TOOLS-015` (shift, as given, or refusal) and `PD-TOOLS-014` (the near miss and quote) answer it, with `PD-TOOLS-016` clause 2
carrying the endings as it already does at level 3 — or whether the build's exact reading stands. **The costs either way:**
read without the `\r`, level 3 takes cases level 4 took, so an edit that applied at level 4 is shifted or refused instead, and
the near-miss quote of such a window carries `\r`s the caller must send back; kept exact, on Windows a model's commonest
mis-indented edit lands unshifted beside a success at level 4 — the case `PD-TOOLS-015` was ruled to prevent — and `haet_edit`
gives no near miss for it.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** REQ-TOOLS-136's level 3 compares
each line of the window and of `old_string` with one trailing `\r` set aside, and measures the leading prefix on those lines.
An LF `old_string` that is one uniform indent off on a CRLF file therefore matches at level 3, where `PD-TOOLS-015`,
`PD-TOOLS-014` (revision 3, which also names the line endings) and `PD-TOOLS-016` answer it. Recorded as
[`PD-TOOLS-019`](../../../product/directives/pd-tools-019.md#pd-tools-019), which narrows REQ-TOOLS-136 and states that levels 1, 2 and 4 and the
level order are unchanged, with [`PD-TOOLS-014`](../../../product/directives/pd-tools-014.md#pd-tools-014) revision 3 and in-place notes on
`PD-TOOLS-015` and `PD-TOOLS-016`. **Costs kept on record:** some level-4 applies become shifts or refusals at level 3, the
near-miss quote of such a window carries `\r`s, and the product departs from a specification-only build. *The build's reading
("What the build proceeds under", above: level 3 compares lines exactly, `\r` included) is kept as the falsified reading.* A
neighbouring gap the ruling does not decide — a block holding a blank line never matches at level 3, on LF and CRLF alike — is
recorded separately.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "one trailing `\r` is dropped from each window line and each `old_string` line before the indentation is
measured and the lines are compared … Record this as directive PD-TOOLS-019, which narrows REQ-TOOLS-136 level 3." **Advocate B**
(the system's lens, change-behaviour): "Match level 3 compares each line without its line ending … Record it as a new directive,
PD-TOOLS-019, which extends REQ-TOOLS-136 … Add a revision 3 to PD-TOOLS-014." Both followed: A's disposition, Narrows; B's
`PD-TOOLS-014` revision 3, the `\r` alone set aside, and a separate note for blank interior lines.

<a id="oq-273"></a>

**OQ-273 — When the pinned runtime's symbol rename answers before its language server has loaded the project, does the product
warm it, change the runtime, or tell the model?** *(REQ-MCP-015, the EDIT tier's symbol rename; REQ-MCP-011 and ADR-0035, the
pinned runtime the product bundles and drives as it is; REQ-MCP-116, the binding manifest, the one place the runtime's
identifiers are written; [OQ-245](52-spikes-and-later-questions-19.md#oq-245), the reach observation that records what the call changed. Raised 2026-10-13 by
fin42 (N59) from
[`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
fin42 held OQ-271 to OQ-280; raised as OQ-272 (OQ-271 was taken on main by another of the plan's bundles), renumbered
OQ-273 at its landing, `origin/main` having taken OQ-272 meanwhile. Ruled 2026-10-13 under R-072, below; it read "Open." until then.)*

The first rename of a server session that needs the language server's cross-file view renames the declaring file alone and says
it succeeded: `code-intel-proof`'s eleventh launch (`child-rename-cold`) and four arrangements over the runtime's stdio branch,
a copy of the live run's `todo-app` fixture among them, all changed one file. The same rename after one referencing-symbol search
of the symbol reaches every file (launch 10, `child-rename`). The pinned runtime (`serena-agent` 1.7.0) waits for the TypeScript
server's project loading before a references request and not before a rename, so the server answers the rename before it has
loaded the other files. The run host's record of the call is true; the tool's success is not, and the model is not told.

**What the build proceeds under.** As built: the call is forwarded as the model made it, the result is the runtime's, and the
reach observation lists the one file it changed. A model that searched for references first, as many do, renames correctly.

**What a ruling decides.** Which of these, or none:

- **(a) A product-side warm-up.** The MCP executor (`apps/desktop/src/run-host/mcp.ts`) sends the runtime's referencing-symbol
  search for the same `name_path` and `relative_path` before the first rename of each server session, discards its answer and
  then forwards the rename. Costs: one extra server request the model did not make, the search's name written into the manifest
  as a new capability of the binding (REQ-MCP-116), and a dependency on the runtime's internals that a later pin may change.
- **(b) A runtime-side repair.** The bundle recipe patches the pinned distribution's rename to take the references path's wait,
  or the pin moves to a version that does. Costs: a patched third-party tree the recipe must carry and the drift check must know
  of (ADR-0035, ADR-0054), or an upgrade measured like any pin change.
- **(c) Tell the model.** The rename's description in the manifest (as `PD-MCP-001` describes the usage-instruction tool) says to
  search for references first, or the run host appends to a rename result whose reach observation lists one file that the files
  referencing the symbol may not have been renamed. Costs: advice a model may ignore; the second needs a reading of "one file"
  that a single-file symbol would trip.
- **(d) Nothing.** A rename made first in a session is the runtime's behaviour, and the record already lists what changed.

**What a live run then shows.** The opt-in `rename` scenario (`live-run.mjs --only=rename`) delegates a coding-agent to rename
`remaining` to `countRemaining` with `rename_symbol` and reads whether the agent searched for references before its first rename,
which of the three files still name `remaining` and which were written by another tool after the rename, and whether
`node --test` passes; a cold rename whose importing files were left behind, or were mended by hand afterwards, is a NOTE naming
this question.

**Live run, 2026-10-20** (the Windows ARM64 session; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; `crlf` pack `2026-10-20T08-14-16-333Z`, [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)): not shown: the window edit landed at match level 2 and no level-3 miss was made, so level 3 was not reached live.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), option (a):** before the run host
forwards any symbol rename to the bundled code-intelligence server, it sends that server's referencing-symbol search for the same
`name_path` and `relative_path`, discards the answer, and then forwards the rename. Both requests are held within the rename's one
REQ-MCP-003 allowance, and the search never reaches the model or the session's tool-call record. Minted as
[`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004), which extends REQ-MCP-116 (the manifest records the pairing and the argument
names) and governs what REQ-MCP-015's rename must reach; `code-intel-proof`'s launch 11 (`child-rename-cold`) is its acceptance
gate and is re-run on every pin change. **The two recommendations weighed:** both advocates recommended (a), the product-side
warm-up, and the ruling followed both. It sits in the one executor every code-intelligence call already goes through, and it is
measured to work (launch 10, and the fifth arrangement of the defect note). Where (a) above read "before the first rename of each
server session", the ruling says before **every** rename. **Rejected:** (b), a patched distribution the recipe and the drift check must carry, or an upgrade not
yet measured; (c), advice that leaves a broken project whenever it is ignored; (d), a success reported for a rename that left the
project unbuildable. **Costs kept on record:** one server request per rename that the model did not make, part of the rename's
allowance spent on it, and a binding resting on the runtime's internals. *The reading the build proceeded under until the ruling
("As built: the call is forwarded as the model made it …", above) is kept as the falsified reading.*

*Corrected 2026-10-15 (fin47, `fin47-rename-and-optionals`), the old reading kept:* ~~"four arrangements over the runtime's stdio
branch, a copy of the live run's `todo-app` fixture among them, all changed one file. The same rename after one referencing-symbol
search of the symbol reaches every file"~~ — *the search was measured only in the arrangement with a `tsconfig.json`. With no
project file (the `todo-app` copy among them) the search answers `{}` and the rename still changes the declaring file alone: the
live `rename` scenario at `3c03287` failed on it. Raised as [OQ-362](65-spikes-and-later-questions-32.md#oq-362).*

<a id="oq-279"></a>

**OQ-279 — When the global configuration cannot be loaded, does a workspace open?** *(REQ-CONFIG-478, "Where the rejected key
or value sits in the **global** scope, no workspace opens until it is corrected", and its "Opening a workspace is a workflow a
user starts, so this failure MUST present as REQ-NOTIFY-001's *failed with one concrete next step named*"; REQ-CONFIG-233;
REQ-HOOKS-012. Raised 2026-10-13 by fin42 (`fin42-coverage-and-react`, whats-next item N61), found by building `notice-proof`'s
section 1b; numbered from the top of the plan's range, OQ-271 to OQ-280, below OQ-280, to keep clear of its sibling bundles.
Ruled 2026-10-13 under R-072, below.)*

Driven on the built app: a global `agents.yaml` whose one hook entry has `timeout_seconds: 0` (an invalid entry,
REQ-HOOKS-012). The window opened the workspace as usual — main window loaded, the store opened, the Git and prompt reads ran —
with the configuration unloaded, and the first warning or error notice main logged was raised when a prompt was submitted: "The
run was refused before it started", whose detail is REQ-CONFIG-478's report (file, global scope,
`hooks.entries.0.timeout_seconds`, the remedy). Before it the log holds `warning` lines and one earlier notice of a lower
severity, which the log does not name (`notices.ts` logs only warnings and errors), so what the window showed at the open was
not read. REQ-CONFIG-478 says no workspace opens, and that the failure presents as the opening workflow's failure.

**What the build proceeds under.** As built: the workspace opens with its configuration unloaded, every run is refused with
the report, and the notice is raised at the refused run. Nothing was changed; `notice-proof` section 1b asserts the refusal and
its report and asserts nothing about when the notice first shows.

**What a ruling decides.** Whether "no workspace opens" means the window refuses to open any workspace while the global file
is invalid (a blocking failure screen naming the file and the step), or that every workspace opens unconfigured — and, either
way, whether REQ-CONFIG-478's notice must be raised when the workspace is opened rather than at the first refused run.

**Ruled 2026-10-13 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** in REQ-CONFIG-478,
as in REQ-CONFIG-233, -239 and -245 and REQ-GIT-071, "a workspace opens" means its **configuration loads**. Under a fatal load
failure in either scope the window, the session history, the repository view and Settings stay available, and every run and
isolated start is refused with the report, as built. The report is raised as a persistent error notice **when the workspace
opens**, naming the file, its scope and the rejected key, with the step "correct it in the named file, then open the
workspace again or start a run", and it is cleared once a later load of that workspace succeeds. Classified **covered**
(REQ-CONFIG-478, REQ-NOTIFY-001, REQ-GIT-071); no directive is minted. **Built 2026-10-14 (fin43, `fin43-notices-and-config`):**
`ConfigFatalNotices` (`apps/desktop/src/main/config-fatal-notice.ts`) is fed the open's `config.read` in the post-ack slot of
`openWorkspaceInner`, after that slot's other notices so it is the one standing, every snapshot `configAnnouncer` carries, and
each run start (`session.start`); it raises "The workspace configuration did not load" (`error`, persistent, detail the
snapshot's `fatal`, action "Open Models settings" through `recoveryFor('config.fatal')`) under a key carrying the workspace's
load generation, and clears it compare-and-clear on a clean load, so a fault that recurs after one is raised again.
`notice-proof` section 1b reads it on screen before the prompt (global scope) and section 1c (workspace scope) corrects the
file within the launch and starts a run with no relaunch. The run refusal, the isolated-start refusal and the per-run reload
are unchanged. **Noticed, not decided:** the skills, instructions and queue readers fall back to defaults on a fatal load —
[`the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md`](../../../defects/fixed/the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md).
**Repaired 2026-10-14 under this ruling (fin44, `fin44-hooks-and-config`):** read with REQ-CONFIG-478's "the load fails as a
whole rather than falling back to a default", no reader answers an unloaded configuration with defaults. The run host's skills
and instruction readers answer the report and its five `skills.*` requests refuse with it (Settings › Skills draws the report
as Models does); an agent built meanwhile gets its run's own configured sections, or none; the requirements queue starts
nothing until the file loads again, re-reading it at each claim, preview and run-starting action. Noticed beside it, not
repaired: a merged-document fault in the global file is reported in the workspace file
([`a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`](../../../defects/fixed/a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md);
repaired 2026-10-14 by fin45, `fin45-config-and-terminal`: the report names the file and scope that stated the key).

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "Keep the workspace opening while the global configuration is unloaded … raise REQ-CONFIG-478's
actionable failure as a persistent error notice at the moment the workspace opens … Mint PD-CONFIG-004 to govern REQ-CONFIG-478's
sentence 'no workspace opens until it is corrected'." **Advocate B** (the system's lens, change-behaviour): "'no workspace opens'
means no workspace's configuration loads … That half stays as built. The timing half is a build defect against a faithful
requirement." Both followed on the behaviour; B's on the classification (no directive), A's on the notice's placement beside the
hook-review and no-provider notices.

<a id="oq-278"></a>

**OQ-278 — May a defect note that cannot be reproduced be closed, with a standing monitor in place of a repair?**
*([`the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`](../../../defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md),
live-run finding D8; `CLAUDE.md`, "Defects noticed along the way" — "When a noted defect is repaired, move its note to
`docs/defects/fixed/`"; `docs/defects/README.md`. Raised 2026-10-13 by fin42 (`fin42-coverage-and-react`, whats-next item
N49); numbered from the top of the plan's range, OQ-271 to OQ-280, to keep clear of its sibling bundles.)*

The note is the only open one at the top of `docs/defects/`. *(Corrected 2026-10-14: it was not — 14 notes were open at the top
of `docs/defects/` at `ce5f952`, this one among them.)* The `a68f121` duress run's renderer threw React error 185 seven
times in 46 s while two children streamed. Every attempt since has come up empty:
- fin32 drove the built app with a `pendingLanes` trap;
- fin35 read every effect against React 19.2.8;
- fin38 re-read the code;
- the `552d346` default and duress packs had 0 such lines over 525 s of concurrent streaming, and the `0bc3eee` default pack
  had 0 in all 12 launches;
- fin42 kept the trap, ran it in `pnpm update-depth-proof` (1,904 commits, the simulated nested-update run's high 2 against
  React's 50, 0 errors), and installed it on the duress launch.

The cause is unidentified, so no repair exists. The record moves a note to `fixed/` only once it is repaired, and has no
other way to close one. Two routes remain. The first is a reproduction on a development build, which is open-ended and may
never come. The second is to keep the note open indefinitely, which leaves the one open note standing against "no open
defects". Meanwhile, every live launch counts the error (`reactUpdateDepthErrors`, a NOTE when not 0), and the duress launch
carries the trap.

**What the build proceeds under.** The note stays open in `docs/defects/`, and the monitors stay as they are: the per-launch
count, and the trap on the duress launch, each a NOTE rather than a failure.

**What a ruling decides.** One of the following:
- a note may be closed unreproduced. It would move to a place other than `fixed/` (or to `fixed/` with an outcome that says
  "not reproduced; monitored"), after a stated number of clean duress packs, with the monitors kept. A recurrence would then
  reopen it as a new note;
- the note stays open until it is reproduced and repaired;
- the monitor is promoted. A launch with an update-depth error becomes a live-run FAILURE rather than a NOTE, so a recurrence
  cannot pass unread, and the note closes on that guard.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)): the monitor is promoted, and a note
may close unreproduced under a guard.** From now on a relayed React update-depth error (React error 185) in any live launch is a
live-run FAILURE, and so is a duress launch whose `pendingLanes` trap does not install or whose install line does not reach
`duress/app.log` through the console relay. `docs/defects/README.md` gains a rule for closing a note that was never
reproduced: it moves to `docs/defects/fixed/` under the outcome "not reproduced, not repaired; closed under a guard", and only
after its guard has run once in the live run and been seen working. The D8 note closes on that rule after the first live run
whose duress launch shows the trap installed and relayed, with `reactUpdateDepthErrors` 0 on every launch. A recurrence opens a
new note that cites the closed one. No directive: nothing the product does changes; the ruling governs the harness and the
record.

**The two recommendations weighed.** *Advocate A (the user's lens)*: promote the monitor — a user who meets a frozen renderer
cares that a recurrence cannot pass a release run unread, not whether the note's folder says "open"; an error that fails the
run is the strongest statement the record can make about a cause it cannot name. *Advocate B (the system's lens)*: let a note
close unreproduced only under stated conditions — its investigations recorded, a guard that fails on recurrence, that guard
seen working once, a distinct outcome heading in `fixed/`, and a new note on recurrence — so the record keeps "repaired" and
"closed unreproduced" apart and no future note closes on silence. **The ruling combines both**: A's promotion is the guard,
B's conditions are the rule it closes under, and the instrument check (the trap installed and relayed) is added so a guard
that did not run cannot close anything.

**As built (fin43, `fin43-record-and-guards`, 2026-10-14).** `apps/desktop/scripts/live-run.mjs` checks every launch with
`updateDepthVerdict` (`lib/renderer-console.mjs`) and the duress launch with `lanesTrapGuard` (`lib/lanes-trap.mjs`), whose
trap now writes one `rotaris-lanes-trap: installed` line that `lanesTrapReading` reads as `relayed`; `pnpm update-depth-proof`
asserts that line was relayed. The rule is in `docs/defects/README.md`. The D8 note stays open until the orchestrator's first
guarded duress pack, which reports the guard's first execution into the note and `first-executions.md`.

**First execution, 2026-10-14 (both packs at `a3be56c`; recorded by fin45, `fin45-seams-ui-and-live`): the guard held, and the D8
note closed under it.** The guarded duress pack `2026-10-14T05-15-42-589Z` PASSED "the long run's pendingLanes trap installed and
its install line reached duress/app.log through the console relay (D8 guard, OQ-278)" (`installed: true, relayed: true`, the
install line at line 28 of `duress/app.log`), and its NOTE read 78,343 commits, the nested-update run's high 11 of React's 50 and
0 update-depth errors; the per-launch check PASSED on both of its launches and on all 24 of the default pack
`2026-10-14T04-30-51-088Z`, `reactUpdateDepthErrors` 0 on every one. The note moved to
[`../../../defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`](../../../defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md)
under "Outcome: not reproduced, not repaired; closed under a guard (OQ-278)"; the cause stays unidentified. Nothing the ruling
assumed was falsified: the instrument installed, relayed and counted in a real-model run as it had in `update-depth-proof`.
