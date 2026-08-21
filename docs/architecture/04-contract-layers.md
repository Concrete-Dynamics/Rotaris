# 04 — Contract Layers

> Perspective: Formal interfaces that separate concerns — infrastructure contracts vs.
> application contracts.
> Diagram type: Graph + Table

---

```mermaid
graph LR
    subgraph "Infrastructure Contracts"
        PC["Persona config\nagents.yaml schema\n(RotarisConfig → PersonaConfig)"]
        TC["Tool registration\nTOOL_NAME_MAP\nALLOWED_PUBLIC_TOOL_NAMES"]
        SC["Session schema\nSessionState Pydantic model\nSESSION_SCHEMA_VERSION"]
    end

    subgraph "Application Contracts"
        DA["RotarisDelegateAction\n{persona, task_name, task,\ndepends_on, inherited_context,\ncategory, run_in_background,\nattach_artifacts}"]
        RA["ChildReportArtifact\n{status, summary, files,\nerrors, artifacts, next actions}"]
        TA["TokenSnapshot\n{prompt, completion,\ncache, reasoning}"]
        IA["ImprovementProposalArtifact\n{run_id, proposals[], risks}"]
    end

    subgraph "Tool Invocation Contract"
        TDef["ToolDefinition (SDK)\n+ ToolExecutor"]
        MCP["MCP tool schema\n(auto-discovered at startup)"]
    end

    PC --> DA
    TC --> TDef
    TC --> MCP
    DA --> RA
    RA --> SC
    TA --> SC
    IA --> SC
```

## Key Contract Invariants

| Contract                       | Owner                           | Invariant                                                                               |
| ------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------- |
| `PersonaConfig`                | `config/schema.py`              | `tools` list contains only names from `ALLOWED_PUBLIC_TOOL_NAMES`                       |
| `ChildReportArtifact`          | `orchestrator/report.py`        | Parent reads child results through structured summaries/artifacts, not raw transcript   |
| `ChildTaskRecord.transition()` | `orchestrator/child_state.py`   | All state changes go through `transition()` — direct `record.state =` is forbidden      |
| `RotarisDelegateAction`         | `orchestrator/delegate_tool.py` | `depends_on` task IDs are normalized to child canonical names; unknown deps and cycles are rejected at spawn time |
|                                |                                 | Runtime policy defaults cap depth at 3, total children at 20, and active children at 6; per-model `max_parallel` uses an idle queue, not hard rejection |
| `SessionState` schema version  | `session/state.py`              | New fields must have defaults; bump `SESSION_SCHEMA_VERSION` only on breaking changes   |
| `TOOL_NAME_MAP`                | `agents/factory.py`             | Friendly config names map 1:1 to SDK class names; add here when creating tools          |
