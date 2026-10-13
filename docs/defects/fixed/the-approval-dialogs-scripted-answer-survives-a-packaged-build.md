## The approval dialog's scripted answer survives a packaged build

The verification seam that answers an approval dialog with a real click (`ROTARIS_CAPTURE_APPROVAL`, with
`ROTARIS_CAPTURE_APPROVAL_MS` and `ROTARIS_CAPTURE_DIALOG_PNG` beside it) is read in `presentNext` in
`apps/desktop/src/main/index.ts` behind `capturing` alone, the run-time test that `ROTARIS_CAPTURE_PNG` is set. It is not
behind the build-time flag `__ROTARIS_SEAMS__`, so a packaged build keeps it: `scripts/package.mjs` keeps
`ROTARIS_CAPTURE_PNG` on purpose (its own packaged probe drives it), and anything that can set two variables in the
application's environment can then have every permission dialog answered "Approve for this session" by a click the
user never made. `package.mjs`'s seam check does not name the variable, so the build passes with it inside.

Found 2026-10-13 by plan fin42 while extending that seam for the away-state proof (PD-TOOLS-005, N53). Before then no
proof set the variable: `grep -rn CAPTURE_APPROVAL` over the repository found it in `index.ts` alone.

## Specs

- ADR-0056's fourth execution ("the seams stop shipping"): every scriptable seam, "the scripted clicks" first among them,
  is compiled out of a packaged build behind `__ROTARIS_SEAMS__`; a seam gated on an environment variable at launch is
  "a surface that is switched off", which that execution states is not enough. The process view says the same of main's
  verification seams.
- REQ-TOOLS-052 / REQ-TOOLS-061: an approval is the user's answer, given through the dialog.

## Relevant files

- `apps/desktop/src/main/index.ts` — `presentNext`, the seam's three reads.
- `apps/desktop/scripts/package.mjs` — the seam check's `forbidden` list, which does not name the variable.
- `docs/architecture/adr/0056-the-build-toolchain.md` — the fourth execution.
- `docs/architecture/views/02-process-view.md` — main's row, the seams compiled in only where the flag is true.

## Outcome — repaired 2026-10-13 (plan fin42)

Main reads the three variables behind `__ROTARIS_SEAMS__` (`scriptedApprovals`, `scriptedApprovalMs`, `scriptedDialogPng` in
`apps/desktop/src/main/index.ts`), so a packaged build compiles the reads out, and the answer is parsed by
`apps/desktop/src/main/capture/approval-answers.ts`, which names no variable. The same change gave the seam a per-tool form
(`<tool>=<answer>[,<answer>…]`, `none` leaving a dialog to its timeout) for the away-state proof. `scripts/package.mjs`'s seam
check now names `ROTARIS_CAPTURE_APPROVAL` and `ROTARIS_CAPTURE_DIALOG_PNG`.

Pinned by `approval-answers.test.ts`'s source case (every read of the three in `index.ts` carries the flag), red on the
unrepaired `index.ts`. Measured on the artifact: `ROTARIS_BUILD=package pnpm --filter @rotaris/desktop build` on `6de2a67`
left `ROTARIS_CAPTURE_APPROVAL` in `out/main/index.js`; after the repair the same build left neither name in any emitted file of
`out/main/` while `ROTARIS_CAPTURE_PNG` stayed, and the ordinary build still carries the seam. `pnpm package` itself was not run.

Left as found, beside it in main: the other dialog answers read behind `capturing` alone (`ROTARIS_CAPTURE_HOOK_REVIEW`, `ROTARIS_CAPTURE_PAUSE_ANSWER`, `ROTARIS_CAPTURE_BACKUP_TO`,
`ROTARIS_CAPTURE_RESTORE_FROM`, `ROTARIS_CAPTURE_SAVE_PATH`, `ROTARIS_CAPTURE_ANSWERS` and others). They are not
this note's repair, which concerned the permission dialog the task extended, and are recorded in
[`../a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md`](../a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md).
