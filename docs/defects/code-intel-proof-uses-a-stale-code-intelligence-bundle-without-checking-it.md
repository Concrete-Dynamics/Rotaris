## `code-intel-proof` uses a stale code-intelligence bundle without checking it

`code-intel-proof` runs the bundle step (`apps/desktop/scripts/code-intelligence/bundle.mjs`) only when the marker
`apps/desktop/resources/code-intelligence/bundle.json` is absent, and it never runs `bundle.mjs --check`. With or without
`--skip-build`, a tree built under an older recipe or an older pin is used without complaint. `init-proof` and `live-run`
do not have this gap: they call `ensureBundle` (`apps/desktop/scripts/lib/code-intelligence-bundle.mjs`), which runs
`--check` and refuses or rebuilds a tree that is absent or stale.

This matters because launch 11 (`child-rename-cold`) is `PD-MCP-004`'s acceptance gate, which the directive says is
"re-run on every pin change". On a stale runtime that gate passes or fails on the wrong runtime. Launch 13 is held to the
same terms.

Found by acceptance round 1 of fin47 on merged main (finding A4, harness defect, degrades). Run 1 of that sweep ran launches 1
to 13 on the recipe-3 bundle that `559003b` superseded (recipe 4, OQ-400's target architecture). The sweep's host notes say:
"code-intel-proof --skip-build does NOT check whether the bundle is stale, unlike init-proof. Its run 1 used the stale
recipe-3 bundle without complaint". `init-proof`'s run 1 on the same tree refused at once with "[code-intel:bundle] REFUSED
— the bundle is absent or stale for linux-x64". The sweep's setup recipe also lacked `pnpm code-intel:bundle`. That recipe
belongs to the orchestrated-build skill's profile, which this note does not change.

The finding also named `mcp-proof` and `mission-proof` as launching code intelligence on the stale bundle. On this branch
both write `code_intelligence: { enabled: false }` into their scratch configuration, so neither discovers the runtime.
`injection-proof` launches the entry against a worktree but judges only the launch line (REQ-MCP-034), not what the runtime
answers. The proofs whose subject is the runtime itself are `code-intel-proof`, `init-proof` and `live-run`.

## Specs

The product is not at fault. The proof breaks the evidence that `PD-MCP-004` (its acceptance gate, re-run on every pin
change) and REQ-MCP-116 (one pin, on the build side and the product side) depend on. ADR-0035 and ADR-0054 make the
bundle a build step whose marker carries the pins' hash so that a stale tree is known (`--check`). The proof never asks it.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs`: the bundle step before the build, which tests `existsSync(marker)` alone
  (lines 104-108 at `cb6d1d5`), and `results.json`'s `bundle` entry, which records no recipe, pins hash or target.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs`: `ensureBundle`, which `init-proof` (line 42) and `live-run` use.
- `apps/desktop/scripts/code-intelligence/bundle.mjs`: `--check`, which exits 1 when the tree is absent or stale for the
  host's target; `RECIPE` and the pins' hash.
- `apps/desktop/scripts/lib/code-intelligence-bundle.test.ts`: the cases on the proofs' own text.

Recorded 2026-10-15 by fin47's bundle `fin47-accept1-1`, task 1.
