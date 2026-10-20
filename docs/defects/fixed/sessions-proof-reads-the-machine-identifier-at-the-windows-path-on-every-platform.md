## sessions-proof reads the machine identifier at the Windows path on every platform

`pnpm sessions-proof` exits 1 on Linux in about 31 s, deterministically, in both of the sweep's runs on 2026-09-28.
It crashes with `ENOENT` while planting the sessions for launch 4, `repair-all`. Its `machineId()` reads
`<local>/rotaris/data/machine-id`, which is where the product keeps the identifier on Windows only.

The product writes the identifier at `dataLayout(resolveUserDirs()).machineId`, which is `join(dirs.data, 'machine-id')`
(`packages/platform/src/dirs.ts`, minted by `readOrMintMachineId` in `apps/desktop/src/run-host/host.ts`). `dirs.data`
is different on each platform:

- on Windows, `%LOCALAPPDATA%\rotaris\data`;
- on Linux, `$XDG_DATA_HOME/rotaris`, so the file is `<local>/rotaris/data/rotaris/machine-id` under the harness's
  `XDG_DATA_HOME=<local>/rotaris/data`;
- on macOS, `~/Library/Application Support/rotaris/data`.

The file existed at the Linux location in the sweep's profile. The script's Windows spelling is a literal in the
script: `harness.mjs` already has a tested copy of the product's directory rule for the other sub-locations
(`workspacesRootFor`, `tokensDirFor`), but none for the machine identifier.

The identifier is `host` in the planted `C-deadlock` and `D-live` locks. With it unreadable, `repair-all` and every
launch after it went unmeasured on Linux: `export-records`, `export-trajectory`, `unreadable`, `delete`, `isolated`
and `delete-isolated`. The three launches before it passed in both runs.

## Specs

The harness contradicts no requirement of the product. It fails to measure REQ-SESSION-057, REQ-SESSION-059,
REQ-SESSION-060 and REQ-GIT-160 (launch 4) and everything after on any platform but Windows. REQ-SESSION-046 fixes the
identifier's location: "the machine-local location the store lives in (REQ-STARTUP-145)". The product keeps it there,
beside `workspaces/`, and the proof looks for it elsewhere.

## Relevant files

- `apps/desktop/scripts/sessions-proof.mjs`: `machineId()`, the literal `join(local, 'rotaris', 'data', 'machine-id')`.
- `apps/desktop/scripts/lib/harness.mjs`: `workspacesRootFor` and `tokensDirFor`, the copies of the product's rule
  that the machine identifier lacks.
- `apps/desktop/scripts/lib/proof-isolation.test.ts`: checks those copies against `resolveUserDirs`/`dataLayout` on
  all three platforms.
- `packages/platform/src/dirs.ts`: `dataLayout().machineId`, the product's answer.

## Repaired — 2026-09-28 under R-062

**What changed:**

- **The identifier's path.** `harness.mjs` gains `machineIdFileFor(local, platform, home)`, the product's
  `dataLayout().machineId` copied by the same rule as `workspacesRootFor` and `tokensDirFor`. `sessions-proof`'s
  `machineId()` reads it.
- **The planted "dead" lock.** `C-deadlock`'s lock names a pid chosen per platform by `plantedDeadPid`
  (`lib/lock-holder.mjs`), and the report's expected sentence names that pid. A live pid would make `C-deadlock`
  live, not stale (REQ-SESSION-056), and fail the proof on the product.
  - On **Linux and macOS** it is the pid of a child this script ran to completion and checked with `pidExists`, where
    it used to be the literal `4242`. Any small number can be a live process there. On this host, pids wrapped
    during the day's runs (1 389 followed pids near 30 000). Those systems reuse a freed pid only after the counter
    wraps, so the exited child's pid stays unused for the seconds the proof needs.
  - On **Windows** it stays `4242`. No Windows pid is 4 242, since those are multiples of 4. An exited child's pid
    would be the wrong choice there, because Windows reissues a freed id soon from its free list, and the
    `repair-all` launch's own processes could be handed it before the product probes the lock.
  - The first round of this repair used the exited child on every platform, including Windows. The verifier
    reasoned that this brought a flake to Windows where there had been none. It was not observed, because
    Windows was not run (IC-3). The second round made the choice per platform.
- **Launch 2's dead lock.** Launch 2 now checks that the lock it leaves really is dead: the pid is probed the moment
  the launch returns (`lib/lock-holder.mjs`), as `checkpoint-proof`'s step (c) does
  ([its note](checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md)).

No assertion was weakened.

**Pinned by** `apps/desktop/scripts/lib/proof-isolation.test.ts`. It checks `machineIdFileFor` against `dataLayout`
on `win32`, `linux` and `darwin`, including a scratch home on `darwin`. It also pins the two spellings apart: Windows
`…\rotaris\data\machine-id`, Linux `…/rotaris/data/rotaris/machine-id`. The dead-pid check is covered by
`lib/lock-holder.test.ts`'s real-process case. Its per-platform case pins `plantedDeadPid`: `4242` on `win32`
with no child run, and an exited child on `linux` and `darwin`, which probes dead on this host.

**Shown on the built app**, `fa377e6` plus this branch, as root under Xvfb, Node 24, after one `pnpm build`.

**Before.** `main`'s script (`git show fa377e6:apps/desktop/scripts/sessions-proof.mjs`) reproduced the crash, exit 1
in 28.5 s: `ENOENT … open '…/.proof/sessions-proof/profile/local/rotaris/data/machine-id'`.

**After.** One trial run, then `node apps/desktop/scripts/sessions-proof.mjs --skip-build` three times in a row. Each
exited 0 in 93 to 94 s with "sessions proof: 10 scenarios passed", and each `results.json` holds all ten scenarios,
`seed` through `deleteIsolated`. The load was 0.7 to 2.1. Another agent's Electron proofs in `wt-prfb5` were running
during runs 1 and 3: 8 and 11 Electron processes at their start.

| Run | Launch 2's lock pid | `C-deadlock`'s planted pid | `D-live`'s holder pid |
|---|---|---|---|
| 1 | 9853 | 10240 | 10234 |
| 2 | 11835 | 12154 | 12153 |
| 3 | 14337 | 14645 | 14644 |

In each run, launch 2's lock pid was dead at the first probe.

**Second round, with `plantedDeadPid`** (`f8d8799` and `cfe4c9a`, the same build, `--skip-build`). Three more runs in
a row exited 0 in 101 s, 99 s and 100 s, each with "sessions proof: 10 scenarios passed" and all ten scenarios in
`results.json`. The host was loaded: 4.4 to 7.3, with 8 to 16 Electron processes from another tree at each start.

| Run | Launch 2's lock pid | `C-deadlock`'s planted pid | `D-live`'s holder pid |
|---|---|---|---|
| 1 | 25897 | 27057 | 27056 |
| 2 | 32021 | 741 | 740 |
| 3 | 3397 | 4745 | 4734 |

In run 2 the pid counter wrapped between launch 2 and `repair-all` (32 021, then 741). The planted pid was still dead
when the product probed it. On Linux only the `linux` branch runs; the `win32` branch is pinned by the unit case.

**Not shown:** Windows and macOS (IC-3). The macOS path is measured by the unit test only.

## Addendum, 2026-10-20 — on Windows

The Windows ARM64 session's C2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `30d35b3c`) ran `sessions-proof` three times. The third passed whole ("11 scenarios passed"); the identifier was at `profile\local\rotaris\data\machine-id` and nowhere else under the profile, and the planted locks named this machine through it: repair-all named B-nolock and C-deadlock (pid 4242) and left D-live out. The first run stopped at `delete` on a probe placed before a slower Git finished, the second on the machine entering Modern Standby; neither is this note's.
