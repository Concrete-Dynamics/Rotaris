# ADR-0054 — Packaging, the four artifacts, and self-update — First execution — 2026-09-04, the installer

Part 10 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## First execution — 2026-09-04, the installer

*Recorded under GD-10; `../spikes/native-load-proof.md`.* `electron-builder` produced
`Rotaris-0.1.0-windows-x64-setup.exe` (125,246,346 B) and its block map from a `win-unpacked` tree of 442 MB
(`app.asar` 68.5 MB), the name rendering from `tools/release-naming` and asserted equal by the build
(`REQ-STARTUP-031`). The packaged application shows the product version, not Electron's. **Not built:** the
portable and its launcher stub (SR-7, alternative P4) — the second build technology this record carries is
still on paper. **Not done:** signing (no certificate; `signtool` finds no signature on any artifact), the
release gate, an icon. The installer was produced, not installed.
