## requirements-proof meets a different red each run at its fixed-offset stages

On the Linux agent host (X11, 24 cores, 30 GiB, 2026-11-22 to 24), `pnpm requirements-proof` ends red in most runs, each
time at a different stage, and never twice in a row at the same one:

- REQ-TRACE-365: the scroll sweep's last realised card is REQ-2106, not REQ-10014 (twice);
- REQ-TRACE-426: after the accept, the pane's notice reads null;
- REQ-TRACE-375/376: the queue pane did not open at 1000 × 680 (null);
- REQ-TRACE-397: the card carries [], not the engine's refusal (twice);
- REQ-TRACE-472: the review's re-run raised no disclosure (null);
- the fold stage: clicking the Done heading left 0 rails (the press folded nothing);
- the filter stage: the summary still read "No filter is active" after choosing the epic.

All of these were met on `main` (`710a4a5a`, the filter red) as well as on the branch of R-122..R-124, and on the branch in
builds with and without the capture seams' page-focus hold, alike. Three runs in a row on the branch went green on
2026-11-22, while the desktop was otherwise idle. Every launch of the proof reads its window at fixed offsets
(`ROTARIS_CAPTURE_EVAL_AT`, `_CLICKS` and `_INSPECT_AT` at e.g. 3200, 3600 and 4400 ms). Each red reads as a step
taken before the board, the pane or the answer it waits on was there. The cause is measured below. Another session's proofs were running on the same desktop for three of the runs. The
rest ran alone, with the host's browser using about one core.

**Cause, measured 2026-11-24.** In the landing tree's failing run (`ready-restart-automatic`), the stage's clicks at 4000 and
4800 ms fired together at about 6070 ms, and the click at 7800 ms looked for "Release" before the 6800 ms press on the move
control had raised it. The main process logged on time throughout. Each click waits for the renderer to answer its aim,
and the renderer answered late while code-intelligence project setup ran: create, index and memory, about five seconds,
ending at the same instant the late clicks fired. Every profile is a fresh workspace, and in a tree that holds the built
bundle (`apps/desktop/resources/code-intelligence/`, which `pnpm worktree:land` builds into its landing tree) every launch
runs that setup, so each launch's clicks raced it differently.

**Repaired 2026-11-24.** The proof's workspaces record the setup as resolved (`skipped: [code-intelligence-setup]`, and the
server disabled), as `code-intel-proof` and `dictation-proof` already seed theirs. Nothing in this proof measures that setup.

**A second cause, measured the same day.** With the setup resolved the proof still went red in four of four runs on the
desktop (`filter`, REQ-TRACE-364, REQ-TRACE-365), and in each the step that waits on animation frames came late: a click's
aim waits two frames (`targetProbe`) and landed about 1.1 s after its time, while an eval or a probe beside it answered on
time. The host runs GNOME on Wayland and the proof's windows are XWayland windows, which receive no frames while another
window covers them, so the product's own frame-driven work (the board's realisation, a reveal's focus) stalled with them.
Turning off background throttling for the window changed nothing. Run under a virtual display that nothing covers,
`xvfb-run -a -s "-screen 0 1920x1080x24" pnpm requirements-proof` passed three of three. On this host a proof run, and
`pnpm worktree:land`, runs under `xvfb-run`, the wrapper `docs/proofs/README.md` names for Linux.

Not to be confused with the fold stage's focus reading (REQ-TRACE-320), which was a different cause and is repaired
(`docs/archive/defects/requirements-proof-fold-stage-depends-on-the-launched-window-holding-os-focus.md`).

## Specs

None contradicted by the product as far as shown. The stages still read at fixed offsets, so a launch slowed by anything
else can still race them; the waiting form (the step grammar's `~` "until" form, `settleAt`) would remove that, and was
not needed for this repair.

## Relevant files

- `apps/desktop/scripts/requirements-proof.mjs` — the stages' launches and their fixed `@<ms>` steps.
- `apps/desktop/src/main/capture/host.ts` — `settleAt`, `centreWhen`: the waiting forms the stages could use.
