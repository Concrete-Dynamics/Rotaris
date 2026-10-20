## code-intel-proof's window sampler counts another tree's windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-rename` at `ec169990`. Recorded by loc1's `rename` bundle (`loc1-rename`); not repaired here.

`node apps/desktop/scripts/code-intel-proof.mjs --skip-build` failed at its first launch, 59 s in, with "branch (dev): a window
appeared: electron#6252 handle 6425326 "Rotaris"", at a CPU load of 100 % beside seventeen other trees' Electron processes on the
shared desktop (six agents of one plan running proofs at once). The branch launch is a token launch, which opens no window. The
sampler that judges it (`branch()` in `apps/desktop/scripts/code-intel-proof.mjs`) lists, every 300 ms through `powershell.exe`,
every process named `electron`, `Rotaris`, `python`, `conhost` or `node` **on the machine** whose start time is after the launch,
and fails the launch on any of them holding a main window. It does not ask whether the process descends from the launch it
judges, so another tree's app window opened during the branch's few seconds — here a proof's "Rotaris" window, process 6252, gone
by the time it could be looked up — reads as the branch having opened one. The same launch alone is the instrument working; with
other trees launching apps beside it, ADR-0035's consequence 1 can go red for a window the product never opened.

## Specs

None contradicted by the product: the proof's instrument judges processes it did not start. ADR-0035's consequence 1 (the branch
opens no window) is what it measures.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs` — `branch()`, the `Get-Process … | Where-Object { $_.StartTime -gt $since }` sampler
  and `windowed`, and launch 1's `dev.windowed.length !== 0` refusal.
