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

Last reconciled with the code: **2026-11-03**

**The packaged executable's fuses (R-091 bundle A2; Electron security checklist 19; ADR-0054, ADR-0056 rule 4; 2026-11-03).** `02-process-view/01-what-each-process-owns.md` gains a paragraph after the children's environment: a packaged `Rotaris.exe` is fused by electron-builder.yml's `electronFuses` (RunAsNode, `NODE_OPTIONS`, the inspector switches off; cookie encryption, embedded asar integrity, `onlyLoadAppFromAsar` on; the file protocol's privileges left on, OQ-466), and no process changes for it. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

Last reconciled with the code: **2026-11-02**

**One set of web preferences for every window, and the device and display-media handlers (R-091 bundle A2; Electron security checklist 3 to 6, 8 to 10; OQ-459, OQ-466; 2026-11-02).** `02-process-view/01-what-each-process-owns.md`'s main row: the session permission handlers now read `isApplicationPage` and add a device handler refusing every HID, serial and USB device and a display-media handler answering no stream, on every session; and main gains `secure-web-preferences.ts`, the one set every window spreads (`rotaris/browser-window-uses-secure-prefs` in `pnpm lint`), read back from the built app by the driver's new `webPreferences` op. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**The release's SBOM, `SECURITY.md` and `CODEOWNERS` (R-091; 2026-11-02, `hardening.md` §3.5 row 10, bundle G2).** `tools/sbom/` and the root script `pnpm sbom:write` are new, run by `release.yml`'s `build` job; `SECURITY.md` and `.github/CODEOWNERS` are repository files. Consulted `01-component-view.md`: `tools/sbom` imports nothing of a package, so no edge moves, and no package, process, channel, command or store column changed; no view describes the workflows, so no view's content changed. `docs/module-map.md` and `codebase.md`'s tools table name the new directory.

**The configuration line names the entry model's sign-in legibly under the redaction pass (REQ-TOOLS-171; 2026-11-02, hardening D1).** `02-process-view/05-message-families-4.md`'s application-log paragraph adds that the run host's `configuration: loaded …` line writes the entry model's `auth_provider` as `sign-in=<id>`: written `auth_provider=<id>`, the pass masked the id on every launch. The stall line's `token for` is left as it is and recorded (`../../defects/the-application-log-masks-the-word-after-token-in-the-products-own-stall-line.md`).

**The store's write-ahead log checkpoints named as such (hardening C1, REQ-SESSION-034; 2026-11-02, at the bundle's review).** `packages/store/src/checkpoint.ts` became `wal-checkpoint.ts`, and its names carry `Wal` (`walCheckpoint`, `walCheckpointBeforeClose`, `IdleWalCheckpoint`, `IDLE_WAL_CHECKPOINT_MS`), because the glossary's checkpoint is a session's (REQ-GIT-016) and the workspace service imports both. `03-runtime-view/13-7-the-store-the-run-writes.md` names the module; the entry below is repointed. No package, edge, process, message, channel or ownership changed.

**`pnpm verify:plan` names the requirements a diff cites (R-092, hardening H2; 2026-11-02).** `01-component-view/03-where-the-responsibilities-sit.md`, the requirement coverage report: `tools/verify-plan/plan.mjs` imports its `branchReport` and `readDrift`, a tool-to-tool edge outside the boundary rule. No package, edge, process, message or seam changed.

**The uncited only shrink: `pnpm req-coverage --check` in `pnpm lint` (R-092, hardening H2; 2026-11-02).** `01-component-view/03-where-the-responsibilities-sit.md`, the requirement coverage report: no longer in no gate; `--check` reads `baseline.json` beside it and `--write-baseline` writes it. No package, edge, process, message or seam changed.

Last reconciled with the code: **2026-11-01**

**Main's application log runs through the redaction pass (REQ-TOOLS-171, PD-MONITOR-002; 2026-11-01, hardening D1, `../../archive/defects/mains-application-log-lines-bypass-the-redaction-pass.md`).** `02-process-view/05-message-families-4.md`'s application-log paragraph says so and names the credential lines' new prefixes. No package, edge, process or message changed.

**Every field a renderer command carries is bounded (OQ-467, PD-CHAT-011; 2026-11-01, hardening D1).** `04-seams/01-1-a-renderer-command.md` §1 gains stop 1a, `packages/contracts/src/limits.ts`, and the malformed headline names the field and the bound. No package, edge, process, message or channel changed.

**The import graph is linted beside the matrix (R-091, hardening.md §3.5 rows 2 and 3; 2026-11-01).** `01-component-view/02-the-allowed-edge-matrix-the-lint-rule-verbatim.md` names `eslint-plugin-import-x` beside the boundaries plugin: no cycle, and no undeclared dependency, so `engine` now declares the `config` edge the matrix already allowed. No edge was added or removed. Four cycles broken by moving a shared piece into its own module (`workspace/src/git/invoke.ts` holds the git deny-lists, `engine/src/run/prompt-layers.ts`, `ui/src/agent-tree-rows.ts`, `ui/src/settings/Confirm.tsx`); `docs/archive/defects/the-product-code-holds-four-import-cycles.md`.

**Lint is type-aware (R-091, hardening.md §3.5 row 1; 2026-11-01).** `01-component-view/01-the-packages.md`: the kernel node names `textOf`, the one rendering of a value of unknown shape as text that the type-aware `no-base-to-string` rule sent forty-four `String()` calls to (an object or an array as its JSON, every primitive as `String()` writes it). No edge, process, message or owned fact moved: the rest of the change is `eslint.config.js` and the findings it fixed in place (`codebase/02-the-disciplines-mechanised.md` lists the rules).

**The store's pragmas named and its checkpoints made explicit (hardening C1, REQ-SESSION-034, REQ-SESSION-067; 2026-11-01, `../hardening.md` §3.3 row 2).** `03-runtime-view/13-7-the-store-the-run-writes.md`'s store-open paragraph now names every writable open's pragmas (`journal_mode`, `wal_autocheckpoint = 1000` read back, `foreign_keys`, `synchronous = NORMAL`, `busy_timeout`) and `durableTransaction`'s FULL, and the workspace service's idle PASSIVE and closing TRUNCATE checkpoints (`packages/store/src/wal-checkpoint.ts`). No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**The workspace service's open checks the store before migrating it, and refuses a damaged one (hardening C1, REQ-SESSION-089; 2026-11-01, `../hardening.md` §3.3 row 1).** `03-runtime-view/13-7-the-store-the-run-writes.md`'s store-open paragraph gains the check (`checkIntegrity`, `quick_check(5)` after the journal mode is read back), the `workspace.store-corrupt` refusal, the close that leaves the write-ahead log as found, and `foreign_key_check` after a migrating open. `02-process-view/05-message-families-4.md` and `04-seams/06-6-a-notice-or-an-acknowledgement.md` name the new refusal beside `store-missing` and `store-displaced`, held by main and raised with no action (OQ-477). `05-state-ownership.md`'s W-02 rule says the service is the one that checks and refuses, and `06-sequences/01-1-launch-to-a-painted-main-window.md`'s open step reads "open, check and migrate the store" (added 2026-11-02, when the bundle's plan named the view). No package, edge, process, channel, command or store column changed, and no fact changed owner.

**`pnpm test:coverage` measures coverage against a floor that only rises (R-091, hardening F1; 2026-11-01).**
`01-component-view/03-where-the-responsibilities-sit.md`'s development-time paragraph names the new script among those
that record themselves (`other:test-coverage`). No package, edge, process, channel or seam changed: the script is a
test-runner flag (`vitest.config.ts`'s `coverage`), outside `pnpm check`.

**A dispatcher that catches and checks its sender (R-091 bundle A1; ADR-0019, ADR-0044, REQ-SHELL-020; Electron security checklist 17; 2026-11-01, `../../archive/defects/the-command-dispatcher-catches-nothing-so-a-handler-that-throws-rejects-the-renderers-invoke.md`).** `02-process-view/01-what-each-process-owns.md`'s main row: the window rule now answers a dialog for the window it was raised over (`MainWindows.standingBehind`, walking `parent`), the active window only for the seams and the driver; the channel's sender check (`main/command-sender.ts`) and `runCommand`'s catch (`main/command-dispatch.ts`) are named. (At review the row's clause on the window rule's 2026-10-03 change, which the insertion had left after the catch, was put back beside the rule it dates.) `04-seams/01-1-a-renderer-command.md`'s invariants gain the sender check and `command.failed`; `06-sequences/02-2-a-permission-approval-end-to-end.md` says the dialog's commands cross the check and are answered for its parent. `.claude/rules/contracts-and-ipc.md` gains the sender-origin sentence. No package, edge, process, channel or store column changed; two outcome codes, `command.failed` and `command.untrustedSender`, are values of the free `code` string; no fact changed owner.

**The web-contents guard and the sandbox switch (R-091 bundle A1; Electron security checklist 4, 12 to 14; OQ-466; 2026-11-01).** `02-process-view/01-what-each-process-owns.md`'s main row gains the guard beside the session permission handlers: `main/web-contents-guard.ts` on `app.on('web-contents-created')` before `app.whenReady()` refuses `will-navigate` and `will-redirect` away from the application's own page, denies every `window.open` and refuses every webview, one `warning` line each naming the origin alone; and `app.enableSandbox()` before ready. OQ-466's predicate is `isApplicationPage` in `main/permissions.ts`. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**`pnpm req-coverage --since` and `--drift` (R-092, hardening H1; 2026-11-01).** `01-component-view/03-where-the-responsibilities-sit.md`, the requirement coverage report: the two reports run git read-only (`merge-base`, `diff`, `show`, `log`, `blame`) and the tool imports `REDIRECTING` from `tools/build-id/`. No package, edge, process, message or seam changed.

**A cited requirement or directive identifier resolves, or `pnpm lint` fails (R-092, hardening H1; 2026-11-01).** `01-component-view/03-where-the-responsibilities-sit.md`, the requirement coverage report: `tools/eslint-rules/index.js` now imports its `citationsIn` for `rotaris/requirement-citations-resolve`. No package, edge, process, message or seam changed; `tools/**` stays outside the boundary rule.

**The production dependencies moved past CI's new audit (R-091; 2026-11-01, `hardening.md` §3.5 row 10, bundle G2).** `zod` 4.5.4 → 4.6.7 (the catalog's `^4.6.6`), `undici` 7.29.1 → 7.30.1 (`agent-tools`' exact pin) and `fast-uri` 3.1.8 → 3.1.9, each past a high or moderate advisory `pnpm audit --prod` named ([`../dependency-alerts/2026-11-01-audit-gate.md`](../dependency-alerts/2026-11-01-audit-gate.md)). `01-component-view/04-the-worktree-wrappers-behind-pnpm-worktreenew.md`'s `agent-tools` paragraph names the new `zod` specifier. No package, edge, process, channel, command or store column changed; CI's new audit step and `codeql.yml` are repository workflows no view describes.

**The pnpm supply-chain settings written out (R-091; 2026-11-01, `hardening.md` §3.5 row 8).** `pnpm-workspace.yaml` states `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`, `engineStrict` and a `catalog:` that eleven manifests now take their shared specifiers from; `.node-version` pins CI's Node. Consulted `01-component-view.md`: no package, edge, process, channel, command or store column changed, no resolved version moved (`pnpm-lock.yaml` gains only its `catalogs` block and `catalog:` specifiers), so no view's content changed.

**A holder that is live and never answers is reclaimed after the second unanswered hand-over (PD-STARTUP-009, REQ-STARTUP-164; 2026-11-01, `../../archive/defects/a-launch-whose-two-hand-overs-go-unanswered-ends-with-no-window.md`).** `06-sequences/01-1-launch-to-a-painted-main-window.md` §1: Phase 0 gains the final reclaim-and-claim after clause (4)'s hand-over, its own interval, and the `refused` branch now reads three claims lost; the stand-down paragraph says what the final reclaim takes and what main logs (`instance claimed after the final reclaim …`, at `warn`). `02-process-view/08-files-and-directories-on-disk.md`'s instance-claim row and `05-state-ownership.md`'s instance-record row name the final reclaim as a writer. `ClaimOutcome`'s `instance` variant gains `reclaimedFrom` (`ReclaimedFrom`: the record as clause (4) read it, whether it was live, the attempt that won), which main reads for its log line. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**A refused read of the skill catalogue is no longer an empty catalogue (OQ-386 point 1, REQ-WORKSPACE-058, REQ-CHAT-034; 2026-11-01, `../../archive/defects/the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md`).** `06-sequences/01-1-launch-to-a-painted-main-window.md` §1 states the per-request wait (`warmUpWaitBound`, main's bound less 3 s), the stall bound and its refusal `skills.discovery-stalled`, and the renderer's re-asking (`askUntilDiscovered`, Settings' `listNote`). No channel, table or package edge was added: the re-read goes over the existing `skills.read`, and main's two bounds moved into `contracts/skills.ts` so the run host's waits are derived from them. Settings' reader ends when Settings unmounts (`readWhileMounted`); the composer's stays one single-flighted read for the window.

Last reconciled with the code: **2026-10-31**

**The run host answers `workspace.opened` before it warms the skill catalogue, off its loop (OQ-386 point 1, REQ-WORKSPACE-058; 2026-10-31, `../../archive/defects/the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md`).** `06-sequences/01-1-launch-to-a-painted-main-window.md` §1 says the warm-up starts from a zero-delay timer on the run host's clock port, after the reply is posted, and reads the tree asynchronously, at most four reads in flight; `02-process-view.md`'s run-host row says the catalog is warmed so. It stores its catalogue only if no rescan or session creation cleared that root while it ran, and `skills.read`, `skills.forceLoad`, `skills.loadFile` and `skills.list` wait for it. Before, it said a microtask ran the walk ahead of the reply. `config` gains `discoverSkillsAsync` and its ports beside `discoverSkills`, with a `stopped` predicate that ends a superseded walk at its next read (`DiscoveryStopped`); `SkillHost` gains `warm` and `settled`, whose wait is bounded on the timer port (`WARM_UP_WAIT_BOUND`, ADR-0002 consequence 11) and which a `skills.*` request reaches only after OQ-279's refusal (`skillsAnswerSettled`); a wait that reaches the bound is refused with the new code `skills.discovering`, walks nothing on the loop, and leaves the warm-up running (§1 says so). A run started during the warm-up still walks synchronously beside it (the note). No package, edge, process, channel, request shape, command, notice or store column changed, and no fact changed owner (`05-state-ownership.md` unchanged). The re-discovery after a session creation or a rescan stays synchronous, as OQ-386 left it.

**`pnpm preflight` connects to a set Linux display (2026-10-31, `../../archive/defects/pnpm-preflight-passes-the-display-check-for-a-display-no-client-can-reach.md`).** `01-component-view/03-where-the-responsibilities-sit.md`'s preflight paragraph says what the display check now asks and of which addresses. Repository tooling only; no package, edge, process or fact changed.

**The portable swap flushes what it renames (REQ-STARTUP-176, REQ-STARTUP-126; 2026-10-31, `../../archive/defects/the-portable-swap-renames-a-copy-it-never-flushed-onto-the-artifact.md`).** `02-process-view.md`'s `.update`/`.old` row and `06-sequences.md` §1 name the flushes (`updater/flush.ts`); on Windows, the one portable host, the directory flushes and the put-back reach nothing. No other view changed.

**A download this build ends keeps the reason it ended (REQ-STARTUP-169, REQ-STARTUP-179; 2026-10-31).** `streamInChunks` carries its own outcome across the body's close: closing the iterator is how the size bound is enforced, and a cancelled web stream — what `updater/electron.ts` hands in — can reject as it closes, which previously turned REQ-STARTUP-169's refusal into a read failure (`install.ts` then showed "ended early" instead of the bound's sentence). `06-sequences.md` §1's download step is unchanged in its words (the bound and the refusal are still what it says); what changed is that the refusal is now reported as the refusal, which `06-sequences.md` already implies by naming REQ-STARTUP-169 at that step. No package, edge, process, channel, command, notice, store column or fact owner changed (`04-seams.md`, `05-state-ownership.md` unchanged).

**The portable's could-not-prepare notice (REQ-STARTUP-165 (c), REQ-STARTUP-150; 2026-10-31, `../../archive/defects/a-portable-that-could-make-no-preparation-starts-without-the-notice-req-startup-165-c-requires.md`).** `04-seams.md` §6 gains the invariant for a notice about the launch itself: read before the window, raised by `report` from `postShowActivation`, every word in `main/preparation-notice.ts`. `02-process-view.md`'s portable paragraph says main now reads the stub's marker; `05-state-ownership.md` gains the marker's row (the stub writes it, main reads it once); `06-sequences.md` §1 gains the read after the claim and the raise after the show. No package, edge, process, message or channel changed.

**The build writes the requirement symbols when they are absent (ADR-0056; 2026-10-31, `../../archive/defects/a-fresh-clone-cannot-build-until-pnpm-symbols-has-run.md`).** `01-component-view.md`'s responsibilities gain "The requirement symbols on the build path": the desktop build config reaches `tools/symbol-artifact/ensure.mjs`, and the preflight's line says the generator, not `pnpm symbols` alone, writes `generated/`. No package, edge, process, message, channel or ownership changed.

**A failed read of the record is no decline (ADR-0055 consequence 14, REQ-STARTUP-161/164; 2026-10-31, the PR's review).** `06-sequences.md` §1: the stand-down declines on a record gone, malformed or naming another claim, and any other failed read answers as the instance. OQ-460 and OQ-461 raise the two readings the entries below left unruled.

**A reclaim leaves only a record naming another live claim (ADR-0055, REQ-STARTUP-161/164; 2026-10-31, the review of the entry below).** The entry below says the reclaim "takes only the claim it failed to reach"; that predicate left a record naming a dead process too, and the launch ended `refused` with no window. `instance.ts`'s clause (3) now removes the record unless a fresh read finds another live claim. `06-sequences.md` §1's Phase 0 note and stand-down paragraph, `02-process-view.md`'s instance-claim row and `05-state-ownership.md`'s reclaim name the corrected predicate; §1 points at the open note on a launch whose two hand-overs go unanswered. Nothing else in the views changed.

**A process the instance record no longer names stands down, and a reclaim takes only the claim it failed to reach (ADR-0055 consequence 14, REQ-STARTUP-161/164; 2026-10-31, `../../archive/defects/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md`).** `06-sequences.md` §1: Phase 0 names clauses (2)–(4), with (4)'s second hand-over, and gains the stand-down paragraph; the ordinary hand-over's `{"ok":true}` is now conditional on the record. `02-process-view.md`'s files on disk: the instance-claim row names the conditional removal and the acknowledgement rule. `05-state-ownership.md`: the instance record's writers name the reclaim and its holder's re-read. `ClaimDeps` gains `onHandOverDeclined`, which main logs. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**Open log and the third-party licence bundle are bounded at the opener (REQ-SESSION-191, REQ-SHELL-142, REQ-SHELL-040; 2026-10-31, `../../archive/defects/open-log-waits-on-the-platform-opener-without-a-bound.md`).** `02-process-view.md`'s message families: `session.openLog` and `shell.openThirdPartyLicenses` name the 5 s bound (`openFile`, `main/open-folder.ts`) and the refusal an opener that never answers becomes. `workspace.openFolder` is unchanged. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner.

**An unreadable identifier is held and raised (REQ-SESSION-197; 2026-10-31, `../../archive/defects/an-unreadable-workspace-identifier-leaves-the-window-unopened-without-a-notice.md`).** `04-seams.md` §6 and `03-runtime-view.md` §7 name `WORKSPACE_REFUSALS` and `holdOpenRefusal`, and, since the review's rework, `workspace.not-a-folder` (`../../archive/defects/a-workspace-path-that-is-not-a-directory-is-reported-as-an-unreadable-identifier.md`) and the withdrawal of a replaced hold's notice. No package, process, channel, command or store column changed.

**The portable swap never empties the artifact's path (REQ-STARTUP-176, REQ-STARTUP-125 under PD-STARTUP-008; 2026-10-31, `../../archive/defects/the-portable-swap-leaves-the-artifact-path-empty-between-its-two-renames.md`).** `02-process-view.md`'s files on disk: the `.update`/`.old` row names the copy aside and the single rename onto the target, and what a failed final rename leaves; `06-sequences.md` §1's portable branch says the same. `StrategyFiles` gains `copyAside` (`updater/electron.ts`: an exclusive `copyFile`). No package, edge, process, channel, command, notice or store column changed, and no fact changed owner (`05-state-ownership.md` unchanged).

**The update download is bounded by the size the feed states (REQ-STARTUP-169/179; 2026-10-31, `../../archive/defects/the-update-download-writes-whatever-length-the-server-sends.md`).** `02-process-view.md`'s files on disk: the staging row names the bound; `06-sequences.md` §1's asset fetch says the same. A longer transfer fails at the existing `download` stage with its own sentence. No package, edge, process, channel, command, notice or store column changed, and no fact changed owner (`05-state-ownership.md` unchanged).

**The installer hand-off's staging directory is removed (REQ-STARTUP-178; 2026-10-30, `../../archive/defects/the-installer-hand-offs-staging-directory-is-never-removed.md`).** `02-process-view.md`'s files on disk: the staging row says who removes it, and `<data>/updates/installer-handoff.json` gains a row; `05-state-ownership.md` gains the record's row; `dataLayout` gains `updates`. No package, edge, process, channel, command or store column changed.

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

## Older entries

Until 2026-10-26 every entry stood in this one file, 3,697 lines by then. The entries before 2026-10-16 were moved
verbatim, in their order, into the numbered parts below so that this log stays inside
[the document budget](../../README.md#the-document-budget): the newest entries here, the rest one hop away. A part is
numbered oldest first; when the entries above outgrow the budget, the oldest of them move, in order, into a new part
with the next number, and its row goes at the top of this table.

| Part | "Last reconciled" dates it carries | Its newest entry |
|---|---|---|
| [17](reconciliation-log/17.md) | — | The notices generator's reviewed exceptions resolved (O-3, O-11, OQ-74, OQ-75; 2026-10-23). |
| [16](reconciliation-log/16.md) | — | The release feed names `Concrete-Dynamics/Rotaris` (O-5 re-ruled by R-078, REQ-STARTUP-105; 2026-10-21). |
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
