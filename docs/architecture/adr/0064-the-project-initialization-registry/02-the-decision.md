# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it — The decision

Part 2 of 6 of [ADR-0064](../0064-the-project-initialization-registry.md), which indexes every part.

## The decision

Three obligations decide the placement between them, and once they are stated there is no free choice
left:

1. **`REQ-WORKSPACE-085` — the marker has exactly one writer**, and a task never records its own
   outcome. The file is `<workspace>/.rotaris/agents.yaml`, which the **workspace service** owns
   (ADR-0037 Tier A: `config.setField`, write then load again).
2. **`REQ-WORKSPACE-090` — applicability is REQ-MCP-037's rule and this domain declares no second one.**
   That resolution lives in the **run host**, the only process holding `LoadedConfiguration.mcp`.
3. **The boundary matrix forbids the shortcut.** `eslint.config.js` gives the run host no edge to
   `workspace` and main no edge to `mcp` or `store`. Neither of the two processes that can *act* can
   reach the other, and main already brokers between them.

So:

| Where | What |
| --- | --- |
| `packages/config/src/init/` | the **pure core** — the persisted state and its outcome patch, the task registry, the five set derivations, the nine-value view and its set-wise equality, one execution, and workspace classification |
| `apps/desktop/src/main/initialization.ts` | the **coordinator**: one resolution per workspace open, the single marker write routed through `config.setField` (since 2026-10-03 preceded by `config.bootstrap`, REQ-WORKSPACE-040: see the seventeenth round), the `code-intelligence-setup` runner, and the publication |
| `apps/desktop/src/run-host/mcp.ts` | unchanged in what it does — it gains `applicable` on its status and the corrected classification |
| channel 12, `initialization:state` | the nine values, their labels and descriptions, and the live run report |

### Why the core is in `config` and not in `workspace`

`packages/workspace` would be the obvious home by name, and it is the wrong one: the run host may not
import it. `config` is the one package all three composition roots may read, it already owns the YAML
document model this state is a section of, and it already owns the code-intelligence binding
(`deriveSetupInvocation`, `CODE_INTELLIGENCE_SETUP_STEPS`) the one task is built from. Nothing about
initialization is *workspace-service* work; what is workspace-service work is the write, and that goes
through the path that already exists.

### Why the task delegates rather than reimplements

`code-intelligence-setup`'s runner issues the existing `mcp.setup` request and maps `McpSetupStatus`
onto `REQ-WORKSPACE-087`'s task result. It states none of `REQ-MCP-099`'s budgets, step ids or statuses
a second time. What it *does* state, because this domain owns them and the MCP category's do not match,
are `REQ-WORKSPACE-093`'s per-stage failure reasons, `REQ-WORKSPACE-094`'s non-retryable refusal and
`REQ-WORKSPACE-095`'s two success summaries.

### Pushed, not polled

The run host publishes `mcp.setupStatus` on every change and the coordinator follows a live setup
through it; main then pushes the whole state to every window on channel 12. `REQ-WORKSPACE-109` requires
a step to become visible "at the moment that step finishes", and **SR-3** withdrew polling wherever two
processes can talk — these can. The MCP settings category's own 500 ms poll is untouched; it is
`REQ-MCP-112`'s and not this part's to change.
