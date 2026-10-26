# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — The Part U proof on Linux: the machine identifier where the product keeps it — 2026-09-28 (R-062)

Part 12 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## The Part U proof on Linux: the machine identifier where the product keeps it — 2026-09-28 (R-062)

`pnpm sessions-proof` had never run past launch 3 anywhere but Windows. It plants the locks for launch 4,
`repair-all`, with `host` set to this machine's identifier, and it read that identifier at the Windows spelling
`<local>/rotaris/data/machine-id`. On Linux the product mints it at `dataLayout().machineId`, which is
`<XDG_DATA_HOME>/rotaris/machine-id`, beside the store, as REQ-SESSION-046 requires. The script crashed with `ENOENT`
in both of the sweep's runs, 31 s in. **The lock, the probe and the repair are not implicated.** Launches 1 to 3
passed in those runs, and the product wrote the identifier exactly where this record puts it.

The proof now reads the identifier through `machineIdFileFor` (`apps/desktop/scripts/lib/harness.mjs`), a copy of
the product's rule. `proof-isolation.test.ts` checks it against `dataLayout` on `win32`, `linux` and `darwin`.

Two further repairs came with it, to preconditions the proof stated and did not check:

- **The dead lock.** The lock that launch 2 leaves is probed dead the moment that launch returns (`lib/lock-holder.mjs`).
- **The planted "dead" lock.** The lock for `C-deadlock` names a pid chosen per platform (`plantedDeadPid`,
  `lib/lock-holder.mjs`). A live pid would have made `C-deadlock` live and failed the proof on the product.
  - **Linux and macOS:** a pid this script saw exit, where it used to name the literal `4242`. On this Linux host,
    pids wrapped during the runs (a lock pid of 1 389 followed pids near 30 000), so any small number can be a live
    process there.
  - **Windows:** still `4242`. No Windows pid is 4 242, since those are multiples of 4. A pid a child just gave back
    is not safe there, because Windows reissues a freed id soon, and the next launch's own processes could take it.
    The first round used the exited child on every platform, and that was corrected in review. Windows was not run.

Recorded and repaired in
[`sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md`](../../../defects/fixed/sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md).
On Linux as root under Xvfb, three consecutive runs passed all ten launches. They included `repair-all` (B and C
repaired, D untouched, then "Nothing was stale") and everything after it, which had never run on Linux.

**What it could not show:** Windows and macOS were not run (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*). The macOS spelling is measured only by the unit
test against `dataLayout`. *2026-10-20, the Windows ARM64 session's C2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `30d35b3c`): the Windows half ran. `sessions-proof` passed whole on its third run and wrote the machine identifier at `profile\local\rotaris\data\machine-id`, nowhere else under the profile, and its planted locks named this machine through it (repair-all named B-nolock and C-deadlock and left D-live). macOS stays unrun.*
