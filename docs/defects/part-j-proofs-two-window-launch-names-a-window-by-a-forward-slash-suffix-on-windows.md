## `part-j-proof`'s two-window launch names a window by a forward-slash suffix, on Windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-supervisor-base` at `0d89e971`. Record-only: not repaired by the plan that saw it (loc1).

The two-window launch drives the second window with `d.useWindow('pair-b/workspace')`. The driver resolves a main window by
a suffix of its workspace path, and on Windows that path is written with backslashes, so the suffix never matches:

```
no window matches "pair-b/workspace"; open: {"windows":[{"index":0,"workspace":"C:\\dev\\…\\part-j-proof\\pair-b\\workspace","wcId":3},{"index":1,"workspace":"C:\\dev\\…\\part-j-proof\\pair-a\\workspace","wcId":1}],…}
```

(2026-10-20, 15:23 UTC, CPU 97 % falling to 52 %, 20 to 26 Electron processes of other trees). The same file already reads the
store's `workspace_root` with both separators (`endsWith('pair-b/workspace') || endsWith('pair-b\\workspace')`); the
`useWindow` calls do not.

Seen again by R-091's bundle D3 (2026-11-04), in `C:/dev/Rotaris-wt-hrd1-fencehardeni` at `1d663de6` plus the bundle's two commits (Windows 11 ARM64, Node 26.13.0, Electron 44.3.0; one proof at a time, no other tree's Electron running, CPU 20 % before the launch): "the two-window launch: no window matches \"pair-b/workspace\"", the open window's workspace `…\part-j-proof\pair-b\workspace`. The bundle changes only the fence and the file tools' write.

## Specs

None of the product's: the proof's window name, or the driver's suffix match, is separator-bound.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — `d.useWindow('pair-b/workspace')` (two calls).
- `apps/desktop/src/main/driver.ts` — `resolve` / `deps.window(which)`, the workspace-suffix match.
