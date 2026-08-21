# 06 — Event / Message Bus

> Perspective: Who emits what messages, who listens, and what payloads travel.
> Diagram type: Sequence

---

Rotaris does not use an external message broker. Communication between components
uses four mechanisms: direct function calls (in-process), `PromptRegistry`
(thread-safe singleton for cross-thread queued/steering prompts), the small
`api/prompts.py` façade for programmatic prompt submission, and Textual's widget
message system (TUI events). There is no pub/sub topology; all channels are
point-to-point.

```mermaid
sequenceDiagram
    participant USER as User (TUI keyboard)
    participant TUISCREEN as MainScreen
    participant API as api/prompts.py
    participant REGISTRY as PromptRegistry<br/>(core/prompt_types.py)
    participant RALPH as RalphLoop
    participant CHILD as Running Child<br/>(worker thread)
    participant WIDGETS as TUI Widgets<br/>(ChatPanel, AgentStatusPane)

    Note over USER,WIDGETS: Queued prompt (new task injected mid-run)
    USER->>TUISCREEN: types message + Enter
    TUISCREEN->>API: submit_queued(content, context_snapshot)
    API->>REGISTRY: add_queued_prompt() [Lock]
    RALPH->>REGISTRY: get_queued_prompts() [at stop-check boundary]
    REGISTRY-->>RALPH: list[QueuedPrompt]
    RALPH->>RALPH: append "Queued Prompts" phase to todo list
    RALPH->>REGISTRY: mark_queued_as_triggered()

    Note over USER,WIDGETS: Steering injection (guidance to running child)
    USER->>TUISCREEN: steering input
    TUISCREEN->>API: submit_steering(child_id, content)
    API->>REGISTRY: add_steering_prompt(child_id, content) [Lock]
    CHILD->>REGISTRY: get_steering_prompts(child_id)
    REGISTRY-->>CHILD: SteeringPrompt[] filtered to PENDING by scheduler
    CHILD->>CHILD: conversation.send_message("[STEERING PROMPT]...")
    CHILD->>REGISTRY: mark_steering_as_injected()

    Note over USER,WIDGETS: TUI widget updates (progress)
    RALPH->>TUISCREEN: call_from_thread(post_message, IterationComplete)
    TUISCREEN->>WIDGETS: update AgentStatusPane / TodoPane / ChatPanel
```
