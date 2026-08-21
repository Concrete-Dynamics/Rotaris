# 01 — System Context

> Perspective: Who uses the system, what external systems exist, and how they connect.
> Diagram type: C4Context

---

Rotaris is a single-process, asyncio-based Python application. The user interacts
via a terminal (TUI or headless CLI). Outbound I/O goes to the local filesystem,
LLM provider APIs and model-discovery endpoints, optional MCP servers, direct web
fetches requested through tools, and OAuth/API-key endpoints during authentication
or provider setup.

```mermaid
C4Context
    Person(dev, "Developer", "Runs Rotaris from the terminal")

    System_Boundary(proc, "Rotaris process") {
        System(cli, "CLI / TUI", "Entry point, interactive or headless")
        System(runtime, "Orchestration Runtime", "RalphLoop + Scheduler + ChildManager")
        System(tools, "Tools", "File, terminal, fetch, git, artifacts, HAET, MCP bridge")
    }

    SystemDb_Ext(fs, "Workspace Filesystem", "Source files + .rotaris/ sessions/config")
    SystemDb_Ext(cfg, "User Config", "~/.config/rotaris/ + ~/.local/share/rotaris/")
    System_Ext(llm, "LLM Providers", "Rotaris Cloud · Copilot · Codex · DeepSeek · OpenAI-compatible\n(via litellm)")
    System_Ext(web, "Web Resources", "HTTP(S) URLs requested by fetch/model discovery")
    System_Ext(mcp, "MCP Servers", "Serena, Tavily, Playwright, custom stdio/HTTP/SSE")
    System_Ext(oauth, "Auth Endpoints", "GitHub Copilot Device Flow\nOpenAI Codex PKCE\nAPI-key provider login")

    Rel(dev, cli, "Uses", "terminal")
    Rel(cli, runtime, "Drives")
    Rel(runtime, tools, "Invokes")
    Rel(tools, fs, "Reads / writes", "local I/O")
    Rel(runtime, fs, "Persists sessions", "local I/O")
    Rel(runtime, cfg, "Reads layered config", "local I/O")
    Rel(runtime, llm, "Sends prompts", "HTTPS via litellm")
    Rel(tools, web, "Fetches URLs", "HTTPS")
    Rel(tools, mcp, "Calls tool endpoints", "stdio / HTTP / SSE")
    Rel(runtime, oauth, "Auth handshake", "Device Flow / PKCE / API key")
```
