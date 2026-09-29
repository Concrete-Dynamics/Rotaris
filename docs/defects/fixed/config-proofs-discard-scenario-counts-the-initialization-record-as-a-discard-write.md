## `config-proof`'s Discard scenario counts the initialization record as a write by Discard

Scenario 3 of `apps/desktop/scripts/config-proof.mjs` changes a Runtime toggle, presses Discard, and then requires
the workspace's `.rotaris/agents.yaml` to be byte-identical to its seed. The seed is a workspace that has never
been initialized. Since Part AS (ADR-0064) such a workspace has one pending background task on open,
`code-intelligence-setup`, and when that task succeeds the initialization runner records it in the same file:
an `initialization:` section with `completed: [code-intelligence-setup]`, `skipped: []`, `last_run` and
`classification: non-code`. That is the product doing what REQ-WORKSPACE-078/079/083/085 require of the file's
one other writer. The byte comparison cannot tell it apart from a write by Discard, so the scenario fails with
"Discard wrote the file" on any host where the task succeeds.

The task succeeds only where the bundled code-intelligence runtime is present
(`apps/desktop/resources/code-intelligence/`, built by `pnpm code-intel:bundle`). Without it the task fails,
records nothing (REQ-WORKSPACE-084), and the scenario passes. That is why the same `main` was green in a tree
without the bundle and red in the sweep tree that had one. Reproduced 2026-09-28 in the same worktree, both
ways. Without the bundle the log reads `initialization: code-intelligence-setup → failure` and the file is the
seed. With the bundle copied in, it reads `→ success` 0.5 s before the Discard click, and the file is the seed
followed by the six-line `initialization:` block.

The sweep's first run showed a second, independent weakness in the same launch. The Settings category is
selected by the `ROTARIS_CAPTURE_VIEW` seam's one click on the Runtime item, 800 ms after the window loads.
If the item is not drawn yet, that click is skipped and nothing is logged. On that run the screen stayed on
Models, the default category (REQ-CONFIG-269). Both of the scenario's steps then logged
`no "…" control on screen` at their fixed 1,800 and 2,400 ms, and the launch carried on anyway. The script
does not read the steps back, so a launch that pressed nothing would have passed the byte check once the
initialization write was out of the way. Scenario 1 (Runtime → Save) has the same shape. It is protected only
by its later assertions.

## Specs

The product contradicts none. REQ-CONFIG-279, REQ-CONFIG-281 and REQ-CONFIG-282 (Discard notifies, the host
commits, nothing is written) are what the scenario stands for. REQ-WORKSPACE-078, REQ-WORKSPACE-079,
REQ-WORKSPACE-083 and REQ-WORKSPACE-085 make the initialization record a legitimate, separate write to the same
file. The fault is in the harness: its fixture predates that writer, and its steps are fixed offsets that
are never read back.

## Relevant files

- `apps/desktop/scripts/config-proof.mjs`: scenario 3's seed and its byte-identity check. It also holds scenarios 1 and
  3's `ROTARIS_CAPTURE_CLICKS` steps at fixed offsets, never read back.
- `packages/config/src/init/execute.ts`, `packages/config/src/init/state.ts`: the one writer of the `initialization:`
  section.
- `apps/desktop/src/main/initialization.ts`: resolution on open, which starts the background task.
- `apps/desktop/src/main/capture/seams.ts`: the `ROTARIS_CAPTURE_VIEW` seam's category click, one attempt at 800 ms,
  silent on a miss.
- `packages/ui/src/SettingsView.tsx`: the category list (`.settings__categories .nav-list__item`), Models by default.

Noticed and diagnosed 2026-09-28, by the Linux proof sweep under R-062.

## Repaired — 2026-09-28, under R-062

Only the harness changed; the product was right. In `apps/desktop/scripts/config-proof.mjs`:

- **The Discard seed is a workspace initialized before.** Scenario 3's `agents.yaml` is the old seed followed by an
  `initialization:` section that records `code-intelligence-setup` as completed (`INITIALIZED`). Resolution on open
  finds nothing pending (REQ-WORKSPACE-081, REQ-WORKSPACE-083), so no other writer is due during the launch. The
  byte-identity check is unchanged and is now made against that seed. The launch also fails if its log shows
  `initialization: running`, so a seed that stops holding cannot hide a write again.
- **Every click is read back** (`clicked`, over `unpressedClicks` in the new `apps/desktop/scripts/lib/capture-clicks.mjs`,
  pinned by 5 cases in `capture-clicks.test.ts`). Scenarios 1 and 3 fail by name when a step logged no press, or
  pressed a point another element covers.
- **The steps wait for their controls.** The Runtime category is chosen by a click step with a deadline
  (`.settings__categories .nav-list__item>>Runtime@~6000`), because the view seam's own single click can miss. The
  toggles, the confirmation, Save and Discard moved from fixed offsets to `@~` deadlines. Each fires as soon as
  its control is drawn. Discard is drawn only while the form is dirty (REQ-CONFIG-281), so it cannot fire before
  the toggle has taken.
- **Discard's outcome is read on screen as well as on disk.** The save-status probe must read "All changes saved"
  (REQ-CONFIG-280) at the capture.

Verified as root under Xvfb, Node 24, after one `pnpm build`, with the bundled code-intelligence runtime present,
which is the red's condition. Before the change, one run went red exactly as the sweep's did. After it, three runs
in a row were green, the last two with another worktree's Electron proofs running beside them. One more run with
the bundle moved aside was also green. The view seam's silent single category click in
`apps/desktop/src/main/capture/seams.ts` is not changed. Other proofs share it, and this proof no longer depends on it.
