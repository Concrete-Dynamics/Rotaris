# 15 — Dev / Prod Topology

> Perspective: How the system runs in development vs. how it runs for end users.
> Diagram type: Graph

---

Rotaris has no server component and no deployment topology in the traditional sense.
"Dev" vs "prod" is a distinction in configuration paths and tool availability.

```mermaid
graph LR
    subgraph "Developer Setup (this repo)"
        DEV_INSTALL["pip install -e '.[dev]'\n(editable install)"]
        DEV_BIN["Rotaris / rotaris-headless\n(from .venv/bin/)"]
        DEV_CONFIG["<workspace>/.rotaris/agents.yaml\n(workspace overrides)"]
        DEV_GLOBAL["~/.config/rotaris/agents.yaml + models.yml\nprovider snapshot"]
        DEV_TOOLS["make lint / format / typecheck\nmake test / test-capability"]
        DEV_MCP["MCP servers: local stdio subprocesses\n(serena, tavily-mcp, @playwright/mcp)"]
    end

    subgraph "End-User Setup (installed)"
        PROD_INSTALL["pip install rotaris-core\n(from package index or wheel)"]
        PROD_BIN["Rotaris / rotaris-headless\n(from site-packages)"]
        PROD_CONFIG["<project>/.rotaris/agents.yaml + models.yml\n+ ~/.config/rotaris/agents.yaml + models.yml"]
        PROD_MCP["MCP servers: user-configured\nin agents.yaml mcp_servers:"]
    end

    subgraph "Shared (same in both)"
        SESSION_DIR[".rotaris/sessions/\nworkspace-local split state + evidence"]
        TOKEN_STORE["~/.local/share/rotaris/tokens/\n(OAuth tokens)"]
        PROJECT_SNAPSHOT["~/.config/rotaris/project.json\n(discovered providers/models)"]
        LLM_API["LLM Provider APIs\n(same endpoints)"]
    end

    DEV_INSTALL --> DEV_BIN
    DEV_BIN --> DEV_CONFIG
    DEV_BIN --> DEV_GLOBAL
    DEV_BIN --> DEV_MCP

    PROD_INSTALL --> PROD_BIN
    PROD_BIN --> PROD_CONFIG
    PROD_BIN --> PROD_MCP

    DEV_BIN --> SESSION_DIR
    PROD_BIN --> SESSION_DIR
    DEV_BIN --> TOKEN_STORE
    PROD_BIN --> TOKEN_STORE
    DEV_BIN --> PROJECT_SNAPSHOT
    PROD_BIN --> PROJECT_SNAPSHOT
    DEV_BIN --> LLM_API
    PROD_BIN --> LLM_API
```

## Key Differences

| Aspect           | Dev                                              | End-user                        |
| ---------------- | ------------------------------------------------ | ------------------------------- |
| Install mode     | `pip install -e '.[dev]'` (editable)             | `pip install rotaris-core` (wheel) |
| Source changes   | Immediately reflected                            | Requires reinstall              |
| Extra deps       | `pytest`, `ruff`, `mypy`, `textual-dev`, `respx`, snapshot tooling | Not installed                   |
| Capability tests | `make test-capability` (needs live LLM)          | Not applicable                  |
| Config source    | Often workspace `.rotaris/` in this repo       | User's project directory        |
