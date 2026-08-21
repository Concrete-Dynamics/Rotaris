# 11 — Dependency Sharing

> Perspective: Which libraries are singletons, which are process-shared, which are
> per-agent private.
> Diagram type: Graph

---

```mermaid
graph TB
    subgraph "Process-wide / run-wide shared"
        LITELLM["litellm\n(global provider registry)"]
        PROM_REG["PromptRegistry\n(core/prompt_types.py)\nthreading.Lock"]
        GLOBAL_TRACK["GlobalTracker\n(tracking/tracker.py)\nthreading.Lock"]
        SDK_TOOL_REG["OpenHands SDK\ntool/agent registry"]
        SESSION_MGR["SessionManager\n(session/manager.py)\none per CLI/TUI app"]
        SCHED["Scheduler\n(one per RalphLoop run)"]
        ARTIFACT_STORE["SessionArtifactStore\n(one per RalphLoop run)"]
        MCP_TOGGLES["MCPToggleStore\nprocess-local TUI toggles"]
    end

    subgraph "Per-RalphLoop-iteration (fresh each iteration)"
        CHILD_MGR["ChildManager\n(new instance per iteration)"]
    end

    subgraph "Per-child (isolated)"
        CONV["LocalConversation\n(SDK — one per child agent)"]
        AGENT_CTX["AgentContext\n(SDK — bound to one conversation)"]
        LLM_INST["LLM instance\n(SDK — one per child)"]
        FILE_LEDGER["Read ledger\n(tools/file_engine.py)\nisolated per conversation"]
    end

    subgraph "External process (separate)"
        MCP_PROC["MCP server processes\n(stdio subprocess or HTTP)"]
    end

    SCHED --> CHILD_MGR
    SCHED --> ARTIFACT_STORE
    CHILD_MGR --> CONV
    CONV --> AGENT_CTX
    CONV --> LLM_INST
    CONV --> FILE_LEDGER
    LLM_INST --> LITELLM
    SCHED --> GLOBAL_TRACK
    SCHED --> SESSION_MGR
    AGENT_CTX --> SDK_TOOL_REG
    AGENT_CTX --> MCP_PROC
```

## Key Sharing Rules

- `PromptRegistry` and `GlobalTracker` are shared across threads — both use `threading.Lock`.
- `Scheduler` is reused for a `RalphLoop` run; `ChildManager` is **not** shared between Ralph iterations.
- `SessionArtifactStore` is session-scoped and survives across iterations so sibling summaries and authored artifacts can be reused.
- `MCPToggleStore` is process-local TUI state; persisted config still comes from `mcp_servers:`.
- Each `LocalConversation` has its own `LLM` instance with isolated `LLM.metrics` — token counts are per-child, never global.
- The read ledger (`FileToolEngine`) is scoped to one conversation — a child cannot accidentally satisfy another child's read requirement.
