# Spike — the Linux AppImage against ADR-0066's acceptance criteria

- **Date:** 2026-11-17, with the hosted runner's readings taken on the night to 2026-11-18.
- **Question:** [ADR-0066](../adr/0066-the-linux-artifact-is-built-on-a-developer-host.md) lets a Linux x86_64 artifact be built and holds its acceptance to four criteria, AC-1 to AC-4, each recorded whether it passed or not. None had been run: the artifact had never been built.
- **Origin:** [R-104](../../product/requests.md#r-104). The owner's condition for publication: "After the checks I can run pass".
- **What was measured:** `Rotaris-0.1.0rc2-linux-x86_64.AppImage`, built by `pnpm package` from the branch `feat/linux-artifacts` — on a developer's host, and again by CI's `package (linux-x86_64, development)` job on a hosted runner. AC-1, AC-2 and AC-4 by `pnpm linux-acceptance-proof` ([its record](../../proofs/linux-acceptance-proof.md)); AC-3 by `pnpm package` and its two counterfactual switches.

## The two hosts

| | Developer host | Hosted runner |
| --- | --- | --- |
| System | Ubuntu 26.04.1 LTS, x86_64, a physical machine, X11 | Ubuntu 24.04.5 LTS, x86_64, GitHub's `ubuntu-24.04` image `20261111.127.1`, a virtual machine, `xvfb` |
| `libfuse.so.2` | **present** (`libfuse2t64` installed) | **never present**: the loader lists `libfuse3.so.3` alone; `dpkg` lists `fuse3`, `libfuse3-3` and `fuse-overlayfs` installed and has no record of `libfuse2` or `libfuse2t64` |
| Is it REQ-STARTUP-024's baseline | no — a later release | the baseline's release, **but not an unmodified installation**: it is the hosted image, with what that image adds |

A desktop AppImage integrator is installed on the developer host and holds every launch behind a dialog; the first readings there (14.3 s and 5.6 s) measured the dialog and are discarded. Every reading below was taken with `APPIMAGELAUNCHER_DISABLE=1`.

## AC-1 — the image runs unextracted where the legacy FUSE library never was: **held on the hosted runner**

Four runs of the job on four runner instances (runs `44157475172` and `44157449839` at `b3102124`, and `44161082815` and `44161074748` at `6c93fc03`), each on a host whose reading was "never had it": the image, unextracted, reached "main window 1 shown" every time. ESC-11's decided option holds as far as this shows — the stable line with the static runtime pinned (`toolsets.appimage` "1.0.3").

**What this does not show:** the criterion says "an unmodified Ubuntu 24.04 installation". The hosted image is Ubuntu 24.04 that never had `libfuse.so.2`, and it is not unmodified. A stock desktop installation was not available. On the developer host the launch succeeded and does not count: the library is there.

## AC-2 — first paint inside five seconds: **held on the median everywhere; not held strictly on the hosted runner**

Launch to the application's own "main window 1 shown", five launches a run, the first being the first that host ever made of the file:

| Host | Launch 1 | Launches 2 to 5 | Median | Strict (every launch ≤ 5 000 ms) |
| --- | --- | --- | --- | --- |
| Developer host | 1 370 ms | 744, 742, 729, 755 ms | 744 ms | **held** |
| Hosted runner, run `44161082815` | **7 517 ms** | 865, 858, 867, 875 ms | 867 ms | **not held** |
| Hosted runner, single launches of the first round | 1 579 ms on one instance, **7 513 ms** on another | — | — | one of each |

On the slow first launch the main process logged its first line 3.4 to 3.7 s after the spawn, and the window was shown about 4 s after that; on every later launch the whole path took under 0.9 s. The load average at the slow launch was 1.2: the machine was not busy. What the first launch pays is the first read of a 216 MB compressed image and the first start of the renderer under a virtual display on four shared cores.

Spike 17 read the Windows artifacts the same two ways, and said the softer reading is the product owner's to apply. So is this one: **a first launch on the hosted Ubuntu 24.04 runner exceeded REQ-STARTUP-155's bound, twice, by half again.** Whether that host stands for the baseline's hardware, or only for its system, the requirement does not say.

**The owner's ruling, 2026-11-18:** shown both readings, "Yes, publish": AC-2 counts as held for publication on the strict reading of the physical host and the median of both; the hosted runner's first launch is recorded as measured and is not explained away.

## AC-3 — the load proof is constructible on Linux, and D10's counterfactuals are refused: **held on the developer host**

`pnpm package` PASSED: rule 1a found `better_sqlite3.node` (2 364 104 B) and `pty.node` (75 728 B) newer than the rebuild marker and byte-identical in the artifact, with no prebuild; rule 4 loaded both from `app.asar.unpacked` under the packaged Electron 45.2.1 (SQLite 3.53.4, a PTY that exited 0). The hosted runner's `pnpm package` passed the same rules.

Both counterfactuals, on the developer host, each ending `pnpm package` with exit 1:

- `ROTARIS_IC6_COUNTERFACTUAL=no-force` — the rebuild returned after 1.5 s having compiled nothing, and **rule 1a refused**: "no compiled binary newer than the rebuild marker … the rebuild step produced nothing; found no file at all".
- `ROTARIS_IC6_COUNTERFACTUAL=keep-prebuild` — rule 1a passed, and **rule 4 refused**: "the loader opened a file that is not the compiled binary the artifact carries".

## AC-4 — a second launch is handed to the first: **held on both hosts**

The second launch, made 7 s after the first on the same account and profile, exited 0 after 0.47 to 0.73 s without claiming an instance; the first logged "hand-over surfaced window 1 … (REQ-STARTUP-162/163)"; one instance opened the store.

## What the first build found, beside the criteria

Repaired in the change that carries this report: the packed executable was named `@rotarisdesktop`, after the package, and the fuse check refused the build; the icon tool does not read the Windows `.ico`; and the packed tree took world-writable modes from the Electron it was copied from. A Debian package is built beside the AppImage under [`PD-STARTUP-013`](../../product/directives/pd-startup-013.md#pd-startup-013); its payload, extracted without installing, showed its window 0.99 s after launch and classified itself not updatable. **Not done:** the package was installed nowhere, so its `postinst` and its `chrome-sandbox` mode were not executed.
