# 03 — Integration Protocol

> Perspective: Runtime handshake between independently-deployed units — what loads when
> and in what order.
> Diagram type: Sequence

---

The key integration boundary is between the Rotaris process and the OpenHands SDK.
Config loading starts from built-in defaults, overlays discovered MCP servers and
the provider/model project snapshot, then applies global and workspace YAML.
A persona factory is registered at startup. `RalphLoop` constructs and owns one
`Scheduler` for the run and creates a fresh `ChildManager` for each iteration.
Each child agent is constructed on demand before `Scheduler.run_child()` wraps
the synchronous `LocalConversation.run()` in a worker thread. Every LLM completion
is routed through `model_input.wrap_llm_completion()`, which sanitizes stale prompt
history, synthesizes missing tool responses, redacts malformed tool-error payloads,
progressively truncates old tool output under context pressure, injects
`reasoning_content` echo-back placeholders for thinking-mode models, and samples
serialization validation as a production guardrail.

```mermaid
sequenceDiagram
    participant CLI as cli/ entry
    participant CONFIG as config/loader
    participant AGENTS as agents/factory
    participant SDK as OpenHands SDK<br/>(Agent + LLM registry)
    participant RALPH as RalphLoop
    participant CM as ChildManager<br/>(per iteration)
    participant SCH as orchestrator/scheduler
    participant CONV as LocalConversation<br/>(worker thread)

    CLI->>CONFIG: load config (defaults → discovered MCP → provider snapshot → global → workspace)
    CONFIG-->>CLI: merged RotarisConfig

    CLI->>AGENTS: create_agent_for_persona(persona, config)
    AGENTS->>SDK: register tool factories (TOOL_NAME_MAP)
    AGENTS-->>CLI: agent_factory (closure, not an Agent yet)

    CLI->>RALPH: construct RalphLoop(...)
    RALPH->>SCH: construct Scheduler for run
    RALPH->>CM: create per-iteration ChildManager

    Note over CM,CONV: Per-child at dispatch time
    CM->>CM: spawn_child() + dependency validation
    SCH->>AGENTS: agent_factory(llm)
    AGENTS->>SDK: Agent(context, llm, tools)
    SDK-->>AGENTS: Agent instance
    AGENTS-->>SCH: Agent

    SCH->>CONV: asyncio.to_thread(LocalConversation.run)
    Note over CONV,SDK: LLM calls are wrapped by model_input.wrap_llm_completion()
    CONV->>SDK: send_message(task_payload)
    SDK-->>CONV: sanitized completion / tool calls / errors
    CONV-->>SCH: terminal state
```
