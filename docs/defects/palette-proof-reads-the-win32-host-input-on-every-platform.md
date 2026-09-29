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
