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
