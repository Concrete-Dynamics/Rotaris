## workspace-proof's quit and deferred-offer readings go red on a loaded Windows host

Seen 2026-11-03 by R-091 bundle A2's builder in `C:/dev/Rotaris-wt-hrd1-securewindow` (`hrd1-secure-windows-and-fuses`
merged with `origin/main` at `e6a79b43`; Windows 11 ARM64, Node 26.13.0, Electron 44.3.0), with the host's CPU at 76 to
100 % from other trees' gates and proofs and 12 to 20 Electron processes of theirs beside it. `pnpm workspace-proof` ran
twice and went red differently each time:

- first run: "REQ-SHELL-011 / REQ-WORKSPACE-008: answering one window cancels only its deferred offer — offered for [4];
  project-d acknowledgements []", and then the harness threw: the `app-init-held` launch wrote no driver endpoint within
  90 s and neither SIGTERM nor SIGKILL was reaped;
- second run: every check green but "REQ-WORKSPACE-092 / REQ-WORKSPACE-109: an orderly quit during a setup step completes
  within 5000 ms … — the quit ended the app in 14645 ms (0); the run host's shutdown ended the setup; 5 s after the exit
  neither the step … nor its descendant … is running": the quit did end the step and what it started, but took 14.6 s
  against the 5 s bound.

No idle host was available to rerun it alone, so neither is yet separated from the product. The bundle changed no quit,
launch, offer or setup path (its diff is the windows' web preferences, the session permission handlers and the packaged
fuses), so it is recorded rather than investigated there. A rerun alone on an idle host decides: green there makes these
loaded-host readings; red there is a product defect of the quit's bound (REQ-WORKSPACE-092) or of the offer's cancellation.

## Specs

REQ-WORKSPACE-092 and REQ-WORKSPACE-109 (a quit during a setup step ends it and what it started, within the bound the proof
reads); REQ-SHELL-011 and REQ-WORKSPACE-008 (answering one window's deferred offer cancels only that window's). None is
shown contradicted yet: the readings were taken under load.

## Relevant files

- `apps/desktop/scripts/workspace-proof.mjs` — the deferred-offer check (`answering one window cancels only its deferred
  offer`) and the setup-step quit check (`exitedAfter <= 5_000`).
- `apps/desktop/src/main/exit.ts` — the orderly shutdown the quit runs.
- [the hello-bound note](a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md) — the
  other launch reading this host gives under load.
