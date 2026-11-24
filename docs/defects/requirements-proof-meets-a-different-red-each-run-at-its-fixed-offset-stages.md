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
taken before the board, the pane or the answer it waits on was there. That would fit a host slower than the offsets
assume, but it was not measured. Another session's proofs were running on the same desktop for three of the runs. The
rest ran alone, with the host's browser using about one core.

Not to be confused with the fold stage's focus reading (REQ-TRACE-320), which was a different cause and is repaired
(`docs/archive/defects/requirements-proof-fold-stage-depends-on-the-launched-window-holding-os-focus.md`).

## Specs

None contradicted by the product as far as shown. A repair is likely the harness's: each stage waiting for what it reads
(the step grammar's `~` "until" form, `settleAt`) in place of a fixed offset, as `overview-proof`'s relaunch was repaired.

## Relevant files

- `apps/desktop/scripts/requirements-proof.mjs` — the stages' launches and their fixed `@<ms>` steps.
- `apps/desktop/src/main/capture/host.ts` — `settleAt`, `centreWhen`: the waiting forms the stages could use.
