# ADR-0016 — The tool registry: a declarative capability table with a direction-aware accessor

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-02)
- **Depends on:** ADR-0001, ADR-0002

## Context

`REQ-TOOLS-001` closes the public tool name set at exactly eighteen names, with `haet` an alias
resolving to the same tool as `haet_edit`. `REQ-TOOLS-002` makes any other `tools:` entry a
configuration-validation error naming the persona, the entry and the accepted names, with an extra
sentence pointing at `mcp_servers` when the entry names a configured MCP server.

`REQ-TOOLS-001` also gives every registry name a **three-facet capability declaration** — reads
workspace files, writes workspace files, runs commands — each declared or not, and makes the
declaration a property of **the tool, never of the content it is handed**: `terminal` declares running
commands whatever command it is given, and a command that writes a file does not make `terminal` a
writer. The per-name declarations are fixed there and must exist in exactly one place in the product.

The same requirement fixes the hardest part: a tool **outside** the registry — a plugin tool or an MCP
tool — carries **no** declaration, and no facet is inferred from its name, description or
self-description. It is read fail-closed **in the direction of the reading rule**: a rule that grants
on a declared facet sees nothing declared and does not grant; a rule that withholds, refuses or blocks
on a declared facet sees all three declared and withholds. One accessor cannot serve both directions;
the direction is part of the query.

`REQ-TOOLS-007` and `REQ-SANDBOX-039` state two tool **classes** against the declaration and require
them to stay consistent with it: the read-only class is exactly `grep`, `glob`, `fetch`, `haet_read`,
`read_file`, `artifact_read`, `artifact_list`, `artifact_write`, and the network class is exactly
`fetch`. Class membership is **not** a facet and is not derivable from the facets.

`REQ-TOOLS-006` fixes narrowing as a four-stage pipeline that can only remove, applied in the order
run-scoped allow-list, `coordinator_only`, `read_only`, `tool_restrictions`; no later stage restores
what an earlier one removed and none adds a tool the persona did not declare; every removal is logged
with the persona and the removing control. `coordinator_only` removes exactly `terminal`,
`write_file`, `haet_edit`, `haet`, `git_commit` and nothing else.

`REQ-TOOLS-010` and `REQ-TOOLS-167` require the prompt's tool listing and the callable tool set to be
produced from the **same resolution** and always to be equal — for built-ins and for MCP grants alike.
Two code paths that "agree" are non-conformant; there must be one.

`REQ-TOOLS-004` and `REQ-TOOLS-164`: a missing runtime prerequisite removes a tool and records a stable
machine-readable reason code, and never fails agent construction; an unloadable `custom_tools:` plugin
joins the enumerated reasons as a further distinguishable code plus a session issue naming persona,
path and cause.

## Alternatives considered

**A — Facets as properties on each tool implementation object.** Natural for an author and keeps the
declaration next to the code. Against: `REQ-TOOLS-001` requires the registry to be the product's
single definition, and requires a tool *outside* the registry to have no declaration at all. If facets
live on implementations, a plugin or MCP tool can assert facets it must not have and nothing
structural stops it. It also turns the class-consistency invariant into a runtime assertion rather
than a compile-time fact.

**B — A single frozen table keyed by name, with the classes declared beside it and a typed accessor
whose signature demands the reading direction.** Chosen.

**C — Facets inferred from a tool's argument schema** — a tool with a `path` argument reads files, a
tool with a `command` argument runs commands. Superficially attractive because it would extend to
plugin and MCP tools and remove the awkwardness of undeclared tools. Ruled out flatly by
`REQ-TOOLS-001`: `terminal` declares running commands whatever it is given, `git_commit` declares
reading *and* writing despite leaving the working tree alone, and no facet may be inferred from a
name, a description or anything a tool says about itself. Recorded because it is the design a reader
will reach for when the undeclared-tool rule starts to hurt.

## Decision

One module owns a frozen record from tool name to
`{ readsWorkspaceFiles, writesWorkspaceFiles, runsCommands }`, with the alias table beside it. The
read-only class and the network class are literal sets in the same module, guarded by a test-enforced
invariant that no read-only member declares writing or running and that the network class is a subset
of the read-only class.

The accessor is **not** `getFacets(name)` but a pair — `grantsOn(name, facet)` and
`withholdsOn(name, facet)` — so `REQ-TOOLS-001`'s direction-sensitivity lives in the type system
rather than in a reviewer's memory: an unknown name answers `false` to the first and `true` to the
second, always.

Narrowing is a fold over an explicitly ordered array of four stage functions, each of type
`Set<ToolName> -> Set<ToolName>` and each asserted in tests to return a subset of its input.
`coordinator_only` is expressed as removal of the closed five-name list `REQ-TOOLS-006` states, so
adding a read tool later needs no edit there. **The resolution runs once per agent construction and
its single result feeds both the prompt renderer and the callable set** — one value, two readers,
which is the only shape that cannot drift.

## Consequences accepted

1. Adding a public tool name is a code change in one file plus a declaration, and cannot be done by
   configuration. That is the point: `REQ-TOOLS-001` makes the set closed.
2. Plugin and MCP tools get nothing from the registry, so any rule that widens on a facet never widens
   for them. Plugin authors will find this restrictive; `REQ-TOOLS-001` requires it.
3. The `tools:` validator needs the workspace's configured MCP server list, because an entry naming a
   configured server must fail with an extra sentence pointing at `mcp_servers`. That is a real
   coupling between the registry module and the MCP configuration pipeline of ADR-0034 and belongs in
   the module boundary rather than being discovered later.
4. `REQ-TOOLS-180` constructs agents with **no** built-in run-termination tool; a run terminates when
   the agent produces a user-addressed message and requests no tool call in the same turn. The
   never-gated loop-control names of `REQ-TOOLS-014` are retained only for personas or providers that
   still surface such a tool, and they live in the gate (ADR-0017), not in this table.

## Revisit if

A requirement adds a fourth facet — `REQ-TOOLS-001` anticipates growth in *names*, not in facets; or
plugin tools gain a declared and validated capability contract, which is a product-owner decision
rather than an architectural one.

## First execution — 2026-09-03, the registry under the first gate

*Recorded under GD-10.*

**Built and run:** `packages/agent-tools/src/registry.ts` — the frozen facet table for the eighteen names, the
alias table, the two classes as literal sets under the consistency test, `grantsOn` / `withholdsOn` (an
unknown name answers `false` and `true`), the four-stage fold each stage asserted a subset of its input,
prerequisite removal with stable reason codes, and `resolveToolSet` whose ONE value feeds both the prompt's
listing and the callable set (`apps/desktop/src/run-host/tools.ts`). The reason code `executor_absent` is this
build's own addition to `REQ-TOOLS-004`'s enumerated four — a declared name this build registers no executor
for is removed and logged, which is how `terminal` was removed on every run before ADR-0020 landed and how
`fetch`, `git_commit`, `artifact_*`, `ask_questions` and the delegation tools read today.

**Found: nothing.** The persona whose tools are declared is a built-in table at the run-host root until
ADR-0036 loads `agents.yaml` (decision 2 of the plan in `codebase.md`).
