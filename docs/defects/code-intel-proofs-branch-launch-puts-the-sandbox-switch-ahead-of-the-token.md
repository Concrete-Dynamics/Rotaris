## `code-intel-proof`'s branch launch puts the sandbox switch ahead of the token, where the sentinel no longer looks

`branch()` and `exitStatus()` in `apps/desktop/scripts/code-intel-proof.mjs` launch the reserved-token branch as
`[...before, ...hostSwitches, TOKEN, '--', ...tail]` — the switch **ahead of** the token. That was the only place the
switch worked before the sentinel was repaired; the repair
([fixed](fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md), ADR-0035's "Corrected the same day —
the token stays first") put the token back at its fixed index and the inherited switch **between the token and `--`**,
which is where the product's own launch (`code-intelligence-launch.ts`) puts it. The proof was not moved with it. As
root, `hostSwitches` is `['--no-sandbox']`, so the proof's launch has `process.argv[2] === '--no-sandbox'` on the
development entry (`[1]` packaged): the sentinel does not recognise the token, and the whole application starts instead
of the server.

Measured 2026-09-28 as root under Xvfb on Linux, Node 24, on the built development entry, through the repaired branch
client (`lib/line-rpc-client.mjs`) with a 20 s guard: the proof's order
`electron out/main/index.js --no-sandbox builtin:code-intelligence -- start-mcp-server … --project <ws>` never answered
`initialize`; the guard killed it at 20,008 ms and it exited 0, and the application had created a directory named
`builtin:code-intelligence` inside the workspace (the token read as a workspace path, REQ-STARTUP-163). The token-first
order `electron out/main/index.js builtin:code-intelligence --no-sandbox -- …` reached the sentinel and exited 127 at
187 ms. So as root section 1 fails at the guard after three minutes (`callTimeoutMs + 60,000`) with the guard's
message, and `exitStatus()`'s unknown-subcommand launch would start the application too, so it cannot read the
runtime's 2 (not run: section 1 throws before it). Not as root, `hostSwitches` is empty and both orders are the same launch.

`lib/launch-sites.test.ts` does not catch it: its rule is "before any `--`, and after every positional argument unless
the entry is the product's own main", and the token launch satisfies it either way.

Recorded, not repaired: noticed while repairing the branch client under R-062, whose task was the client only.

## Specs

None contradicted by the product. REQ-MCP-033 fixes the token as the first argument of the application's own
executable; OQ-82's built reading carries the parent's switch between the token and `--`. The proof launches the token
in an order the product no longer uses, so as root it measures the application's normal start, not ADR-0035 c.1's branch.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs`: `branch()`'s and `exitStatus()`'s `spawn`/`spawnSync` argument lists.
- `apps/desktop/src/main/sentinel.ts`: `tokenAt`, the fixed index, and `withoutInheritedSwitches`.
- `apps/desktop/src/run-host/code-intelligence-launch.ts`: the product's own order, token then switch then `--`.
- `apps/desktop/scripts/lib/launch-sites.test.ts`: the placement rule, which admits both orders.
