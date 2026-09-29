## `palette-proof` asks PowerShell for the host's input reading on every platform, so on Linux it fails in its modality scenario

`palette-proof`'s third scenario observes ADR-0048's application modality in two ways:

1. the application's own reading: `windows-at`, `BrowserWindow.isEnabled()` in main;
2. a reading from the operating system: the `os-input` capture seam runs `apps/desktop/scripts/os-input.ps1` through
   `powershell.exe` (`apps/desktop/src/main/capture/seams.ts`). That script moves the Win32 cursor, sends
   `mouse_event`/`keybd_event`, and reports `IsWindowEnabled` for the persona window's HWND.

The seam spawns `powershell.exe` on every platform. On Linux the spawn fails with `ENOENT`, each `os-input` step logs
`{"raw":"error: spawn powershell.exe ENOENT "}`, and the proof throws at its first host assertion ("the host reports
the persona window enabled while the palette is open") with nothing wrong in the product.

This is a **harness** defect of the platform-literal kind. It is not a product failure and not timing:

- The product's own reading is correct on Linux. The persona window was `enabled:true` at 8500 ms, before the palette.
  It was `enabled:false` at 11200 ms, with the palette open. It was `enabled:true` again at 15200 ms, after Escape.
  Main logged the pair `application modality on: 1 persona window(s) disabled` / `… off: 1 persona window(s) enabled`.
- Sections 1 and 2 (the palette and keyboard help) pass.
- The red reproduced identically on a lone re-run by the sweep and again here. It is deterministic, not a
  shared-host timing red.

The reading does not exist on this platform. X11 has no per-window "enabled" state for the host to report, and
`IsWindowEnabled` is a Win32 call. So `where` and the `personaEnabled` half of `click` do not apply on Linux. Delivering
a real click and real keystrokes through the X server (XTEST) would apply, and it would be the Linux form of the check
that a blocked window's content does not change. This harness has no X11 input driver, though. Without one, no real
input reaches the persona window on Linux, and "the content did not change" would be true because nothing was sent.

Measured 2026-09-28 as root under Xvfb on Linux, Node 24, from `fix-proofs-b2` (the sweep's report on `main` at
`392f681` said the same).

## Specs

None contradicted by the product. The proof stands for REQ-SHELL-049..057 and REQ-SHELL-022, with ADR-0048's
application modality. On Linux, the modality is measured by the application's own reading only. The host-input half
is Windows-only by construction.

## Relevant files

- `apps/desktop/scripts/palette-proof.mjs`: scenario 3's `os-input` assertions (`where`, `click`, and the content
  comparison under the blocked click).
- `apps/desktop/src/main/capture/seams.ts`: the `os-input` seam, which spawns `powershell.exe` unconditionally.
- `apps/desktop/scripts/os-input.ps1`: the Win32 driver.
- `AGENTS.md`: the proof's row.

Noticed 2026-09-28 from the proof sweep's red on Linux under R-062.

## Outcome

Repaired 2026-09-28 under R-062, in the proof only. The product and the capture seam are unchanged.
`apps/desktop/scripts/palette-proof.mjs` now sends `ROTARIS_CAPTURE_OS_INPUT` and `ROTARIS_CAPTURE_OS_INPUT_SCRIPT`
only when `process.platform === 'win32'`, and asserts the host's readings (`where` during and after, `click`'s
`personaEnabled`, and the unchanged content under the blocked click) only there. On any other platform,
`results.json` → `modality.hostInput` records `applicable: false`, the reason, and what is therefore not measured. It
also keeps the persona window's content readings, marked unasserted. Everything else still runs and is still asserted
on Linux:

- the application's own reading: enabled before the palette, disabled while it is open, enabled after Escape;
- the palette open and then closed at those instants;
- main's modality log pair;
- sections 1, 2, 4 and 5 unchanged.

The Windows path is textually the same assertions it was. It was not re-run here, because no Windows host was
available.

Verified: `palette-proof` green three times in a row under Xvfb on Linux as root, Node 24
(`xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/palette-proof.mjs --skip-build`, exit 0 each time,
`PART W PROOF PASSED`). Another agent's Electron proofs were running in a second worktree during runs 2 and 3.

**Still owed, and not something this repair could do:** the Linux form of the real-input check. That is an X11 driver
for the `os-input` seam (XTEST, for example `xdotool` under Xvfb) with a positive control, meaning a click that does
change the persona window while it is enabled. Without the control, "unchanged while disabled" cannot be told apart
from a click that missed. That is new harness surface, not a repair of this one.
