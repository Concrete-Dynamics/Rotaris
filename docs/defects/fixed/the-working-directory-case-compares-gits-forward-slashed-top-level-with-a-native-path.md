## The working-directory case compares Git's forward-slashed top level with a native path

**Repaired 2026-10-15** (the owner's ruling that day for the Windows ARM64 session: repair the test-side defects). The case
resolves Git's answer with the host's `path.resolve` before comparing it, green on Windows; the helper is unchanged.

Found 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, at `7c9182c8`, the day the helper landed
from Linux: `working-directory.test.ts`'s "the checkout's own `apps/desktop`, where the proof ran these launches, is in the
repository" expects `enclosingRepository(app)` to be `realpathSync(repo)`. `enclosingRepository` returns
`git rev-parse --show-toplevel`, which Git for Windows prints with forward slashes (`C:/dev/…`), and `realpathSync` gives
`C:\dev\…`, so the case is red on Windows with the helper right: the helper reads its answer only as present or absent, and
names it in a message.

## Specs

None: an expectation spelled for one host.

## Relevant files

- `apps/desktop/scripts/lib/working-directory.test.ts` — the comparison.
- `apps/desktop/scripts/lib/working-directory.mjs` — `enclosingRepository`.
