## `part-j-proof`'s `pause` launch is refused EPERM opening its workspace store, on Windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-supervisor` at `603dae9c`. Record-only: not repaired by the plan that saw it (loc1).

Twice on 2026-10-20 (14:22 and 14:59 UTC, CPU 48 % to 62 %, 6 to 13 Electron processes of other trees) the `pause` launch, the
fourth of the suite, opened its window, and `workspace.open` was refused:

```
workspace.open refused: {"kind":"refused","code":"request.failed","headline":"Error: EPERM, Permission denied: \\?\C:\dev\Rotaris-crw-wt-loc1-supervisor\.proof\part-j-proof\pause\local\rotaris\data\workspaces\.94f3ad6da5c4dbdcd21abbe7448d3940 …"}
```

so "run refused before start: no workspace is open", no store was made under `pause/local`, and the proof stopped at
"expected one workspace database below …\pause\local; found 0". The three launches before it (`queue`, `steer`,
`steer-early`) opened their stores in the same tree. On the base build `0d89e971` the same launch passed once (15:23 UTC), so
the refusal is intermittent; the dot-prefixed directory is the store's staging place, and EPERM on Windows is what a rename
or removal meets while another handle (an indexer, a scanner, a process of the launch before) holds the directory.

## Specs

None named here: a workspace opens with its store, and whether a transient Windows file lock refusing that open is the
product's defect or the proof host's is left to the Windows session.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — the `pause` launch (`scenario('pause', [])`).
- The workspace store's first creation under `<local>/rotaris/data/workspaces/` (the workspace service's open).
