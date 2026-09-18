## Accepting the Start session dialog with isolation chosen creates no session, and says nothing

`pnpm checkpoint-proof`'s isolated-session scenario drives the product's own gestures — click
`New session`, click `start-session-isolation`, click `start-session-accept`, type a prompt into the
composer — and nothing happens. The launch log records all four gestures and then ninety seconds of
silence:

```
capture: clicked "New session"
capture: clicked "[data-testid="start-session-isolation"]"
capture: clicked "[data-testid="start-session-accept"]"
capture: typed "Write the notes in a worktree."
capture: wait for result timed out after 90000 ms
```

The store confirms that the silence is real, not a display problem: the workspace's `sessions` table
holds only the two sessions earlier scenarios created (`21:08:11` and `21:09:59`) and **no row at all**
for the accept at `21:10:55`. No refusal is logged, no notice is raised, and no error appears anywhere
in the launch. The proof then fails at `the isolated session carries no binding`, which is the symptom
rather than the defect — `latestSession()` is reading the previous scenario's session, because the
isolated one was never created.

Reproduced twice, on two runs of the built application.

**The cause is not established, and this note does not guess at one.** Two candidates, both cheap to
test: the isolation control is a `DesignCheckbox` since the design-system migration, so the click may
land on the wrapper rather than toggling the box, and the accept may then be submitting a dialog whose
submit handler returns early; or the accept is refused inside `onAccept` and the refusal is swallowed.
What is NOT a candidate is branch validation, the obvious suspect: the scenario's workspace holds only
`main` and one worktree (its own), so `defaultSessionBranch` collides with nothing and `branchError`
should be null.

**A third candidate arrived from `pnpm ui-audit` the same day, and it is the strongest**: the dialog
measures 560 × **904** and does not fit any supported window — at the minimum 1000 × 680 its run-start
selector, its `Cancel` and its `Start session` are all measured OFF SCREEN
(`the-start-session-dialog-does-not-fit-the-minimum-window.md`). A synthesized click at a control's
computed centre lands nowhere when that centre is outside the window, which would produce exactly what
the log shows: the seam reports the click, and nothing happens.

Either way the user-visible behaviour is the same and is wrong on its own terms: a dialog that accepts
a gesture and produces neither a session nor a reason.

**Why it has been invisible.** `checkpoint-proof` failed earlier in the script — at a stale assertion
over a timeline entry name (`docs/defects/fixed/the-proofs-assert-a-timeline-name-the-audit-corrected.md`)
— so it has not reached this scenario since that name was corrected. The failure here is at scenario
`isolated`, and `isolated-restore` after it has been unmeasured for the same period.

## Specs

REQ-SESSION-084 (the create path creates the record and then binds the worktree), REQ-GIT-118 and
REQ-SHELL-125 (the dialog's isolation choice and its branch), and the refusal discipline that covers
everything else the product declines to do: a refusal is reported, never silent.

## Relevant files

- `packages/ui/src/StartSessionDialog.tsx` — `start-session-isolation` (a `DesignCheckbox`),
  `start-session-branch`, `start-session-accept`, and the `accept()` early return.
- `apps/desktop/src/main/commands/` — the session-create command the dialog's acceptance reaches.
- `apps/desktop/scripts/checkpoint-proof.mjs` — the `isolated` scenario (and `isolated-restore` behind
  it), with the evidence under `.proof/checkpoint-proof/isolated.log`.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) after repairing the stale assertion that had been
hiding this scenario. Not repaired here: it is a session-creation path this part does not touch, and
diagnosing it belongs with whoever owns that dialog's next change.

## Evidence against the geometry candidate — 2026-09-18

The sibling note's repair was driven in the built app and this scenario's first two candidates were
tested there too, against the repaired dialog at 1000×680: the isolation click lands on the native
checkbox (`INPUT.check__input`, toggles to `checked: true`), the accept closes the dialog, and the
composer takes focus with its choices held for the next submission. The synthesized click the note
describes produces exactly what the log shows — the seam reports the click — and something happens:
the dialog closes. The off-screen geometry is therefore falsified as the cause of THIS scenario; its
strongest candidate is out. The refusal candidates stand: driving the isolated path further in this
checkout answers with the worktree-creation refusal "Workspace must be the root of its Git worktree"
(`packages/workspace/src/git/worktrees.ts:103`), because the driven workspace is a subdirectory of
the repository rather than its root — a property of the driven checkout, not of the dialog. Whether
that refusal is also what the proof's scratch workspace met is not established here; the scenario
remains open with one fewer candidate.

## Repaired — 2026-09-18

The silence is closed by construction rather than by chasing the one refusal the proof met: the
accept-to-submit path held three shapes of it, and every one is now a reported refusal.

**Root.** The dialog's accept creates no session by design — it holds `launchOptions` for the
composer's next submission (`apps/desktop/src/renderer/main.tsx:1029`), which sends `session.start`.
That command crossed two process links with no rejection handling — `worktree.create`/`checkAttach`
(120 s/60 s bounds) and the run host's `session.start` (10 s) in
`apps/desktop/src/main/commands/session.ts` — while `ProcessLink.request` rejects on timeout or
close (`packages/shell/src/process-link.ts:56`). A rejection threw out of the handler, past a
`runCommand` that catches nothing despite ADR-0019's "nothing throws" (`apps/desktop/src/main/index.ts:1291`),
so `ipcRenderer.invoke` rejected in the renderer — where `session-actions.ts` awaited the bridge
with no catch, and `WorkspaceView`'s submit cleared the text and set busy before `onSubmit`
answered. The composer sat wedged, emptied, with no error; main logged nothing and raised no
notice. The three pre-binding early returns (`workspace.none` ×2, `worktree-options`) likewise
returned without a log line. Any one of these produces exactly the recorded evidence: gestures in
the log, no session row, no refusal anywhere.

**Repair.** `session.start` funnels both links' rejections into its existing refused paths — the
workspace-service link into `bindFailure` (notice + `run refused before start` log), the run-host
link into the refused-start block (orphan worktree removed per REQ-GIT-023, notice + `run refused`
log) — and the three early returns log. The same unguarded `session.start` relay in
`improvements.ts` takes the file's own `.catch`-to-refused idiom. The renderer's eleven gestures
send through one `send()` that turns a rejection into `{ok:false}` carrying the cause
(`command.unreachable`), which is the never-throw contract the module's own header already
promised; `WorkspaceView`'s submit catches around `onSubmit` so `busy` always clears and
REQ-CHAT-012 (text restored, reason raised) holds even on a throw. `checkpoint-proof` probes
`.composer__error` now, and the isolated assertion carries the composer's words and the notice
headlines, so a future silence names its refusal instead of its symptom.

**Evidence.** `apps/desktop/src/main/commands/session.test.ts` (4: rejecting worktree link refuses
with the cause + notice + log and never asks the run host; rejecting run host refuses and removes
the created tree; both early returns logged; the isolated happy path carries the minted id and the
binding); `session-actions.test.ts` (+1: all eleven gestures answer on a rejecting bridge).
`pnpm checkpoint-proof --skip-build` green on the built app — the note's own gesture sequence
(`New session → isolation → accept → typed prompt`) creates session `78a392ef`, binds worktree
`rotaris/session/78a392ef`, records checkpoint 1 with its ref in the shared repository, and the
isolated restore rewrites the worktree only. No requirement is falsified — ADR-0019 and the
refusal discipline already required all of this — so no amendment round is owed.
