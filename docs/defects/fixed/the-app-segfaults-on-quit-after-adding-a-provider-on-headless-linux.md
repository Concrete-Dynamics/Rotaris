## The app segfaults on quit after adding a provider, on headless Linux

Every `pnpm live-run` sign-in launch in a Linux container (Xvfb, running as root with
`ELECTRON_DISABLE_SANDBOX=1`, Electron 44.1.1) ended with `SIGSEGV`. Each one did its work first:
- the provider dialog was filled and pressed;
- `providers: Added Katalyst vLLM; discovered 1 model(s).`;
- the credential file was written;
- the screenshot was captured.

The main process then crashed while shutting down: `Received signal 11 SEGV_MAPERR 000000000018`, a null
dereference inside Electron's native code, reached from the GLib event loop. Five launches crashed alike, with and
without a D-Bus session bus (`dbus-run-session`). The live run treats a non-zero exit as a failed scenario, so no
scenario after sign-in ran. The overview proof's launches exit 0 in the same container, so the crash follows
something sign-in does, most likely the native modal provider dialog (`_NET_WM_STATE_MODAL` is logged just before)
or the credential protector.

Observed 2026-09-24, run packs `.live-run/runs/2026-09-24T00-4*` and `…T00-5*` (the `…T00-51-35-777Z` pack has the
stack, taken with `ELECTRON_ENABLE_STACK_DUMPING=1`). Not reproduced on Windows, where the live run has passed
before. No Linux release artifact exists yet (IC-3), so no user is exposed today.

## Specs

None contradicted on a supported platform. `REQ-PROVIDER-014`'s credential write completed before the crash.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: `launch`, which fails a scenario on a non-zero exit.
- `apps/desktop/src/main/index.ts`: the credential store and the provider dialog's owner.
- `packages/providers/src/credentials/protect.ts`: the protector used on this platform.

**Windows confirmed, 2026-09-24.** The owner reports that the live run works on Windows against this build (`main`
at `d9ba3ef` or later), so the crash is specific to the headless Linux container. The note stays open until a Linux
build host exists (IC-3) to reproduce or clear it there.

## Repaired — 2026-09-24

**The cause, measured.** Electron on Linux segfaults when `app.exit` runs while a modal child window is still open. An
eleven-line Electron app shows it with a parent window, one `modal: true` child and then `app.exit(0)`:
- with the modal child open, it ends `SIGSEGV` (exit 139) every time;
- with no child it exits 0, and through `app.quit()` it exits 0;
- with the child destroyed in the same tick as the exit it still crashes;
- with the child destroyed, its `closed` awaited and the exit run on the next turn, it exits 0.

The live run's sign-in hit this because the capture seam exits over the still-open provider dialog. The owner's own
quit goes through `app.quit()`, so a person using the app on Linux never hit it.

**The repair.** `exitAfterChildWindows` (`apps/desktop/src/main/exit.ts`) destroys every child window, waits for each
`closed` event (bounded at 2 s, so a window that never reports cannot hold the process), then calls `app.exit` on the
next turn. Main's capture exit and the driver's `quit` both go through it (`exitCleanly`).

Evidence:
- `exit.test.ts`, three cases: the order of destroy, closed and exit; no children; the bound.
- The built app, with the provider dialog left open through the capture seam: the old code ended `SIGSEGV` twice
  out of two, and the repaired build exited 0 three times out of three.
- `pnpm overview-proof` and `pnpm driver-proof` (14 passed) green on the repaired build under Xvfb.
