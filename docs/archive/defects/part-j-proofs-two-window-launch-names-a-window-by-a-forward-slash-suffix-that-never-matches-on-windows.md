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

**The same defect, recorded twice.** Plan loc1 met it independently (2026-10-20, 15:23 UTC,
`C:/dev/Rotaris-crw-wt-loc1-supervisor-base` at `0d89e971`; CPU 97 % falling to 52 %, 20 to 26 Electron processes of other
trees) and recorded it as `part-j-proofs-two-window-launch-names-a-window-by-a-forward-slash-suffix-on-windows.md`, with the
same driver answer ("no window matches \"pair-b/workspace\"", the open windows' workspaces written with backslashes). R-091's
bundle D3 added a sighting there on 2026-11-04 (`C:/dev/Rotaris-wt-hrd1-fencehardeni` at `1d663de6` plus its two commits;
Windows 11 ARM64, Node 26.13.0, Electron 44.3.0; CPU 20 % before the launch, no other tree's Electron running). That note
also observed that the same file already read the store's `workspace_root` with both separators (`endsWith('pair-b/workspace')
|| endsWith('pair-b\\workspace')`) while the `useWindow` calls did not. Acceptance plan hrda's round 1 found both notes open on
the one defect (finding AF-17), and its bundle `hrda-accept1-6` folded that note into this one and removed it (one defect, one
note).

## Specs

None in the product: the driver answered with both windows, and the product's state was the one the stage wants. The
proof's suffix is its own spelling.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — the pair stage's `useWindow('pair-b/workspace')` (twice) and
  `useWindow('pair-a/workspace')` (once); no other proof names a window by a suffix with `/`.
- `apps/desktop/src/main/index.ts` — the seam's window lookup (`candidate.workspace.toLowerCase().endsWith(which.toLowerCase())`) compares the name as a suffix of the
  workspace path as the platform writes it.

## Outcome — repaired 2026-11-04 (acceptance plan hrda, bundle `hrda-accept1-6`, finding AF-17)

Confirmed first on the bundle's branch (Windows 11 ARM64, Node 26.13.0, `origin/main` `a10ad853` plus the bundle's first
commit, after `pnpm build`; CPU 100 %, `C:/dev/Rotaris-wt-accept`'s Electron running): the full `part-j-proof --skip-build`
never reached the pair stage in six runs on this loaded host (each stopped earlier, on readings recorded in
`docs/defects/part-j-proofs-queue-launch-types-its-queued-prompt-at-a-fixed-appointment-a-slow-run-start-can-follow.md` and
`docs/defects/part-j-proofs-pause-launch-is-refused-eperm-opening-its-workspace-store-on-windows.md`), so the stage was run alone
from a scratch copy of the script (its setup, lines 1 to 129, and the 5c block whole; removed after). From the unchanged
script it read, at 21:06 UTC:

```
the two-window launch: no window matches "pair-b/workspace"; open: {"windows":[{"index":0,"workspace":"C:\\dev\\Rotaris-wt-hrda-a1-6\\.proof\\part-j-proof\\pair-b\\workspace","wcId":3},{"index":1,"workspace":"C:\\dev\\Rotaris-wt-hrda-a1-6\\.proof\\part-j-proof\\pair-a\\workspace","wcId":1}],…}
```

The three `useWindow` names are now `workspaceSuffix(['pair-b', 'workspace'])` and `workspaceSuffix(['pair-a', 'workspace'])`
(`apps/desktop/scripts/lib/window-suffix.mjs`), joined with the separator the platform writes the workspace path with, which is
what the driver seam compares against. The seam is unchanged. Pinned by `apps/desktop/scripts/lib/window-suffix.test.ts`
(the backslash name matches the Windows path under the seam's own case-blind suffix rule, the forward-slash name it replaced
does not, and POSIX keeps the slash).

Shown by the same scratch stage from the changed script, at 21:05 UTC (CPU 100 %, the same tree's Electron alive): exit 0, and
every pair-stage reading taken on Windows for the first time: the idle window's close asked nothing and left A's run active; B's
launch dialog read isolation unchecked and enabled and B's run ended `completed` with no worktree (PD-GIT-001); A's close asked
"Close this window while a run is active?" once, answered Yes; A's session rested `paused`, `user_cancelled`, its iteration open
by `stop`, with `approval_withdrawn` and no `approval_denied`; its outcome "The run came to rest at the user's request." held
back from the window that stayed; and the last window's quit exited 0. Reported into
[PD-SHELL-009](../../product/directives/pd-shell-009.md) and the first-executions register.
