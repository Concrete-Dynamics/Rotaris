## The package job's packaged launch can paint its window and start no run, the probe's input never landing

Noticed on 2026-11-07 while making electron-vite 6 green on Electron 44.10.0 (branch
`chore/deps-electron-vite-6-preload-fix`, PR [#66](https://github.com/Concrete-Dynamics/Rotaris/pull/66), the lane's record
`docs/architecture/dependency-alerts/2026-11-07-lane-electron-vite-6-preload-fix.md`). One CI `package` job refused with
`expected one session, found 0`, and the run's own evidence artifact (`windows-x64-package-evidence`, job `128237770453`,
run `42318716466`, head `90e80d1c`, `load-proof.json` written `2026-11-07T00:32:42.331Z`) shows a failure that is **not**
the preload's externals that branch was fixing:

| Reading | Value |
| --- | --- |
| `the preload carries no external package` (the branch's own new step) | **ok** — the built preload required `electron` alone |
| `load-proof.png` | 1024×720, **2721 distinct RGB colours** — a fully painted window (sidebar, the "No model provider is authenticated yet" banner, the Overview view) |
| app log | the full host-side sequence: `main window 1 loaded`, the notice, `code-intelligence-setup → success` |
| the typed prompt | **never landed** — no `prompt roots` line, no `run host: session … started`, `0` `POST …/v1/chat/completions` |
| the view at capture | **Overview**, the launch view |

`apps/desktop/src/main/capture/probe.ts`'s `installPromptSeam` sends Ctrl+2, then Ctrl+L, then the typed events through
`webContents.sendInputEvent` on a fixed appointment; here the window was up and painted, so what did not happen is the
input taking effect in the renderer, not the launch. On the same head, the push-event job passed the same step
(`128237708649`, 7m6s) and the pull_request rerun passed it (`128241786120`, 6m44s) — three green readings with the
fields above (session `completed`, 5 model requests, `painted` true) and this one red.

The repository already carries driver-timing notes of the same family
([`part-j-proofs-queue-launch-types-its-queued-prompt-at-a-fixed-appointment-a-slow-run-start-can-follow.md`](part-j-proofs-queue-launch-types-its-queued-prompt-at-a-fixed-appointment-a-slow-run-start-can-follow.md),
`docs/archive/defects/driver-proof-can-type-before-the-composer-holds-focus.md`,
`docs/archive/defects/overview-proofs-relaunch-reads-the-sessions-card-at-a-fixed-offset-while-it-is-still-loading.md`).
What makes this one worth its own note is the cost: the step is ADR-0056 rule 4's own launch, so a red here refuses the
package and holds a merge, and its failure sentence is the same one the preload defect produced — two different causes
behind one message, which is exactly what the branch's new preload step separates.

Recorded, not investigated: the cause is not established here, and the red's own artifact shows a healthy preload.

## Specs

ADR-0056 rule 4 (the packaged launch proves the bindings load and fails if they do not): the step is its check and it
refused. No requirement is shown contradicted; whether the probe's input or the host's timing is at fault is not decided
here.

## Relevant files

- `apps/desktop/scripts/package.mjs` — the packaged launch, its `expected one session` check, and the preload-externals
  step that separates this mode from the preload's own defect.
- `apps/desktop/src/main/capture/probe.ts` — `installPromptSeam` and `installFinish`: the fixed appointment at which the
  chords and the typed text are sent.
- `apps/desktop/scripts/lib/preload-externals.mjs` — the step whose `ok` tells a clean preload from a refused one.
- `.github/workflows/ci.yml` — the `package` job.
