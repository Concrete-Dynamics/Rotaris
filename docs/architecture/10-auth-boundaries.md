# 10 — Authorization Boundaries

> Perspective: Where auth decisions are made, what data flows where, and what is
> enforced vs. demonstrative.
> Diagram type: Graph + Table

---

```mermaid
graph TD
    subgraph "Auth Flows"
        COPILOT_FLOW["GitHub Copilot\nDevice Flow\n(auth/copilot.py)"]
        CODEX_FLOW["OpenAI Codex\nPKCE + local callback server\n(auth/codex.py)"]
        CLOUD_FLOW["Rotaris Cloud\nprovider token flow\n(auth/concrete_cloud.py)"]
        API_KEY_FLOW["DeepSeek / OpenAI-compatible\nAPI key entry\n(cli/commands/login.py)"]
        PROVIDER_SETTINGS["Provider settings\nCLI + TUI edit key/base URL\n(auth/provider_settings.py)"]
    end

    subgraph "Token Storage"
        STORE["auth/storage.py\n~/.local/share/rotaris/tokens/\nfile mode 0600\natomic write (mkstemp+os.replace)"]
    end

    subgraph "Secret Stores"
        MCP_SECRETS["config/secrets.py\n<workspace>/.rotaris/secrets.yaml\n~/.config/rotaris/secrets.yaml\n(MCP server env vars)"]
        PROJECT_SNAPSHOT["config/project_snapshot.py\nprovider/model catalog snapshot\n~/.config/rotaris/project.json"]
        PYDANTIC_SEC["SecretStr fields in config\n— never appear in model_dump()"]
    end

    subgraph "Runtime Access"
        LLM_CALL["LLM calls (litellm)\nreads token from storage\nper-request header"]
        MCP_LAUNCH["MCP server spawn\nenv vars injected from secrets.yaml"]
    end

    COPILOT_FLOW --> STORE
    CODEX_FLOW --> STORE
    CLOUD_FLOW --> STORE
    API_KEY_FLOW --> STORE
    PROVIDER_SETTINGS --> STORE
    PROVIDER_SETTINGS --> PROJECT_SNAPSHOT
    STORE --> LLM_CALL
    PROJECT_SNAPSHOT --> LLM_CALL
    MCP_SECRETS --> MCP_LAUNCH
    PYDANTIC_SEC --> LLM_CALL
```

## Enforcement vs. Demonstrative Controls

| Control                                           | Type     | Where enforced                                           |
| ------------------------------------------------- | -------- | -------------------------------------------------------- |
| OAuth token storage at `0600`                     | Enforced | `auth/storage.py` — `os.chmod` on write                  |
| `SecretStr` redacts `api_key` from logs/dumps     | Enforced | Pydantic type system                                     |
| Workspace path containment (file tools)           | Enforced | `tools/file_engine.py` + `haet/engine.py:resolve_path()` |
| Read-before-write on file edits                   | Enforced | `tools/file_write.py` + read ledger                      |
| `git_commit` restricted to local commits only     | Enforced | `tools/git_commit.py` — no push/pull/rebase              |
| MCP secrets not logged                            | Enforced | `resolve_server_env` reads directly into env, not logged |
| Provider API keys edited from CLI/TUI             | Enforced | `auth/provider_settings.py` stores keys through `TokenStorage`, not YAML |
| OAuth PKCE local server bound to `127.0.0.1` only | Enforced | `auth/codex.py` — localhost binding                      |
| Personas cannot exceed runtime child caps         | Enforced | `ChildManager.spawn_child()` validates depth, total children, and active children |
| Conversation workspace matches configured root    | Enforced | `Scheduler._validate_conversation_workspace()`           |
