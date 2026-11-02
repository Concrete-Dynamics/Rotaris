## `code-intel-proof`'s branch launch puts the sandbox switch ahead of the token, where the sentinel no longer looks

`branch()` and `exitStatus()` in `apps/desktop/scripts/code-intel-proof.mjs` launch the reserved-token branch as
`[...before, ...hostSwitches, TOKEN, '--', ...tail]` — the switch **ahead of** the token. That was the only place the
switch worked before the sentinel was repaired; the repair
([fixed](the-code-intelligence-server-dies-when-the-app-runs-as-root.md), ADR-0035's "Corrected the same day —
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

## Repaired 2026-09-28 under R-062

**Reproduced first.** In a fresh worktree of `main` (`fa377e6`), after `pnpm symbols`, `pnpm build` and the bundle
(`node apps/desktop/scripts/code-intelligence/bundle.mjs`, serena-agent 1.7.0 on Python 3.13.15), the proof ran as
root under Xvfb on Linux, Node 24, with `--skip-build --steps=1`. It failed at 180 s: "initialize (#1) got no answer:
the guard killed the child after 180000 ms (it has not exited)". The workspace `workspace-nocode` held a directory
named `builtin:code-intelligence`, the token read as a workspace path. Same as the sweep's hang, which now fails
instead of hanging because of the branch client repaired before it.

**What changed** (the harness only; no product file). `branch()` and `exitStatus()` in
`apps/desktop/scripts/code-intel-proof.mjs` launch `[...before, TOKEN, ...hostSwitches, '--', …]`, the product's own
order from `code-intelligence-launch.ts`: the token at the sentinel's fixed index, then the switch, then the separator.
Two more platform literals in the same script were repaired with it. The build step builds with `pnpm` off Windows, as
`init-proof` does, where it had spelled `cmd.exe` alone. The window sampler, which reads `Get-Process` through
`powershell.exe`, runs on Windows only. Elsewhere section 1 records its no-window check as **not measured**, with that
reason, in `results.json` and on its console line, where it had passed on an empty sample. (The first wording said "not
applicable"; a window opened on Linux would still fail consequence 1, so it was the instrument that did not apply.)

**The test that pins it.** `apps/desktop/scripts/lib/launch-sites.test.ts` gains rule 3: a launch of the reserved token
(`TOKEN` or the literal) keeps the token first, or right after the product's main entry. Its new case fails the proof's
old order (`[...before, ...hostSwitches, TOKEN, '--', ...tail]`) and a literal variant, and passes the product's order
on both binaries. It reads `code-intel-proof.mjs` itself and finds exactly two token launches, both clean. Against the
proof as it was, the scan case and the new case both fail, each naming "the reserved token follows ...hostSwitches".

**Measured** as root under Xvfb on Linux, Node 24, in `/home/user/Rotaris-crw-wt-prfb5`, `--skip-build` after one
`pnpm build`: section 1 passes. `tools/list` at about 2,060 ms, 22 tools, no preamble, exit 0 on standard input's end,
an unknown subcommand exits the runtime's 2. The whole proof then failed in section 5 on a second, separate harness
defect ([note](code-intel-proofs-setup-launches-collide-with-the-background-initialization.md)), repaired in the
commit after this one. With both repaired, the proof passed three runs in a row (ADR-0035, "The proof on Linux as
root"). **Not shown:** section 7 and the packaged branch of section 1 need `win-unpacked` (`ROTARIS_CODE_INTEL_PACKAGED=1`),
and no Linux artifact may be produced (IC-3); the no-window check on this platform; anything on Windows.
