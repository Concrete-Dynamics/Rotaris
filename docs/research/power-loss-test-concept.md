# Power-loss test concept (OQ-12)

**Prepared:** 2026-10-24, owner request T7. **Status:** a concept, not a ruling. It rules nothing in
[OQ-12](../architecture/open-questions.md#oq-12), whose wording is closed and whose measurement stays owed; it
sorts what the harness of [`spikes/power-loss.md`](../architecture/spikes/power-loss.md) already does, what an
agent can add on a Linux host or a runner, and what only the owner can do.

## 1. The scenario

The application is writing when power goes, or the kernel dies with the disk still powered. In flight at that
instant may be: a commit to the workspace's durable session store at `synchronous = NORMAL` (the publish path),
the `FULL` commit of a save carrying a terminal status or an explicit flush (`StoreDal.durableTransaction()`,
ADR-0058), a document replace (`agents.yaml`, `secrets.yaml`, the desktop preference store, `summary.md`;
ADR-0004 shape 1: stage, write, `fsync` the staged file, rename, no directory `fsync`), a backup being packed
(`VACUUM INTO`, archive, rename; `packages/store/src/backup.ts`), or a restore between its two renames.

## 2. Invariants after the reboot

[`REQ-SESSION-034`](../spec/07-sessions-persistence.md) is the product's single definition, in three levels:

| # | Invariant | Owed by |
|---|---|---|
| I1 | The store opens (`openStore`: WAL recovery, the write probe), `integrity_check` = `ok`, and no session is observable from two saves or half of one | `REQ-SESSION-034` level 1, `REQ-SESSION-028`, `REQ-EVENTS-029` |
| I2 | Every terminal or explicit-flush commit that **returned** is present | level 2, `REQ-SESSION-094`, ADR-0058 "Why the decision stands anyway" |
| I3 | Ordinary commits after the last I2 commit may be missing, but only as a suffix: gap-free, each whole. *How many, and how many ms*, is the figure OQ-12 owes | level 3, ADR-0009 |
| I4 | Each replaced file is the previous or the new whole version, never absent, empty or torn; no staging file is left as an artifact | `REQ-SESSION-033`, `REQ-CONFIG-027`, `REQ-CONFIG-216`, `REQ-LIBRARY-043` |
| I5 | The theme choice made before the cut is in force | `REQ-SHELL-131` (it says "power loss" for a file, see §5) |
| I6 | A backup artifact **reported complete** is whole and restorable; a backup cut mid-way leaves no file at the destination a restore would accept | level 2, `REQ-SESSION-201` |
| I7 | A restore cut anywhere leaves either the old store or the restored one at the next open, never an empty one | ADR-0058, OQ-266 |

Level 2 is "subject to the storage device honouring the flushes the product issues": I2 and I6 can only fail on
an honest device if a flush was **not issued**, and the test cannot tell a dishonest device from software.

## 3. What an agent can run, and what each one proves

| Check | Where | Proves | Does not prove |
|---|---|---|---|
| `kill -9` / `taskkill /F` mid-write: the harness's `kill` phase, [`restore-kill-proof`](../proofs/restore-kill-proof.md) (I7) | any host; the harness's kill is `taskkill` only and needs a `SIGKILL` branch on Linux | **level 1 only** (I1, I4, I7 against process death); already ten of ten on Windows | anything about power: the page cache survives a process kill |
| The verifier's dry run (WAL tail truncated at a recorded `FULL`) | any host, in the harness | the verifier sees a loss; SQLite accepts a clean tail cut | the platform; it models the best case, not reordering or a torn middle |
| A crash-simulating VFS (SQLite's own [crash testing](https://www.sqlite.org/testing.html) drops and reorders unsynced writes) | any host, test build | SQLite + our settings under a modelled loss | the kernel, the file system or the device; SQLite already tests itself this way |
| `dm-log-writes` replay to every flush point, or `dm-flakey` `drop_writes` ([kernel docs](https://docs.kernel.org/admin-guide/device-mapper/log-writes.html)), on ext4/xfs | Linux, root and device-mapper; a CI runner or VM | **the software half of level 2 on Linux**: that our writes plus the file system issue the flushes I2, I4 and I6 need, including whether the missing directory `fsync` matters | the device's honesty; Windows/NTFS |
| VM hard reset (`system_reset`) or `echo c > /proc/sysrq-trigger` in a guest, virtual disk with flushes honoured (`cache=none`/`directsync`, never `unsafe`) | Linux VM with KVM | an OS-cache loss end to end, the analogue of the spike's **crash** fault | real hardware; a host cache can hide or invent loss |

This dev host (2026-10-24) has no `/dev/kvm`, no `qemu` and no `dmsetup`; the two bottom rows need a runner or a
machine set up for them. A Linux run produces no artifact, so IC-3 does not forbid it, but whether it counts as
Linux's per-platform measurement OQ-12 tracks is the orchestrator's to rule.

## 4. What only the owner can do

The spike's §4, unchanged: on the owner's Windows notebook (`ASUS-RTX`, NVMe `CT1000P310SSD8`, NTFS), start
`ROTARIS_POWER_LOSS_PHASE=prepare`, wait ≥ 30 s, then **(a)** hold the power button (on battery the cut is the
button, not the plug), and separately **(b)** a kernel crash (`CrashOnCtrlScroll` or NotMyFault), then `verify`
with `ROTARIS_POWER_LOSS_FAULT=power|crash` and fill the table. Only (a) on real hardware tests the device's
flush honesty; (b) against (a) separates the software claim from the device. A desktop with a removable plug
and a second drive model would widen the evidence. macOS and Linux hardware runs wait on hosts (IC-3).

## 5. Gaps this concept found, for the record

- `takeBackup` issues **no flush** on the artifact before reporting it complete (`VACUUM INTO` does not `fsync`
  its output, [SQLite](https://www.sqlite.org/lang_vacuum.html#vacuuminto); the archive is renamed unflushed), so
  I6's condition is vacuous today:
  [`a-completed-backup-artifact-is-never-flushed.md`](../defects/a-completed-backup-artifact-is-never-flushed.md).
  The harness does not exercise the backup at all; it would need an I6 phase.
- `REQ-SHELL-131` asks power-loss survival of a file written by ADR-0004's shape, while ADR-0004 rule 2 says no
  file requirement asks for durability. Raised here for the orchestrator, not ruled.
