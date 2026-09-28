# ADR-0016 — The tool registry: a declarative capability table with a direction-aware accessor

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-02)
- **Depends on:** ADR-0001, ADR-0002

## Context

`REQ-TOOLS-001` closes the public tool name set at exactly nineteen names (eighteen plus `git_read`,
ruled OQ-61 on 2026-09-18), with `haet` an alias
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
`read_file`, `git_read`, `artifact_read`, `artifact_list`, `artifact_write`, and the network class is exactly
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

**Built and run:** `packages/agent-tools/src/registry.ts` — the frozen facet table for the nineteen names (plus `git_read`, OQ-61), the
alias table, the two classes as literal sets under the consistency test, `grantsOn` / `withholdsOn` (an
unknown name answers `false` and `true`), the four-stage fold each stage asserted a subset of its input,
prerequisite removal with stable reason codes, and `resolveToolSet` whose ONE value feeds both the prompt's
listing and the callable set (`apps/desktop/src/run-host/tools.ts`). The reason code `executor_absent` is this
build's own addition to `REQ-TOOLS-004`'s enumerated four — a declared name this build registers no executor
for is removed and logged, which is how `terminal` was removed on every run before ADR-0020 landed and how
`fetch`, `git_commit`, `artifact_*`, `ask_questions` and the delegation tools read today.

**Found: nothing.** The persona whose tools are declared is a built-in table at the run-host root until
ADR-0036 loads `agents.yaml` (decision 2 of the plan in `codebase.md`).

**Third execution, 2026-09-04, the intent gate (REQ-ORCH-016).** The direct-work bundle is resolved **by
facet** against `DECLARATIONS` (`directWorkBundle()`: todo, the delegation trio, `grep`/`glob`, `fetch`, the
two artifact reads, and every name declaring a read, a write or a command), never by a literal list; a tool
added to the table joins or stays out by its own declaration. At the run-host root the grant unions the bundle
into the entry role's declared tools and drops `coordinator_only`; the removals for prerequisites still apply
(`fetch`, `git_commit` and the artifact reads left the set as `executor_absent`/`artifact_store_absent` in the
built app — the bundle is a grant, not a promise the executor exists). **Found: nothing** beyond that reading.

**Fourth execution, 2026-09-05, a tool outside the registry (Part S, ADR-0034).** The MCP executors are built by the
run host (`run-host/mcp.ts`, `McpHost.executorsFor`) with no facet declaration and dispatched through the ONE gate
like any tool (`tool.start` before the fixture answers, the row settled by the gate's sink). The fail-closed reading
per preset, first executed (`run-host/tools.ts`): a rule that **withholds** on a declared facet sees all three
declared for an undeclared tool, so under the `restricted` preset (whose default decision is deny) and for a persona
marked `read_only` the MCP tools are **withheld from the surface** — absent from the prompt section and the model's
listing, the section rendering each active server bare; under `ask` the gate's default decision asks; under
`autonomous` it allows. Nothing special-cases the gate: the policy's default decision does the work, and the mode
at port creation decides the surface (a later `setMode` to `restricted` leaves the names listed and every call
denied by the default). `coordinator_only` removes its closed five names and never an MCP tool. **Found: nothing**
in the registry; consequence 3's coupling (the `tools:` validator fed the configured server set) is now real —
`referentialMessages` takes the merged `mcp_servers` map and `REQ-MCP-103`'s exact form is the message.

**Fifth execution, 2026-09-07, the declared-but-unexecuted name (Part AC).** `ask_questions` had sat in the frozen
table since the first execution with a `userPromptChannel` prerequisite, a facet declaration of `d(false, false,
false)` and **no executor**, so every resolution removed it as `executor_absent` — the reason code this build added
to REQ-TOOLS-004's four — before the prerequisite it was given could ever decide anything. Part AC built the
executor (`agent-tools/src/tools/questions.ts`) and the run host's `userPromptChannel` now carries attendedness
(REQ-TOOLS-053/069) rather than the literal `false` it held while there was nothing for it to be true of. Both
paths were then exercised for the first time: an attended run keeps the name, an unattended one loses it with
`user_prompt_channel_absent`.

**Found — a second gate behind the first, and it was silent (the fortieth).** With the executor registered and the
prerequisite met, the tool was *still* uncallable, because **no built-in persona declared it** and REQ-ORCH-016's
direct-work bundle does not name it either: `directWorkBundle()` resolves by facet, and `ask_questions` declares
none of the three (correctly — it reaches a person, not the workspace, REQ-TOOLS-007). The registry's whole
apparatus of removals and reason codes is downstream of a persona's `tools:` list, so a name **no persona ever
declared produces no removal, no reason code and no log line**: the tool was simply absent from the listing, in
silence, and the scripted agent's step fell through to an ordinary answer. This is the mirror image of
consequence 1 — the table being closed says nothing about the table being *reached* — and it was invisible to
every reading of the registry because the registry is not where it happens.

`ask_questions` therefore joins the **orchestrator's** declared tools and no other persona's, for the reason
REQ-CHAT-094 gives: a pending prompt is scoped to one conversation, and the orchestrator's is the conversation the
desktop user is in. `coordinator_only` does not remove it — `COORDINATOR_REMOVES` is the closed five
write-and-command names (REQ-TOOLS-006) and asking a person is neither, which the fifth execution confirms in the
built app. **Whether a delegated child may ask is left open** against REQ-TOOLS-002 rather than settled here: the
mechanism supports it (the wait registry is per tool port, which is per conversation), but no requirement says
which personas should, and REQ-CHAT-051 defines exactly one question trailer row.

**Found: nothing else** in the registry. The four-stage narrowing fold, the alias table and the fail-closed
accessor behaved as the first execution recorded them; the new name changes no stage.

**Sixth execution, 2026-09-28, a tool outside the registry offered under a public name (R-062).** The fail-closed
reading had been executed for MCP tools under their own names (the fourth execution) and, since PD-TOOLS-004, for a
server's `write_file` at the session-approval seam. It had never been executed for the readers that identify a tool
**by name**: `ruleFires`' class sets and `withheldUnderPlanGate`. A persona's MCP surface prefixes a server's tool only
when its name is already taken (REQ-MCP-057), so a filesystem-style server's `read_file` reaches a persona whose public
set lacks one under that plain name — and by the name, `ask:read-only-tool` allowed it wherever its arguments pointed,
the fetch pair allowed a server's `fetch` on a local URL, and the plan gate let it through the hold. **Found: the
decision's own words already forbid it and the code did not follow them** — "no facet is inferred from its name" was
read as a statement about the *table* (the table declares nothing for the name) when the two readers were inferring the
declaration from the name by looking the name up. The seam is PD-TOOLS-004's `publicTool` predicate, true only when the
callable map holds the very executor the run host built for the name: `toolSetHolds` in `policy.ts` requires it before
a class rule fires, `withheldUnderPlanGate` takes `isPublicTool` and answers `true` without it, the MCP loop in
`run-host/tools.ts` passes `false` for every server executor, and the gate passes `false` for a name it serves with
something other than the public tool or removed itself at the gate. Consequence 2 now holds for the class rules as it
held for the facet accessors: under `ask` a server's read tool asks on every call and only a session approval — exact
arguments, REQ-TOOLS-024 — quiets it; under `restricted` it is denied by the default, which the surface's withholding
already made moot. `resolvePersonaMcp`'s prefix rule is unchanged. Measured by unit tests over the policy, the predicate,
the gate and the real port with a stand-in MCP host (`docs/defects/fixed/an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md`);
the built app was not driven, since neither `plan-gate-proof` nor `mcp-proof` declares a server tool under a public
name and both spawn Electron without the root host's `--no-sandbox` switch on this host.
