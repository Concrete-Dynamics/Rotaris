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

## Outcome

Repaired 2026-09-28 under R-062, in the harness only; the product was not changed. `sandbox-proof` now works out the
verdict it expects the way REQ-SANDBOX-066 orders the probe. It reads `process.platform` against REQ-SANDBOX-065's
two-member set, then looks for the platform's launcher on the `PATH` the application is given, then runs its own
trial through the real mechanism, before the application starts. That gives one of four shapes: `outside` (win32 and
every unrecognised identifier), `launcher-missing`, `trial-failed` or `available`. Each scenario asserts the product's
answer for that shape:

- **Scenario 1** requires REQ-SANDBOX-073's literals for this host's case. win32 keeps the six. Another identifier
  outside the set must quote the detected identifier and name macOS and Linux. `launcher-missing` needs the launcher
  and both install lines on Linux, and `sandbox-exec` and `/usr/bin` on macOS. `trial-failed` needs the two userns
  controls and the by-hand line on Linux, and the Seatbelt by-hand line on macOS. `available` requires
  `confinement: available (<backend>)`. On Linux or macOS the verdict may not claim an unsupported platform.
- **Scenario 2** requires REQ-SANDBOX-130's disclosure only outside the set. On Linux and macOS a mechanism exists,
  installed or not, so there the disclosure must be **absent**. The eight controls are required everywhere.
- **Scenario 3** requires the refusal before start, carrying the same case's literals (REQ-SANDBOX-126), wherever the
  verdict is unavailable. Where it is available, the same workspace must start and must not be refused
  (REQ-SANDBOX-093).
- **Scenarios 4 and 5** run on every platform unchanged. Scenario 5's fixed offsets (select at 1800 ms, Save at
  3000 ms) raced a first launch on Linux. The view's own Runtime click fired before the category was drawn, so the
  selects went into Models and nothing was saved. Every step now waits for its control. Save waits until both choices
  show. The select seam's ignored `~` was repaired for this
  ([`the-select-seam-ignores-the-waiting-form.md`](the-select-seam-ignores-the-waiting-form.md)).
- **Scenario 6 is new: REQ-SANDBOX-127's six effects, IC-8's measurement.** It runs only where the verdict is
  `available`. Everywhere else it is stated not applicable, with the verdict as the reason. Each effect is one
  `terminal` call from a scripted agent in an unattended `workspace-write` run. That call passes through the
  product's own enforcement point, and the result is read from the host side afterwards.

Measured as root under Xvfb on Linux, Node 24, from `fix-proofs-b2`:

- **Without `bwrap`** (removed with `apt-get remove` for the run): exit 0. The verdict was the launcher-missing
  sentence, there was no disclosure, all eight controls were drawn, the run was refused before start with a message
  carrying the Linux remediation, the autonomous run started, the round-trip passed, and scenario 6 was not
  applicable.
- **With `bwrap` 0.9.0** (installed through the proxy for this measurement): exit 1. Scenarios 1 to 5 passed, and in
  scenario 6 fourteen of fifteen checks held. The failing one was a product defect: case (c) of REQ-SANDBOX-077 left
  an empty `.git` directory on the host
  ([`the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`](the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md),
  repaired 2026-09-29).
  The proof stays red on a Linux host with `bwrap` until that defect is repaired. Weakening the check to get a green
  result was not an option. The result is recorded in IC-8 (`docs/architecture/implementation-conditions.md`).

Pinned by the proof itself, which is the unit. The waiting select step is pinned by `apps/desktop/src/main/capture/host.test.ts`
("waits a select step on the control alone…").
