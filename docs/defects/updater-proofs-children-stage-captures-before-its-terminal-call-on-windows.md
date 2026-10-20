## updater-proof's second stage captures before its scripted `terminal` call on Windows

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-proofcwd` at `0d89e971` plus plan `loc1`'s `proof-cwd` working tree. Recorded, not repaired,
by that bundle (2026-10-20): its task changed only `updater-proof`'s first stage, and this stage is unchanged.

`updater-proof --skip-build` failed three of its 15 checks, twice: "the scripted run's terminal call wrote its shell's
environment … — no terminal-environment.txt; app exit 0", and the two checks that read that file. The first run was at a
CPU load of about 88 % with six Electron processes of another tree (`Rotaris-crw-wt-loc1-supervisor`) alive; the re-run
was alone, with no other Electron, at a load of 37 to 99 % from other agents' gates.

Stage 2 is a capture launch with `ROTARIS_CAPTURE_AFTER_MS=9000`. Its workspace's `agents.yaml` does not disable
`code_intelligence`, so the run's first turn waits for that server's tool discovery, which on this host runs the
`win32-x64` bundle under x64 emulation (OQ-401's reading). In the first run the session started at 13:57:30.660, "mcp:
discovery of 'code_intelligence' … listed 22 tool(s) in 7739 ms" and the surface came at 13:57:38.292, and the capture
exit came at 13:57:38.605, before the scripted `terminal` call. In the re-run the session started at 13:58:39.358, no
discovery line came at all, and the capture exit came at 13:58:47.299; the log then reads "the run host exited (0) while
code-intelligence-setup's setup was under way".

Not measured: whether the same stage passes at `origin/main` on this host, and how long the discovery takes on Linux,
where acceptance read this stage green. Two likely repairs, neither ruled here: the stage's workspace disables
`code_intelligence` (`mcp_servers: code_intelligence: { enabled: false }`, as `workspace-proof`'s fixture does), which it
does not need; or the capture waits for the terminal call's file rather than a fixed 9 s.

## Specs

None is contradicted: REQ-STARTUP-106 and REQ-STARTUP-147 are what the stage measures, and it reads nothing because the
run never reached its tool call inside the capture's fixed bound.

## Relevant files

- `apps/desktop/scripts/updater-proof.mjs`: stage 2, `ROTARIS_CAPTURE_AFTER_MS: '9000'`, and the workspace `agents.yaml`
  it writes.
- `.proof/updater-proof/children/app.log` (evidence, not committed): the timeline above.
