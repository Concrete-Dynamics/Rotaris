## An MCP tool offered under a public name is ruled as that public tool

A persona's MCP surface reserves only the names already in the persona's own callable set
(`run-host/tools.ts` hands `surfaceFor` the callable keys), and `resolvePersonaMcp`
(`packages/config/src/mcp/persona.ts`) prefixes a server's tool only when its name is already taken. So a server
that exposes `read_file`, `write_file` or `fetch` — a filesystem-style or fetch server does — offers it under that
plain name to any persona whose public set lacks the name (narrowed by its `tools:` list, say). From then on the
policy and the plan-gate narrowing know the call by its name alone and read it as the public tool:

- `ruleFires` matches a rule's `tools` set by name, so under `ask` the server's `read_file` is allowed without a
  prompt by `ask:read-only-tool`, wherever its arguments point, and the server's `fetch` with a local URL is allowed by
  `ask:fetch-local-host`. The public `read_file` has a path fence behind that allow; the server's tool has none.
- `withheldUnderPlanGate(e.name)` in `run-host/tools.ts` asks the registry about the name, so a server tool named like
  a public read-only tool is not withheld while the run is held at the plan gate.

Read from the code, not driven. `PD-TOOLS-004`'s path-scoped session approval had the same shape and was closed
against it when it was built: the gate now takes a `publicTool` predicate from the run host, which answers whether
the callable map holds the very executor `executorsFor` built for a name. The same predicate is the obvious seam for
the two readers above; they are not changed here.

Noticed 2026-09-27 while repairing the review of `PD-TOOLS-004` ([R-057](../product/requests.md#r-057)). Out of
scope there.

## Specs

Contradicts `REQ-TOOLS-001` as ADR-0016 reads it: a tool outside the registry — a plugin or MCP tool — carries no
declaration, and **no facet is inferred from its name**; a rule that grants sees nothing declared and does not grant.
`ask:read-only-tool` (REQ-TOOLS-043) and the fetch pair (REQ-TOOLS-045) name the read-only and network classes of
REQ-TOOLS-007, which are classes of public tools; an MCP tool is in neither. REQ-ORCH-153's plan gate withholds a tool
without a declaration.

## Relevant files

- `packages/agent-tools/src/policy.ts`: `ruleFires` — `rule.tools.has(req.toolName.toLowerCase())`, name only.
- `apps/desktop/src/run-host/tools.ts`: the MCP loop — `withheldUnderPlanGate(e.name)`, the collision check against
  `callable` only, and the gate's `publicTool` predicate, which already tells the two apart.
- `packages/config/src/mcp/persona.ts`: `resolvePersonaMcp` — the prefix is applied only on a taken name.
- `packages/agent-tools/src/planning-grants.ts`: `withheldUnderPlanGate`, by name through the registry.

## Repaired — 2026-09-28, under R-062

The `publicTool` predicate PD-TOOLS-004 introduced is now read by both readers this note names, so a server's tool
offered under a public name is ruled as the undeclared tool it is:

- `ruleFires` (`packages/agent-tools/src/policy.ts`, via `toolSetHolds`): a rule's `tools` set — REQ-TOOLS-007's
  read-only and network classes, which `ask:read-only-tool` (REQ-TOOLS-043), `restricted`'s two read rules and the
  fetch pair (REQ-TOOLS-045) are written over — holds a call only when `env.publicTool` answers true for it. A server's
  `read_file` under `ask` now falls to the preset's default (ask); under `restricted` it is denied by the default; a
  server's `fetch` with a local URL is not allowed by `ask:fetch-local-host`. Rules that name no tool set (the starter
  denies, the network-command patterns) and session approvals (REQ-TOOLS-024) decide it as before.
- `withheldUnderPlanGate(name, isPublicTool)` (`planning-grants.ts`): answers `true` for a tool that is not the public
  one whatever its name. The run host's MCP loop (`run-host/tools.ts`) passes `false` for every server executor, so a
  server's `read_file` is removed from a held run's listing and recorded in the port's withheld set; the gate
  (`gate.ts`) passes `false` for a name served by something other than the public tool or removed by this port at the
  gate, so the dispatch of such a call is refused with REQ-ORCH-153's reason. A public name the port never offered is
  still judged by the registry, so the misspelled-name repair of 2026-09-16 holds.

`resolvePersonaMcp` is unchanged: the prefix is still applied only on a taken name, as REQ-MCP-057 has it, and the two
readers no longer need the name to tell the tools apart.

Pinned by: `policy.test.ts` — the four cases under "an MCP tool offered under a public name is not the public tool";
`planning-grants.test.ts` — "withholds a tool that is not the public one whatever it is called"; `gate.test.ts` —
"withholds a server's tool offered under a public read-only name — the declaration is the tool's, not the name's";
`run-host/tools.test.ts` — "a server's own read_file is withheld at the plan gate like any undeclared tool, and is not
granted by ask:read-only-tool", which builds the real port three times (held with the server's `read_file`, open under
`ask` with it, and with the public `read_file`). With the class check reverted the four policy cases and the port case
fail; with the predicate's second parameter made inert the gate, predicate and port cases fail.
