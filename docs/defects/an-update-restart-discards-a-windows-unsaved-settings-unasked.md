## An update restart discards a window's unsaved settings unasked

`Restart now` on the `Update installed` notice, and `Update now` / `Try again` on the installer flavour, close every main window
(`closeWindows` → `mainWindows.dispose()`), the restart once the successor has the record and the installer 1,200 ms after its
hand-off. Neither asks REQ-SHELL-124's Save/Discard/Cancel of any window: `apps/desktop/src/main/updater/updater.ts` has no
`confirmUnsaved` dependency and no outcome for a declined guard, `apps/desktop/src/main/main-windows.ts` has no helper that asks
several windows in turn, and the renderer's `guard()` (`apps/desktop/src/renderer/main.tsx`) replaces an open question rather
than joining it, so a second asking while the dialog is open would strand the first. So a person who clicks `Restart now` with
Settings edits pending loses them with no word.

OQ-311 was ruled 2026-10-14 by the consortium under R-072, with no directive: these clicks are user-initiated closes, each asks
every open main window's unsaved-settings guard one window at a time, at the click (ahead of OQ-86's active-run confirmation)
and again immediately before the installer or the successor starts; a Cancel, or a Save that fails, starts nothing and leaves
the notice as it was; the portable's in-place apply and the installer's auto-close ask nothing. Confirmed unbuilt on
`fin46-accept1-9` (base `907415e`): `git grep -n "confirmUnsaved\|UPDATE_DECLINED_UNSAVED" -- apps/` finds nothing.

Found by fin46's acceptance round 1 (finding B1), recorded 2026-10-14 by fin46 (`fin46-accept1-9`).

## Specs

- `REQ-SHELL-119` guard (1) — a user-initiated close with unsaved settings raises REQ-SHELL-124's dialog; OQ-311 rules these
  update clicks user-initiated.
- `REQ-SHELL-124` — Save (default), Discard, Cancel; Cancel or a failed Save aborts.
- `REQ-CONFIG-287` — the guard on a user-initiated close only; the auto-close stays programmatic.
- OQ-86 (REQ-STARTUP-046) — the active-run confirmation the settings guard is asked ahead of.

## Relevant files

- `apps/desktop/src/main/updater/updater.ts` — `restart`, `install`, `confirmAtHandOff`, `doRestart`, `doInstall`.
- `apps/desktop/src/main/main-windows.ts` — `guardClose`, `askRendererGuard`; no helper asking every window in turn.
- `apps/desktop/src/main/index.ts` — `createUpdater`'s dependencies.
- `apps/desktop/src/renderer/main.tsx` — `useConfiguration`'s `guard`.
