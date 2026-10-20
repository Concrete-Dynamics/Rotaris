## Two observe cases remove their junction with `rmSync`, which Node 24.11 refuses on Windows

Seen on Windows 11 x64 (build 26200), Node 24.11.0, at `c9ebc8cf`, in `pnpm check` and alone:
`packages/agent-tools/src/tools/observe-root.test.ts` ("a workspace whose two resolutions differ is walked …") and
`packages/agent-tools/src/tools/observe.test.ts` ("a sibling's write noted against the real path is left out when the root is
given through a symbolic link (fin36)") both failed in their cleanup with `Error: Path is a directory: true`.

Both make their alias with `symlinkSync(root, alias, 'junction')` on win32 and remove it with `rmSync(alias, { force: true })`.
Node 24.11's `rmSync` refuses a junction that way; `unlinkSync` and `rmdirSync` remove it and leave its target. The cases'
assertions had passed; only the cleanup failed. Measured outside the tests with a scratch junction: `rmSync` threw the same
message, `unlinkSync` and `rmdirSync` removed the junction and kept the target.

## Specs

None contradicted: a defect of the tests' cleanup, not of `observeReach`.

## Relevant files

- `packages/agent-tools/src/tools/observe-root.test.ts` — the `afterEach` that removed the alias.
- `packages/agent-tools/src/tools/observe.test.ts` — the `finally` that removed the link.

## Repaired — 2026-10-20

Both remove the alias with `unlinkSync`, which removes a POSIX symlink and a Windows junction alike; the `afterEach`
unlinks only when `lstatSync` finds the alias, as `force: true` had allowed for. Both files pass on Node 24.11.0.
