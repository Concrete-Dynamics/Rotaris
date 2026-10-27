# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — The first execution's proof on Linux: the stale-session repair and the lock its live launch left — 2026-09-28 (R-062)

Part 9 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## The first execution's proof on Linux: the stale-session repair and the lock its live launch left — 2026-09-28 (R-062)

`pnpm checkpoint-proof` failed once in the Linux sweep of 2026-09-28, on tree `392f681`. It stopped at step (d),
`repaired`, with "the stale session reads running, not interrupted", and passed on a lone re-run. **The repair of
REQ-GIT-094 behaved as written.** The session's lock named the `live` launch's run host. On that tree, main still
left before its run host, and Electron's teardown of the run host took up to 1.8 s. The `repaired` launch was
claimed 0.22 s after main's exit, while the holder's pid still answered, so the listing read the session as live
(REQ-GIT-093). A live session is not stale, and nothing was repaired. That window is the defect recorded and
repaired in `459e7c8`: main is now gone only after its run host
([`a-session-lock-outlives-…`](../../../defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md)).
On `main` the proof passed at once.

What was wrong in this record's proof is that it named the wrong mechanism. Its header promised "a
persisted-running session with a dead lock", but step (c) never checked that the lock was dead. Step (c) now probes
the lock's pid the moment the `live` launch returns (`lib/lock-holder.mjs`). A holder still alive fails there,
naming REQ-SESSION-047/056. Step (d)'s assertions are unchanged. Recorded and repaired in
[`checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md`](../../../defects/fixed/checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md).

In three consecutive runs on Linux as root under Xvfb, the pid was dead at the first probe each time, and the
repair was logged 1.48 to 1.81 s after the previous main's exit. All twelve scenarios passed.

**What it could not show:** the check firing on the built app. It would need the window `459e7c8` closed, and that
was not reopened; the failing path is pinned by `lock-holder.test.ts` only. Windows and macOS were not run (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

*On Windows, 2026-10-20* (the Windows ARM64 session's C2; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `30d35b3c`). In three runs the `live` launch's lock holder was dead at the first probe each time and `repaired` read `interrupted`, lock released, notice raised, the repair logged 1.45–2.09 s after the `live` launch's last log line (the Linux figure counts from main's exit, which that line precedes by a few milliseconds). No run passed whole: two stopped at `loaded-restore`'s 15 000 ms planting guard (planted at 22 622 and 17 432 ms, the refusal itself in the log both times) and one at `isolated-restore`, whose 6 617 ms confirm-time preview left the restore running when the capture ended ([`checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md`](../../../defects/checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md)). The check firing on the built app is still not shown. `hookCapture` is skipped on Windows until C3.
