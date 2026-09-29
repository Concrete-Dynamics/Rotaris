## Two contention tests cannot contend as root

Off Windows, two tests simulate a replacement that cannot land by making the target's parent directory read-only
(`chmod 0o555`) and expect the retry ladder to run out. Root is not subject to directory permissions, so the rename
succeeds on the first attempt and both tests fail: the replacement "exhausts the ladder" and returns `ok: true`.
`pnpm check` is therefore red in any container that runs as root, whatever the change under test.

Found 2026-09-27 running `pnpm check` as root in a cloud container. Both fail identically on the unchanged base.

## Specs

None contradicted by the product. The tests stand for `REQ-TRACE-061` / `REQ-TRACE-502` (OQ-41) and
`REQ-EVENTS-145`, and as root they cannot decide either requirement.

## Relevant files

- `tools/symbol-artifact/replace.test.ts`: `refuse`, the write-denied parent, used by "a contended replacement
  exhausts the ladder …".
- `packages/engine/src/session-actions.test.ts`: the `0o555` parent in "A9 / REQ-EVENTS-145 / REQ-TRACE-061: a
  destination that cannot be replaced exhausts the ladder …".

## Repaired — 2026-09-28 under R-062

**This note and `two-replacement-ladder-tests-fail-when-run-as-root.md` describe one defect** — the same two
tests, recorded twice — and it is repaired once. Off Windows the refusal is now staged in a way that holds for
the uid running the test. An **unprivileged** user still meets the pre-existing `chmod 0o555` refusal on the
parent, which that uid respects (the staging write is denied, `EACCES`, and the ladder retries it) — this is the
mechanism that passed before the defect, so the test still passes as an unprivileged user, which is the case
that cannot be exercised on this root-only host and is settled by this reasoning. **Root** ignores directory
mode bits, so `chmod 0o555` never refused it; the target file is now marked **immutable** (`chattr +i` on Linux,
`chflags uchg` on macOS), which even root cannot rename over — the rename fails with `EPERM`, the same transient
class the ladder retries, so the REAL ladder runs to its five attempts and the previous file is retained byte
for byte on the real filesystem. Setting the immutable flag needs exactly the privilege that ignores the mode
bits, so an unprivileged user cannot and need not set it and falls back to the mode-bit refusal. Neither test
skips, `skipIf(root)`s, nor loosens its assertion.

Pinned by `tools/symbol-artifact/replace.test.ts` ("a contended replacement exhausts the ladder …") and
`packages/engine/src/session-actions.test.ts` ("A9 / REQ-EVENTS-145 / REQ-TRACE-061 …"), both green as root
under Node 24 and unchanged in what they decide (REQ-TRACE-061/502 (OQ-41), REQ-EVENTS-145).
