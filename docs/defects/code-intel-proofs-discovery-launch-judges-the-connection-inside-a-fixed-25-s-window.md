## code-intel-proof's discovery launch judges the connection inside a fixed 25 s window

`code-intel-proof`'s second launch (`discovery`, which also serves launch 3) reads the run's connected line and its binding probe
(`hook code_intelligence:ok`) from a launch captured at a fixed offset, `ROTARIS_CAPTURE_AFTER_MS: '25000'`. The run cannot connect
the server for its session before the run start's discovery has listed the server's tools, so the window holds both: the
discovery's launch and `tools/list`, then the session's own launch, `initialize` and the probe. A host that needs more than 25 s for
the two fails the launch with "discovery: the binding probe did not succeed: (no connected line)", which names the probe, while
the product had only not finished yet.

Seen 2026-10-20 by loc1's `rename` bundle (`loc1-rename`) on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64, the emulated
`win32-x64` bundle (OQ-401), `C:/dev/Rotaris-crw-wt-loc1-rename` at `ec169990`, twice, at a CPU load of 99 to 100 % beside eleven
to seventeen other trees' Electron processes: the discovery listed 22 tools in 23.9 s and in 15.6 s, the session's server was
launched right after, and the capture came 8 s later with no connected line. Re-run in the whole proof at a load of 79 % beside
eight other trees' Electron, the same launch passed (discovery 7.5 s, connect 11.3 s). Not repaired here.

## Specs

None contradicted by the product: REQ-MCP-071's probe ran and answered whenever the launch waited for it. The proof's fixed
offset is the shape `checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns` records for two other
proofs; the later launches of this proof wait for the run's result (`ROTARIS_CAPTURE_WAIT: 'result'`) instead.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs` — launch 2's `ROTARIS_CAPTURE_AFTER_MS: '25000'` and its `connected` refusal.
