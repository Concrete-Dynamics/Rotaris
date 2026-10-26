# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — The unit suite on Windows 11 ARM64 — 2026-10-15: the claim's Windows spellings ran, the pipe's order cases did not

Part 16 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## The unit suite on Windows 11 ARM64 — 2026-10-15: the claim's Windows spellings ran, the pipe's order cases did not

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, at `b9e30052` ([first-executions](../../first-executions.md),
the row of that date; windows-arm64 only, OQ-400).* `instance.test.ts` passed 18 and skipped 6, every skip behind its
`posixHost` gate (the unix socket's directories and reclaim); the successor hand-over cases and the candidate list ran here.
`instance-order.test.ts` skipped all 3 (`it.skipIf(process.platform === 'win32')`), so the named pipe's claim, loser and
reclaim order has no unit case on Windows yet; the session's C6 adds the win32 counterparts and reports them here.
