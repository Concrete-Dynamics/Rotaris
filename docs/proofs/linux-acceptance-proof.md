# `linux-acceptance-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/linux-acceptance-proof.mjs`](../../apps/desktop/scripts/linux-acceptance-proof.mjs).

The Linux AppImage against three of the four acceptance criteria of
[ADR-0066](../architecture/adr/0066-the-linux-artifact-is-built-on-a-developer-host.md), on the host it runs on
([R-104](../product/requests.md#r-104)):

- **AC-1** — the image is launched unextracted, and the report carries a reading of the host beside the launch:
  whether the loader lists `libfuse.so.2` and whether `dpkg` has ever seen `libfuse2` or `libfuse2t64`. Only a host
  that reads "never had it" discharges AC-1; anywhere else the proof says the launch does not.
- **AC-2** — the time from the spawn to the application's own "main window 1 shown" line, against REQ-STARTUP-155's
  five seconds.
- **AC-4** — a second launch on the same account exits 0 without claiming an instance, and the first logs the
  hand-over (REQ-STARTUP-164).

Every launch runs against a scratch profile under `.proof/linux-acceptance-proof/` and through `spawnBounded`. A
desktop's AppImage integrator is bypassed (`APPIMAGELAUNCHER_DISABLE=1`): behind one, a launch waits on a dialog. The
first instance is ended at its bound by design. AC-3 is `pnpm package`'s own and is not measured here.

It needs a built AppImage: `pnpm package` on a Linux host writes one under `apps/desktop/release/`. CI's
`package (linux-x86_64, development)` job runs it on Ubuntu 24.04 and prints the report on the run's page.
