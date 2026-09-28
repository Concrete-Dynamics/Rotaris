## `sandbox-proof` asserts the Windows verdict's six literals on every platform, so on Linux it fails at its first check

`apps/desktop/scripts/sandbox-proof.mjs`'s first scenario reads the run host's one `confinement:` log line and requires
it to carry all six of REQ-SANDBOX-073's literals at once — `native Windows`, `Seatbelt`, `bubblewrap`,
`sudo apt-get install bubblewrap`, `runtime.sandbox_mode`, `WSL2` — which is the verdict the product gives on a host
outside the platform set (win32: "no OS-level confinement is available on native Windows", both supported pairings and
both courses named). On Linux without `bwrap` the product's verdict is a different, correct sentence — `confinement:
unavailable — bubblewrap is the confinement mechanism on this host, but its launcher bwrap was not found on PATH.
Install it with sudo apt-get install bubblewrap or sudo dnf install bubblewrap.` — which names one mechanism and one
remedy and carries neither `native Windows` nor `Seatbelt` nor `WSL2`. The proof throws at `native Windows` and its
later scenarios (the refusal under `sandbox_mode: required`, the autonomous fallback, the per-tool confinement rows)
never run. `AGENTS.md` says of this proof that "`win32` is outside the platform set; read what it says it cannot
prove" — true of what it measures on Windows, and silent about the proof being runnable there alone.

Measured 2026-09-28 as root under Xvfb on Linux, Node 24, on `fix-proofs-linux` (`hostSwitches` let it launch). The
red is the proof's expectation, not the product's: REQ-SANDBOX-065/066/073 are answered for the Linux host as written.

## Specs

None contradicted by the product. The proof cannot measure ADR-0022 on the one platform where confinement exists
(bubblewrap on Linux) until its verdict check reads the host's own verdict; that measurement is the more valuable one.

## Relevant files

- `apps/desktop/scripts/sandbox-proof.mjs`: scenario 1's six literals; scenario 3's `No OS-level confinement is available on native Windows` regex.
- `packages/agent-tools/src/confinement/`: the per-platform verdicts the proof should read by `process.platform`.
- `AGENTS.md`: the proof's row.

Noticed 2026-09-28 while re-running the proofs on Linux under R-062. Not repaired: outside that item.
