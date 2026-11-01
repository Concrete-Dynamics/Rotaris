# Reconciliation log — what each change did to the views

The views themselves say what is true now. This file is the chain of *what changed when*, moved out of
`README.md` on 2026-09-16 so that consulting a view before a change costs a page rather than a chapter.

Nothing here is deleted: every entry is the one the change that made it wrote, in the order it was written,
newest first. `docs/architecture/first-executions.md` and `codebase.md` hold the same history from the build's
side; this one is the views' side of it.

The entries from 2026-09-16 (the navigation pass) to 2026-10-13 were written in `README.md` and moved here verbatim on
2026-10-13 (fin41), less the navigation pass's closing line ("Everything reconciled before this date is in
reconciliation-log.md"), which here would point at itself. Since then each change writes its entry at the top of this file and moves only the date in
`README.md` (its maintenance rule, item 2).

---

Last reconciled with the code: **2026-10-31**

**The run host answers `workspace.opened` before it warms the skill catalogue, off its loop (OQ-386 point 1, REQ-WORKSPACE-058; 2026-10-31, `../../defects/fixed/the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md`).** `06-sequences/01-1-launch-to-a-painted-main-window.md` §1 says the warm-up starts from a zero-delay timer on the run host's clock port, after the reply is posted, and reads the tree asynchronously, at most four reads in flight; `02-process-view.md`'s run-host row says the catalog is warmed so. It stores its catalogue only if no rescan or session creation cleared that root while it ran, and `skills.read`, `skills.forceLoad`, `skills.loadFile` and `skills.list` wait for it. Before, it said a microtask ran the walk ahead of the reply. `config` gains `discoverSkillsAsync` and its ports beside `discoverSkills`, with a `stopped` predicate that ends a superseded walk at its next read (`DiscoveryStopped`); `SkillHost` gains `warm` and `settled`, whose wait is bounded on the timer port (`WARM_UP_WAIT_BOUND`, ADR-0002 consequence 11) and which a `skills.*` request reaches only after OQ-279's refusal (`skillsAnswerSettled`); a wait that reaches the bound is refused with the new code `skills.discovering`, walks nothing on the loop, and leaves the warm-up running (§1 says so). A run started during the warm-up still walks synchronously beside it (the note). No package, edge, process, channel, request shape, command, notice or store column changed, and no fact changed owner (`05-state-ownership.md` unchanged). The re-discovery after a session creation or a rescan stays synchronous, as OQ-386 left it.

**`pnpm preflight` connects to a set Linux display (2026-10-31, `../../defects/fixed/pnpm-preflight-passes-the-display-check-for-a-display-no-client-can-reach.md`).** `01-component-view/03-where-the-responsibilities-sit.md`'s preflight paragraph says what the display check now asks and of which addresses. Repository tooling only; no package, edge, process or fact changed.

**The portable swap flushes what it renames (REQ-STARTUP-176, REQ-STARTUP-126; 2026-10-31, `../../defects/fixed/the-portable-swap-renames-a-copy-it-never-flushed-onto-the-artifact.md`).** `02-process-view.md`'s `.update`/`.old` row and `06-sequences.md` §1 name the flushes (`updater/flush.ts`); on Windows, the one portable host, the directory flushes and the put-back reach nothing. No other view changed.

**A download this build ends keeps the reason it ended (REQ-STARTUP-169, REQ-STARTUP-179; 2026-10-31).** `streamInChunks` carries its own outcome across the body's close: closing the iterator is how the size bound is enforced, and a cancelled web stream — what `updater/electron.ts` hands in — can reject as it closes, which previously turned REQ-STARTUP-169's refusal into a read failure (`install.ts` then showed "ended early" instead of the bound's sentence). `06-sequences.md` §1's download step is unchanged in its words (the bound and the refusal are still what it says); what changed is that the refusal is now reported as the refusal, which `06-sequences.md` already implies by naming REQ-STARTUP-169 at that step. No package, edge, process, channel, command, notice, store column or fact owner changed (`04-seams.md`, `05-state-ownership.md` unchanged).

**The portable's could-not-prepare notice (REQ-STARTUP-165 (c), REQ-STARTUP-150; 2026-10-31, `../../defects/fixed/a-portable-that-could-make-no-preparation-starts-without-the-notice-req-startup-165-c-requires.md`).** `04-seams.md` §6 gains the invariant for a notice about the launch itself: read before the window, raised by `report` from `postShowActivation`, every word in `main/preparation-notice.ts`. `02-process-view.md`'s portable paragraph says main now reads the stub's marker; `05-state-ownership.md` gains the marker's row (the stub writes it, main reads it once); `06-sequences.md` §1 gains the read after the claim and the raise after the show. No package, edge, process, message or channel changed.

**The build writes the requirement symbols when they are absent (ADR-0056; 2026-10-31, `../../defects/fixed/a-fresh-clone-cannot-build-until-pnpm-symbols-has-run.md`).** `01-component-view.md`'s responsibilities gain "The requirement symbols on the build path": the desktop build config reaches `tools/symbol-artifact/ensure.mjs`, and the preflight's line says the generator, not `pnpm symbols` alone, writes `generated/`. No package, edge, process, message, channel or ownership changed.

**A failed read of the record is no decline (ADR-0055 consequence 14, REQ-STARTUP-161/164; 2026-10-31, the PR's review).** `06-sequences.md` §1: the stand-down declines on a record gone, malformed or naming another claim, and any other failed read answers as the instance. OQ-460 and OQ-461 raise the two readings the entries below left unruled.

**A reclaim leaves only a record naming another live claim (ADR-0055, REQ-STARTUP-161/164; 2026-10-31, the review of the entry below).** The entry below says the reclaim "takes only the claim it failed to reach"; that predicate left a record naming a dead process too, and the launch ended `refused` with no window. `instance.ts`'s clause (3) now removes the record unless a fresh read finds another live claim. `06-sequences.md` §1's Phase 0 note and stand-down paragraph, `02-process-view.md`'s instance-claim row and `05-state-ownership.md`'s reclaim name the corrected predicate; §1 points at the open note on a launch whose two hand-overs go unanswered. Nothing else in the views changed.

**A process the instance record no longer names stands down, and a reclaim takes only the claim it failed to reach (ADR-0055 consequence 14, REQ-STARTUP-161/164; 2026-10-31, `../../defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md`).** `06-sequences.md` §1: Phase 0 names clauses (2)–(4), with (4)'s second hand-over, and gains the stand-down paragraph; the ordinary hand-over's `{"ok":true}` is now conditional on the record. `02-process-view.md`'s files on disk: the instance-claim row names the conditional removal and the acknowledgement rule. `05-state-ownership.md`: the instance record's writers name the reclaim and its holder's re-read. `ClaimDeps` gains `onHandOverDeclined`, which main logs. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**Open log and the third-party licence bundle are bounded at the opener (REQ-SESSION-191, REQ-SHELL-142, REQ-SHELL-040; 2026-10-31, `../../defects/fixed/open-log-waits-on-the-platform-opener-without-a-bound.md`).** `02-process-view.md`'s message families: `session.openLog` and `shell.openThirdPartyLicenses` name the 5 s bound (`openFile`, `main/open-folder.ts`) and the refusal an opener that never answers becomes. `workspace.openFolder` is unchanged. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**An unreadable identifier is held and raised (REQ-SESSION-197; 2026-10-31, `../../defects/fixed/an-unreadable-workspace-identifier-leaves-the-window-unopened-without-a-notice.md`).** `04-seams.md` §6 and `03-runtime-view.md` §7 name `WORKSPACE_REFUSALS` and `holdOpenRefusal`, and, since the review's rework, `workspace.not-a-folder` (`../../defects/fixed/a-workspace-path-that-is-not-a-directory-is-reported-as-an-unreadable-identifier.md`) and the withdrawal of a replaced hold's notice. No package, process, channel, command or store column changed.

**The portable swap never empties the artifact's path (REQ-STARTUP-176, REQ-STARTUP-125 under PD-STARTUP-008; 2026-10-31, `../../defects/fixed/the-portable-swap-leaves-the-artifact-path-empty-between-its-two-renames.md`).** `02-process-view.md`'s files on disk: the `.update`/`.old` row names the copy aside and the single rename onto the target, and what a failed final rename leaves; `06-sequences.md` §1's portable branch says the same. `StrategyFiles` gains `copyAside` (`updater/electron.ts`: an exclusive `copyFile`). No package, edge, process, channel, command, notice or store column changed, and no fact changed owner (`05-state-ownership.md` unchanged).

**The update download is bounded by the size the feed states (REQ-STARTUP-169/179; 2026-10-31, `../../defects/fixed/the-update-download-writes-whatever-length-the-server-sends.md`).** `02-process-view.md`'s files on disk: the staging row names the bound; `06-sequences.md` §1's asset fetch says the same. A longer transfer fails at the existing `download` stage with its own sentence. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner (`05-state-ownership.md` unchanged).

**The installer hand-off's staging directory is removed (REQ-STARTUP-178; 2026-10-30, `../../defects/fixed/the-installer-hand-offs-staging-directory-is-never-removed.md`).** `02-process-view.md`'s files on disk: the staging row says who removes it, and `<data>/updates/installer-handoff.json` gains a row; `05-state-ownership.md` gains the record's row; `dataLayout` gains `updates`. No package, edge, process, channel, command or store column changed.

**The clean-room process records removed (2026-10-26).** At the owner's request of 2026-10-26 five of `docs/clean-room/`'s
six files — `architecture-gate.md`, `provenance.md`, `reference-record.md`, `specification-gate.md`, `zone-policy.md` —
and the two root specification-review files are gone, kept in history and marked *(removed 2026-10-26)* where the live
record cites them. `agent-workflow.md` stays: it is the rule text `AGENTS.md` points the workflow and the handoff at.
No package, edge, process, message, channel or ownership changed.

**Dictation (OQ-455 to OQ-459, R-089; 2026-10-30).** `02-process-view.md`: the renderer → main list gains `dictation.transcribe`, and main spawns `whisper` for a press. `04-seams.md` §1 (the `dictation` facet) and §5 (a section no run reads). `docs/module-map.md`: main's row. No package, edge, channel or store change.

**The queue's rest and end repaired (REQ-CHAT-035/037/038/040, R-089; 2026-10-30).** `03-runtime-view.md` §5: a resting session's queued prompts stay editable (`editQueuedAtRest`), `createQueuedPrompt` is refused once the run stops stepping, and a completed task moves its prompt to COMPLETED.

Last reconciled with the code: **2026-10-29**

**The requirements adoption assistant (domain 22, PD-TRACE-001, R-088; 2026-10-29).** `01-component-view.md`'s
responsibilities table gains the assistant's row (`workspace/src/adoption/`, `engine/src/adoption/`,
`contracts/src/adoption.ts`; no new package, no new edge). `02-process-view.md`'s third message part gains the two
`requirements.*` members, the service's `adoption.interpret` ask, the run host's request of that name and its
`adoption.interpreted` reply. `05-state-ownership.md` gains the adoption record's row: a file in the workspace scope
directory the service alone writes, on the user's press; the layout file is written only by the user's choice and never
over an existing one. No channel or store table changed.

(Add the composer's microphone: dictation inserted as prompt text)

**The ancestor `CLAUDE.md` removed, and the eager-import crutch dropped (2026-10-27).** The entry below left a host-side
condition: a `CLAUDE.md` above the checkout (`/home/glados/CLAUDE.md`) shadowed `AGENTS.md` from Claude Code. That file
has been moved aside (`~/.CLAUDE.md.removed-20261027`), so no `CLAUDE.md` stands in or above a checkout and Claude Code's
own discovery reaches `AGENTS.md` again — measured in this branch's checkout, Claude Code 2.1.310, every tool disabled,
3 of 3 sessions holding the repository `AGENTS.md`. The `.claude/rules/repository-rules.md` eager import (`bd46f85a`)
that worked around the condition was dropped with it: a `paths:`-less rule file is a second, silent route to the rules,
and the branch carries one rules file alone. `tools/agent-config.test.ts` now fails any `.claude/rules/` file without
`paths:` frontmatter instead of pinning that import; `AGENTS.md` and
`docs/defects/claude-code-sessions-under-an-ancestor-claude-md-load-no-repository-rules.md` state the closure. No
package, edge, process, message, channel or ownership changed.

**The repository's `CLAUDE.md` deleted (the owner's option (a); 2026-10-27).** The import `@AGENTS.md` the entry below
left is gone and `AGENTS.md` is the rules alone; a Claude session under an ancestor `CLAUDE.md` loads none of them, an
accepted gap recorded in `docs/defects/claude-code-sessions-under-an-ancestor-claude-md-load-no-repository-rules.md`
and closed the same day by removing that ancestor file (the entry above).
No package, edge, process, message, channel or ownership changed.

**The agent configuration consolidated into `AGENTS.md` (2026-10-26).** `CLAUDE.md` is folded into `AGENTS.md` and
reduced to the import `@AGENTS.md`, so the maintenance rule this README cites is stated in `AGENTS.md`; the README's pointer moves with it. The
live run's manual moved from `AGENTS.md` to `docs/proofs/live-run.md`, and the proof-launch mechanics to the proof
registry's page. `tools/skill-routers.test.ts` became `tools/agent-config.test.ts`. No package, edge, process, message,
channel or ownership changed.

**Four views, and this log, split under the document budget (`docs/README.md`; 2026-10-26).** `01-component-view.md`,
`02-process-view.md`, `03-runtime-view.md`, `04-seams.md` and `06-sequences.md` each keep their path as an index and
hold their sections, verbatim and in order, in the folder of the same name; every link to a section names its part. The
entries before 2026-10-16 moved, verbatim, into the numbered parts this log indexes at its foot. No view's content
changed, so the date above stays: no package, edge, process, message, channel or ownership changed.
**The notices generator's reviewed exceptions resolved (O-3, O-11, OQ-74, OQ-75; 2026-10-23).** `01-component-view.md`'s
notices section names the table's identifier entries and its `licenseText` and `embedded` parts, and the licence texts
`tools/notices/licenses/` now holds for them. The tool reads one input more — the vendored licence file inside an installed
package an entry names — and still writes one file. No package, edge, process, message, channel or ownership changed.
**The compiled-in key set carries O-2's public half (R-082; first-release-plan.md §6.1; 2026-10-23).**
`05-state-ownership.md`'s key-set row reads "one key since 2026-10-23" where it read "empty until O-2". The fact's owner,
its writer and its reader are unchanged: the build alone writes it, main reads it at every install. No package, edge,
process, message, channel or ownership changed.
**The portable's launcher stub, the assisted installer and the icon (the 2026-10-23 packaging brief; ADR-0054 P4,
`first-release-plan.md` §4.5, §4.9).** `01-component-view.md` gains "The portable's launcher stub and its assembly":
`apps/desktop/launcher/` (Rust, no dependency), `scripts/lib/portable.mjs`, `scripts/lib/pe-icons.mjs`, and
`tools/release-pipeline/cli.mjs`'s import of the assembler. `02-process-view.md` gains the stub as the process before
main on the portable, the preparation root under the per-user data directory, and the run-scoped placement. The
installer's include (`apps/desktop/resources/installer.nsh`) writes `HKCU\Software\Rotaris\InstallDir`, the value
`classify.ts` already read; no product process, message, channel or ownership moved.


**Dependency patches for 47 Dependabot alerts (R-081; 2026-10-22).** `01-component-view.md`'s `mcp` section and its `ajv`
paragraph name `@modelcontextprotocol/client` 2.3.0, pinned in place of 2.0.0. The SDK's `http` and `sse` transports now refuse
a redirect to another origin (OQ-451). `undici` 7.29.1, `vite` 8.2.4 and the build-time copies moved inside their ranges. No package,
edge, process, message, channel or ownership changed.

**The Linux and macOS packaging configuration, prepared and not wired (R-080; ADR-0054; 2026-10-22).**
`apps/desktop/scripts/lib/platform-targets.mjs` holds the two configurations a macOS and a Linux host would merge over
`electron-builder.yml`; nothing that builds imports it and the hooks refuse both platforms (IC-3). It is a packaging
script, outside the boundary rule, so no view changed: no package, edge, process, message, channel or ownership moved.

**The release pipeline's stages after the build (R-080; first-release-plan.md §4.2, §4.7, §4.8; 2026-10-22).**
`01-component-view.md` gains "The release pipeline's stages after the build": `tools/release-pipeline/`, a build-time
tool outside the boundary rule, and its one reach into an application root, `apps/desktop/src/main/updater/keys.ts`,
so the pipeline verifies with the updater's own verifier and key set. `.github/workflows/release.yml` runs it; the
process view is unchanged, because nothing the product runs, sends or stores moved. No package, edge, process,
message, channel or ownership changed.

**The release feed names `Concrete-Dynamics/Rotaris` (O-5 re-ruled by R-078, REQ-STARTUP-105; 2026-10-21).**
`02-process-view.md`'s FEED node now reads `api.github.com/repos/Concrete-Dynamics/Rotaris/releases/latest`, the endpoint
`FEED_REPOSITORY` (`apps/desktop/src/main/updater/feed.ts`) names since this repository became the product's public home.
The request, its timeout, its header and who makes it are unchanged, so no package, edge, process, message, channel or
ownership changed. The README's date stays 2026-10-21.

**A reader of the saved configuration keeps its answer while every file it read is unchanged (REQ-SANDBOX-038/118;
2026-10-21).** `03-runtime-view.md`'s `fetch` paragraph, its "one per-call read" item and the requirements reader's sentence
now say that the egress reader and the queue's reader go through `readSavedConfiguration` (`packages/config/src/saved-read.ts`):
a full load when a file the last load opened or looked for has changed (modification time, size, file id) or the environment
has, otherwise that load's answer after one `stat` of each, so a saved edit still reaches the next read. The answer carries no
tool servers. `04-seams.md`'s tool-seam rule names the reader a per-call read goes through. The kept answer is each process's own memory, not a fact another process owns, so no ownership, package, edge,
process, message or channel changed. The README's date stays 2026-10-21.

**A PATH lookup lists each directory once and keeps the listing while the directory's time holds (REQ-MCP-037; 2026-10-20).**
`findExecutable` (`packages/platform/src/spawn.ts`) no longer `stat`s every PATH directory under every PATHEXT extension: it
reads each directory's names, keeps them in memory in whichever process asks while the directory's modification time is
unchanged, and `stat`s only a name the listing holds. The lookup's answer is unchanged, so no view states anything new: none
of them described the lookup's cost, and the cache is the calling process's own memory, not a fact another process owns.
No package, edge, process, message or channel changed. The README's date stays 2026-10-21.

**Guard (2) and gate (2) at the window's own project, and at the update's closes (OQ-361 ruled 2026-10-20, `PD-SHELL-009`
revision 3; REQ-SHELL-119, REQ-SHELL-021, REQ-STARTUP-053, REQ-WORKSPACE-012, REQ-NOTIFY-056, REQ-NOTIFY-057; loc1,
`loc1-guard-2`; 2026-10-21).** `02-process-view.md`'s close-guard paragraph now says guard (2) asks about the closing window's
own workspace while another main window stays (never refusing a window that holds none) and about the instance at the last
window, reads main's own record of an integration — never a binding's `merge_status` or REQ-GIT-128's lock — and allows with a
`warn` line when the record cannot be read; its `workspace.choose` paragraph says gate 2 is asked for the requesting window's
workspace, a window holding none passing; its `update.install` / `update.restart` paragraph adds guard (2) after the
unsaved-settings guard, at the click and at the hand-off. `06-sequences.md`'s update sequence draws `integrationAllows` between
the unsaved-settings guard and the run box at the click, before the successor's start and in `beforeApply`, with a paragraph
saying why. OQ-361 is named as ruled in both. Main still reads `noWorktreeIntegration`, so nothing a view draws refuses in this
build.

**The product's own project file for a rename no project file covers (PD-MCP-004 revision 2, OQ-362; loc1, `loc1-rename`).**
`03-runtime-view.md`'s PD-MCP-004 paragraph now states clause 5 as built: for a rename whose declaring file the runtime serves
with its TypeScript language and no `tsconfig.json` or `jsconfig.json` covers up to the executor's root, the MCP executor places a
`jsconfig.json` of the product's own at that root before the search and removes it in the call's `finally`, under a per-root count
on `McpHost`, with leftovers removed at each run start (`prepare`) or adopted by the next rename, and every placement and removal
noted in the write journal under a name no agent bears; the paragraph's "OQ-362, open" is replaced. `04-seams.md`'s bullet on
requests the run host makes on its own gains the file's path through the manifest's `projectFiles` (`projectFileRefusals`,
`codeIntelligenceProjectFile`). `02-process-view.md`'s files-on-disk table gains `<project root>/jsconfig.json`, written and removed
by the run host's MCP executor and read by the bundled runtime's TypeScript language server. `01-component-view.md`'s manifest
paragraph gains `projectFiles` and the bytes constant beside `warmUps`; no edge changed.

**The window's kill of a soft-paused command with a call waiting behind it (REQ-SHELL-092, OQ-164; 2026-10-21, loc1's review).** `02-process-view.md`'s live-terminal paragraph now states that a call waiting behind the killed soft-paused command reports the kill and reads as never having run, with no exit code. No package, edge, process, message or channel changed.

**The claim over a named pipe, pinned on Windows (2026-10-21; the Windows ARM64 session's C6).** `06-sequences.md`'s launch sequence names the Windows endpoint and the test that now pins its order there: `instance-order.test.ts` gained four `it.runIf(win32)` cases. No product code changed.

**Every route into a child's turn pinned past 100 model steps (PD-ORCH-017, REQ-ORCH-088, REQ-ORCH-112; loc1, `loc1-step-belt`; 2026-10-21).** `03-runtime-view.md` §3's step-belt clause now says where every child turn is built (`IterationChildren.execute`'s `turn` closure, `maxStepsPerTurn: null`), which routes reach it (REQ-ORCH-088's retry on the role's fallback among them, pinned in `ladder.test.ts`), and that only the root's turn takes `RunConfig.maxStepsPerTurn`. Tests and the record only: no code changed (`docs/defects/fixed/the-final-step-belt-ends-a-working-child-as-succeeded-with-no-final-response.md`). No package, edge or process changed.

**A Windows session's end, observed simulated (2026-10-21; the Windows ARM64 session's C5).** `02-process-view.md`'s "not yet observed on a Windows host" for `SessionEndShutdown` is kept, with the simulated logoff beside it: the two end-session messages sent to the application's own windows ran the orderly shutdown, exit 0 in 0.9–1.9 s, the store as PD-ORCH-005 clause 23 wants; a real logout is still unobserved, and Windows' allowance against the 30 s bounds is OQ-402. No code changed.

**A `workspace.opened` reply that never comes is handled, never an unhandled rejection in main (plan `loc1`,
`main-rejection`; W-18, ADR-0002 consequence 11, REQ-WORKSPACE-141; OQ-386).** `06-sequences.md` §1 draws the hand-off to
the run host as `handOffOpenedWorkspace`, bounded at 5 s. Its `alt` schedules the open's slot on `workspace.ack` alone. A reply
missed within the bound is one warning line, and the window keeps its workspace. A new paragraph says why: `main()` awaits the
launch, so a rejected open ended main's start-up. Any other rejection of the launch's open now leaves the window standing
with no workspace open. The paragraph also names the open note on the run host's skill discovery, which runs before the reply
is posted. No other view changed: no message kind, channel or owner moved.

## Older entries

Until 2026-10-26 every entry stood in this one file, 3,697 lines by then. The entries before 2026-10-16 were moved
verbatim, in their order, into the numbered parts below so that this log stays inside
[the document budget](../../README.md#the-document-budget): the newest entries here, the rest one hop away. A part is
numbered oldest first; when the entries above outgrow the budget, the oldest of them move, in order, into a new part
with the next number, and its row goes at the top of this table.

| Part | "Last reconciled" dates it carries | Its newest entry |
|---|---|---|
| [15](reconciliation-log/15.md) | — | A retrospective's refusals as built under PD-LIBRARY-002 revision 6 (OQ-363; 2026-10-20). |
| [14](reconciliation-log/14.md) | 2026-10-19, 2026-10-18 | The handoff — one closing shape (2026-10-19). |
| [13](reconciliation-log/13.md) | 2026-10-16 | Windows MCP shutdown preserves the runner until its server closes (R-074, REQ-MCP-066/067/113). |
| [12](reconciliation-log/12.md) | 2026-10-15, 2026-10-14 | A Windows ARM64 development tree's bundle is the win32-x64 one (the Windows ARM64 session; OQ-401, the … |
| [11](reconciliation-log/11.md) | 2026-10-13 | `focus-session` reaches the session where it lives (PD-SHELL-001 revision 3, OQ-292; fin44, … |
| [10](reconciliation-log/10.md) | — | An exact or replace-all edit keeps a CRLF file's line endings (PD-TOOLS-017, OQ-254; fin38). |
| [09](reconciliation-log/09.md) | — | A tool call's streamed arguments are model events (REQ-ORCH-089, REQ-ORCH-090, REQ-NOTIFY-112, … |
| [08](reconciliation-log/08.md) | — | The instruction files close before whatever the prompt carries next (REQ-WORKSPACE-043, REQ-WORKSPACE-047, … |
| [07](reconciliation-log/07.md) | — | The re-authentication prompt follows the focused session and covers no window control (REQ-NOTIFY-030, … |
| [06](reconciliation-log/06.md) | — | A todo edit at rest and the quit's terminal record hold the lock (ADR-0005, REQ-EVENTS-098, REQ-CHAT-090, … |
| [05](reconciliation-log/05.md) | — | A failing layout contract is filed under `CONTRACT` in the evidence pack (R-067). |
| [04](reconciliation-log/04.md) | — | The handoff's artifact is the root's own (`PD-ORCH-005` revision 4 clause 20, 2026-09-28, R-065). |
| [03](reconciliation-log/03.md) | — | REQ-CHAT-055's measurement round: the transcript projects once per change, not once per render … |
| [02](reconciliation-log/02.md) | — | One instruction-file set, two readers (defect round, 2026-09-22). |
| [01](reconciliation-log/01.md) | 2026-09-16 | A cost the provider reported (`PD-MONITOR-001`) |
