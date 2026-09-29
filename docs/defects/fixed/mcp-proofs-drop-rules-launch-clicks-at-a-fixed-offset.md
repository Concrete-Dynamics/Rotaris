## `mcp-proof`'s drop-rules launch clicks the session toggle at a fixed offset, so a slow host reads as a red

Launch 6 of `apps/desktop/scripts/mcp-proof.mjs` opens Settings → MCP Servers and clicks
`button[aria-label="Enable beta for this session"]` at **2,200 ms** after the window loads, then probes the row's
enablement text at 3,200 ms. Both are fixed offsets. On 2026-09-28, as root under Xvfb on a 4-vCPU Linux container
shared with another agent's proofs, the first run logged `capture: no "button[aria-label="Enable beta for this
session"]" control on screen` at the click and `probe-at 3200 … → []`, and the proof threw "the overridden row's
wording is wrong" — a red about REQ-MCP-115's session override that the product had not earned. The second run of the
same tree, minutes later, passed the launch, and a probe of `tr[data-mcp-server]` at 1,500 ms on the same profile found
every row on screen. The launch's assertions after the click (the fates, the granted set, the issues, the relaunch)
never ran on the red run.

`AGENTS.md` names this shape: "fixed offsets have produced false reds three times", and the driver exists so a step can
`waitFor` its condition. Launches 6 and 7 of this proof (the `check-status` clicks at 1,800 and 12,000 ms, the secrets
select at 9,000 ms) are the same shape; only launch 6 was seen red.

## Specs

None contradicted by the product. The proof is evidence (`.claude/rules/tests-and-proofs.md`), and a red it invents on
a loaded host is the expensive failure `codebase.md` warns of. REQ-MCP-115 is the requirement the launch stands for.

## Relevant files

- `apps/desktop/scripts/mcp-proof.mjs`: launch 6's `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_PROBE_AT` offsets; launch 7's.
- `apps/desktop/src/main/capture/seams.ts`: the click and probe-at seams, which fire at the offset whether or not the control exists.
- `apps/desktop/scripts/lib/driver.mjs`: `waitFor`, the condition-based alternative six proofs already use.

Noticed 2026-09-28 while re-running the proofs on Linux under R-062. Not repaired: moving the launch onto the driver
is a rewrite of its evidence, outside that item.

**Seen again, 2026-09-28, at the relaunch (R-062, review round).** The fix round re-ran the proof on the same kind of
host, with another worktree's Electron running beside it. Launch 6 passed its click, its wording, the fates, the
granted set and the issues. Its relaunch (`drop-rules-relaunch`) then probed `tr[data-mcp-server="beta"]` at its fixed
2,500 ms and logged `→ []`, no row on screen yet. The proof threw "after a relaunch beta should be back to its
configured value". That makes two fixed offsets in the one launch seen red, each once. REQ-MCP-115's relaunch clause
went unasserted on that run, not falsified.

## Repaired — 2026-09-28, under R-062

Launches 6 and 7 of `apps/desktop/scripts/mcp-proof.mjs` are driven through `lib/driver.mjs` (`drivenLaunch`), and no
step of either fires at an offset. Launch 6 reaches Settings → MCP Servers by Ctrl+7 and the category's name, clicks
the beta toggle once it is on screen, reads the row's wording once the row carries `data-overridden="yes"`, types the
prompt once the composer holds the caret, and reads the store once a session newer than the one before the prompt has
settled. The relaunch reads `tr[data-mcp-server="beta"]` once it is drawn. Launch 7 presses `Check status` once the
rows are listed and the button is enabled, reads the probing state in one renderer turn once the button says
`Checking…`, waits for each round to end (the button enabled and reading `Check status`, and no row still `Checking…`),
chooses `alpha` in the secrets select and waits for the control to show it, waits for the second round to start and
end, and then probes. The assertions are the same ones: REQ-MCP-115's wording and its relaunch, the five fates, the
granted set, the three issue checks, the log counts, REQ-MCP-054's two contacts, the mask, the scope, the expected keys,
the secret in no line. Launch 7's `.cmd` runner check stays asserted on win32 only and is stated not applicable
elsewhere.

What the driver client gained for it: `until` (a wait on a condition that is not one selector), `choose` (a native
`<select>` confirmed once the control shows the value, since a controlled select snaps back on the turn of the change
event; the design system's `SearchableSelect` by two real clicks) and `stopApp` (the closing picture and the driver's
quit, each within a bound, then SIGTERM, a grace and SIGKILL from `lib/bounded-launch.mjs` for an application that does
not exit, reported as a failure with its log tail). `startApp` ends a launch whose driver never answers before it
reports the failure. Each driven launch writes `<name>.steps.json`: every step, when it began, how long it took and
what it answered. `lib/bounded-launch.test.ts` pins the ending against real child processes, and `lib/driver.test.ts`
pins `stopApp` against a socket that accepts and never answers, `until`, and `choose` in both kinds, the native
snap-back included. (The bounds on the picture, the quit and the connect were added in the verification round, after
a verifier showed `stopApp` still pending 40 s into a quit nobody answered.)

Evidence: `pnpm mcp-proof --skip-build` under Xvfb, as root on Linux, Node 24, three runs in a row, **all three exit 0**
with every launch that applies on Linux passing (2 min 20 s, 2 min 19 s, 2 min 23 s). Another agent's Electron proofs
were running in a different worktree during all three. Launch 6's steps finished in 10.0, 9.9 and 10.4 s, where the
offsets had allowed 14 s. The relaunch's steps finished in 1.4, 1.4 and 2.2 s. Launch 7's finished in 3.2, 3.4 and
4.8 s, where the offsets had allowed 19 s. Each run's session settled `completed`; the secrets chooser was the native
kind; alpha was contacted twice. What this cannot show is the red it replaces: the loaded-host timing that made
the offsets miss was not reproduced on demand, so the repair is argued from the steps (none has a time) and the three
runs, not from a red turned green.

Re-run after the verification round's bounds (the same day's record, same host and command): three runs in a row,
**all three exit 0** with every launch that applies on Linux passing (2 min 19 s, 2 min 20 s, 2 min 19 s), the
`.cmd` runner check stated not applicable on linux in each. Another agent's transcript proof was running in a
different worktree during the first two. Launch 6's steps finished in 9.9, 9.9 and 10.0 s, the relaunch's in 1.4 s
each, launch 7's in 3.2, 3.2 and 3.4 s; no step recorded an error.
