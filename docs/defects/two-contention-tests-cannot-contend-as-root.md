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
