# Spike — the cached launch of the Windows `onefile` portable — 16. Reproducing this

Part 16 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 16. Reproducing this

Harness, raw data and logs are in the session scratchpad under `…\scratchpad\cpl`:

- `stub/src/main.rs` — the launcher; `stub/src/checkbench.rs` — the version-check benchmark of §6;
  `stub/src/token.rs` is generated per build.
- `mkartifact.js` — builds the archive, computes the token, invokes `cargo build --release`, appends and
  writes the footer.
- `app/` — the application under test (spike 17's probe with the extended report) and its
  `electron-builder.yml` (`dir` target).
- `runner.js` — spawn, loopback-socket timing, cold-cache control, damage injection, reporting;
  `pressure.js` — spike 17's cache drop, copied unmodified; `summarise.js`, `summarise2.js`.
- `renametest.js` (§9.1), `racetest.js` (§10.5), `snapdir.js` (§10.1), `rmbench.js` (§8.2),
  `shabench.js` (§6), `deny.ps1` (§10.2).
- `runs/` — `v2.jsonl` (headline, corrected launcher), `main.jsonl` (replicate), `onedir.jsonl`,
  `fresh.jsonl`, `threads.jsonl`, `damage2.jsonl`, `damage3.jsonl`, `version.jsonl`, `ro.jsonl`,
  `clauseA.jsonl`, `checkbench-warm.jsonl`, `checkbench-cold.jsonl`, plus `damage.jsonl` and
  `repair.jsonl`, which are the discarded first sweep and the housekeeping runs, retained but not
  reported.

None of it is product code and none of it was written into this repository. The preparation root created
under `%LOCALAPPDATA%\rotaris\` and the multi-hundred-megabyte intermediate artifacts were deleted at the
end of the spike.
