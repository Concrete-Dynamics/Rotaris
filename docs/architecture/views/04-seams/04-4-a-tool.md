# Seams — what to touch, in what order, to add one of the things this product adds most often — 4. A tool

Part 4 of 8 of [the seams](../04-seams.md), which indexes every part.

## 4. A tool

Fail-closed by construction: the registry removes what it cannot resolve.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/tools.ts` | the name in `PUBLIC_TOOL_NAMES` |
| 2 | `packages/agent-tools/src/registry.ts` | the `DECLARATIONS` entry, and membership of `READ_ONLY_CLASS` / `NETWORK_CLASS` / `COORDINATOR_REMOVES` where it belongs |
| 3 | `packages/agent-tools/src/tools/<name>.ts` | the executor — pure, no `electron`, time from the clock ports only |
| 4 | `apps/desktop/src/run-host/tools.ts` — `executorsFor` | the wiring that makes the declared name callable |
| 5 | `packages/agent-tools/src/gate.ts`, `policy.ts` | only if it needs a rule of its own |
| 6 | `packages/engine/src/run/cut.ts` — `WHOLE_KEYS`, and the key table in `run/cut.test.ts` | only when an argument key holds identifiers, paths or timestamps and its last word does not say so, so an error-path record never cuts it (`PD-SESSION-003` (d)); the table classifies every built-in tool's argument keys |

Invariants:

- **A declared name with no executor is removed from the persona**, not offered and failed. One resolution
  feeds both the prompt listing and the gate, so what the model is told it has is what the gate will allow.
  Each removal is logged with the persona and the control (REQ-TOOLS-006) by `createToolPort`: a narrowing
  control's (`run_allow_list`, `coordinator_only`, `read_only`, `tool_restrictions`) at `info` through
  `ToolPortContext.info`, a prerequisite's (REQ-TOOLS-004's reason codes, `executor_absent` among them) at `warning`.
  `tool_restrictions` binds by the allowed-tool lists `toolRestrictionsFor` reads (OQ-145): the entry naming the persona
  in its own map and in the map of `ToolPortContext.parentPersona`, the persona that delegated the agent. A public tool
  and an MCP tool alike survive only when every list names it (`restrictionsAllow`); an MCP tool is taken off the
  surface before the executors and the prompt section are drawn from it, so what is printed is what is callable (REQ-MCP-062).
  `artifact_write` survives only while the persona's `can_publish_artifacts` is true (REQ-CONFIG-106, REQ-TOOLS-150;
  `Persona.canPublishArtifacts`, carried by `personaResolverFor` with the same stated-or-built-in rule as `coordinator_only`),
  and is otherwise removed as the prerequisite `artifact_publish_not_granted` (REQ-TOOLS-004); no built-in role declares it
  or carries the flag (OQ-212).
- **A request the run host sends a server on its own is not a tool call.** REQ-MCP-070's `lsp_init`, REQ-MCP-071's binding
  probe and, since `PD-MCP-004` (OQ-273, 2026-10-13), the referencing-symbol search sent before the bundled server's symbol
  rename go through no gate and write no record, total or notice. A new one of the last kind is a `warmUps` entry of the binding
  manifest, keyed by capability and checked by `manifest.mjs` (`warmUpRefusals`, `scripts/lib/code-intelligence-warm-ups.mjs`:
  both tools listed, both arguments in both schemas), resolved by `codeIntelligenceWarmUp` and sent by the MCP executor in
  `run-host/mcp.ts` inside the warmed call's own allowance; no file restates the runtime's argument names. The one file the run
  host writes into the workspace for such a call — since `PD-MCP-004` revision 2 (OQ-362), the `jsconfig.json` of the product's
  own for a symbol rename no project file covers — follows the same path: a `projectFiles` entry of the manifest, keyed by
  capability, its language's extensions read from the runtime (`projectFileRefusals` beside `warmUpRefusals`: a capability of the
  tiers, a language the runtime names with an extension), resolved by `codeIntelligenceProjectFile`, placed and removed by the
  executor inside the call's observation and noted in `McpHost.writes` under a name no agent bears, so no observation lists it.
- **The gate's refusals before the schema parse run in one order**: REQ-ORCH-153's plan gate, then OQ-213's todo list
  owed before a task's second work item (`GateDeps.todoList`, the entry port's only, where its resolved set holds `todo`).
  A tool whose `DECLARATIONS` entry writes workspace files or runs commands is a **work item** on a direct-work grant
  (`isWorkItem`, `todo-list-gate.ts`), so a new tool of that kind is counted there with no edit; `delegate` always is.
- **The resolution is one function, and `delegate`'s description reads it too** (PD-TOOLS-006 revision 4, OQ-216).
  `resolveAgentGrant` (`run-host/tools.ts`) takes a persona's declared tools through `coordinator_only`, `read_only`, the
  `tool_restrictions` lists and the prerequisites (the persona's own `can_publish_artifacts` among them, OQ-212); an agent's port applies it to itself, and `delegateCatalogue` applies it,
  on a child's terms, to every persona the agent can delegate to, so the facets the description states
  (`renderDelegateCatalogue`, from `DECLARATIONS`) are the grant a child receives. A new tool's facets therefore reach
  every coordinator's description with no edit beyond step 2. The same resolution answers which delegations are
  implementation delegations (`implementationRole`, injected as `SessionsDeps.implementationRole`), so the todo-item
  refusals of `PD-TOOLS-006` revision 6 (OQ-220) and the description never disagree about a persona.
  Since revision 10 (OQ-334) an entry whose resolved grant holds `artifact_write` also reads "publishes artifacts"
  (`catalogueWords`, beside `grantFacets`), and `createToolPort` passes `delegateTool` the run's store presence
  (`artifactStore`, the prerequisite the catalogue was resolved under) for `REPORT_ARTIFACT_SENTENCE`; a new tool that publishes
  is therefore described by the same resolution, and a new sentence in `delegate`'s description names no persona.
- **What the coordinator is told about who does the work** lives in two places, and neither names a persona's tools twice: the
  facts are `delegate`'s catalogue (`renderDelegateCatalogue`, computed per caller), and the routing table (`ROUTING`,
  `engine/children/personas.ts`) only points to it (`ROUTING_WORK_SENTENCE`, `PD-TOOLS-006` revision 8). A per-route capability
  clause would make the built-in prompt a per-configuration render, which `entryInstructionsFor`'s constant comparison forbids.
- **What the run does to the caller's own plan at admission** (`PD-TOOLS-006` revision 7, OQ-249) is the run host's, not the
  engine's: the accepted `DelegateOutcome` hands back the resolved `todoItem`, and `createToolPort` passes `delegateTool` a
  `markItem` over the port's own `TodoList`, the instance the `todo` tool holds, so the plan the agent reads and the one stored
  agree within a turn. What the `todo` tool needs of the run (the held set, `PD-TOOLS-008` revision 2, and the served set,
  revision 3) is a live read on the port context (`ToolPortContext.heldTodoItems`, `ToolPortContext.servedTodoItems`), filled in
  both `toolsFor` closures in `sessions.ts` from `IterationChildren`'s reads of the child ledger. Since revision 4 (OQ-333) the
  single-active count reads the served set (held inside it) and `replace`'s closes still read the held one; a new read of the run
  for the count joins `exemptNow` in `todo.ts`, not a new port field.
- **Something the message that resumes a wait says of the caller's plan** (`PD-TOOLS-006` revision 11, OQ-333) is computed in
  `IterationChildren` beside REQ-ORCH-059's `openTodoFor`, from the plan `todoPlanFor` already reads for admission and the ledger's
  held set (`openServedItemsOf` → `openServedItems` in `children/todo-item.ts`), and rendered by `reportBlockWithItem`
  (`children/notify.ts`), which every wait message uses — the orchestration pass's `resumeMessage` and `waitForTasks`'s two
  texts — so `wait_for_tasks`, a foreground `delegate` and a pass's resume cannot disagree. No port is added.
- **A `delegate` field the run must admit** lands in three places, as `todo_item` did (revision 6): the tool's schema and the
  `DelegationPort` request (`agent-tools/tools/delegation.ts`), `DelegateRequest` (`engine/children/delegation.ts`), and
  `IterationChildren.delegate`'s admission, before `ChildLedger.spawn`, with a refusal `rejected` and no record. A field the
  child's record keeps is a store column (§3) and a `SpawnInput` field carried by `ChildLedger.spawn` into `ChildInsert`.
- The gate decides; the executor never asks. An approval travels `gate → presenter → main → dialog` — see
  [`06-sequences.md` §2](../06-sequences/02-2-a-permission-approval-end-to-end.md#2-a-permission-approval-end-to-end).
- A tool that reaches the filesystem states its read roots; a tool that reaches the network reads the egress
  policy **from the saved configuration at every call**, not from a value captured at run start — through
  `readSavedConfiguration`, which loads again only when a file it read has changed, rather than a bare
  `loadConfiguration` per call.

---
