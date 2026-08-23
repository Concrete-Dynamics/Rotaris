# 14 — End-to-End Trace

> Perspective: A single user story traced through every layer from input to completion.
> Diagram type: Sequence

---

Scenario: **Developer submits "add a new REST endpoint" task in the TUI.**

```mermaid
sequenceDiagram
    actor DEV as Developer
    participant TUI as MainScreen (TUI)
    participant SESS as SessionManager
    participant RALPH as TuiRalphLoop
    participant ORCH as Orchestrator child<br/>(orchestrator persona)
    participant CM as ChildManager
    participant SCH as Scheduler
    participant WORKER as Worker child<br/>(coding-agent persona)
    participant AA as Authored Artifact<br/>(agent_published)
    participant SA as SummaryAgent
    participant ART as SessionArtifactStore
    participant FS as Filesystem

    DEV->>TUI: types task + Enter
    TUI->>SESS: create or resume SessionState<br/>(split state + compatibility snapshot)
    TUI->>TUI: classify initial intent + build contextual task payload
    TUI->>RALPH: _start_run(task)
    RALPH->>RALPH: build todo list from task

    loop Ralph iteration
        RALPH->>CM: create per-iteration ChildManager
        RALPH->>SCH: run_child(orchestrator record)
        SCH->>ORCH: asyncio.to_thread(LocalConversation.run)
        Note over ORCH,WORKER: Every LLM completion is wrapped by model_input.wrap_llm_completion()

        ORCH->>CM: spawn_child("coding-agent", task="add endpoint", ...)
        CM-->>ORCH: ChildTaskRecord (QUEUED)
        ORCH->>ORCH: AgentFinishAction (done delegating)

        SCH->>WORKER: asyncio.to_thread(LocalConversation.run)
        WORKER->>FS: read_file(relevant files)
        WORKER->>FS: write_file(new endpoint code)
        WORKER->>WORKER: publish artifact via artifact_write
        Note over WORKER,AA: Child publishes structured artifact<br/>as its response
        WORKER->>WORKER: AgentFinishAction

        SCH->>SCH: extract transcript + assess progress
        SCH->>SCH: detect authored artifact → skip SummaryAgent
        SCH->>SCH: build report directly from artifact body
        Note over SCH: _build_artifact_backed_report()<br/>no SUMMARIZING state transition
        SCH->>ART: upsert_from_child_report()<br/>(artifacts/&lt;id&gt;.json + .md + index.json)

        RALPH->>RALPH: _classify_completion(task, report)
        Note over RALPH: CompletionClassifier (small_model LLM)<br/>verdict: COMPLETE / NEEDS_ITERATION / UNCLEAR
        alt COMPLETE or UNCLEAR
            RALPH->>CM: mark_child_terminal(SUCCEEDED)
            RALPH->>RALPH: task.status = COMPLETED
        else NEEDS_ITERATION
            RALPH->>RALPH: report.status = "partial", task re-queued (PENDING)
            Note over RALPH: same-task counter +1<br/>abandon after 3 consecutive PENDING
        end

        SCH->>SESS: persist updated SessionState<br/>(state/resume.json, ui_transcript,<br/>evidence/tool-calls.jsonl,<br/>issues.json, run_config.json,<br/>metadata, summary)
    end

    RALPH->>TUI: post_message(IterationComplete)
    RALPH->>ART: post-run ImprovementCollector may write proposals
    TUI->>DEV: shows updated ChatPanel + TodoPane
```
