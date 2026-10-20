## part-j-proof's two-window launch names a window by a forward-slash suffix that never matches on Windows

The Windows ARM64 session's C5 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree,
Git Bash, at `51d85dd7`) ran `pnpm part-j-proof` five times. The one run that got past `pause` stopped at the two-window launch:

```
the two-window launch: no window matches "pair-b/workspace"; open: {"windows":[{"index":0,"workspace":"<…>\\part-j-proof\\pair-b\\workspace",…},{"index":1,"workspace":"<…>\\part-j-proof\\pair-a\\workspace",…}],…}
```

Both windows were open and the approval dialog over A was up; the proof names B by `d.useWindow('pair-b/workspace')`, a
suffix of the workspace path with a forward slash, and on Windows the path the driver compares against is written with
backslashes, so no window matches. The pair stage's readings (the idle window's close asking nothing, the running window's
close asking once, the PD-SHELL-009 log line, `approval_withdrawn` without `approval_denied`, the held-back notice) were
therefore not taken on Windows.

## Specs

None in the product: the driver answered with both windows, and the product's state was the one the stage wants. The
proof's suffix is its own spelling.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — the pair stage's `useWindow('pair-b/workspace')` (and any other suffix with `/`).
- `apps/desktop/src/main/index.ts` — the seam's window lookup (`candidate.workspace.toLowerCase().endsWith(which.toLowerCase())`) compares the name as a suffix of the
  workspace path as the platform writes it.
