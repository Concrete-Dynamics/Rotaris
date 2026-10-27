---
reference: ROTARIS-CRW-001
domain: mcp-integration
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# MCP Server Integration

## Overview

The product integrates external MCP (Model Context Protocol) servers as tool providers for its agent personas. Server entries come from three merged sources: layered YAML configuration, files named `mcp.json` picked up automatically from well-known locations, and three shipped default entries (a remote web-search server, a headless browser-automation server, and a bundled code-intelligence server). Each persona carries a subset of servers and, optionally, a per-server tool allow-list; whatever a persona's prompt lists is precisely what that persona may invoke — no more, no less. A missing or broken server never fails a run: it is skipped, a warning reaches the user, and the run proceeds. Within one session each server has exactly one shared connection, opened on first demand and closed a single time when the session ends. Users manage servers from the desktop application alone: the MCP category of the settings view lists every configured server with health probing and a session enable toggle, and holds the secrets surface whose values are always masked wherever they are rendered.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`16-mcp-integration/`](16-mcp-integration/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](16-mcp-integration/01-requirements.md) | Requirements; Server Configuration Model; Shipped Default Servers; Configuration Auto-Discovery (`mcp.json`) | REQ-MCP-001 – REQ-MCP-027 (30) |
| [02](16-mcp-integration/02-command-resolution.md) | Command Resolution; Availability and Drop-Not-Fail Semantics; Tool Discovery, Caching, and Health Probing; Per-Persona Tool Grants | REQ-MCP-028 – REQ-MCP-065 (38) |
| [03](16-mcp-integration/03-session-scoped-shared-runtime.md) | Session-Scoped Shared Runtime; User Toggles and Server Management; Secrets Storage and Environment Resolution | REQ-MCP-066 – REQ-MCP-111 (31) |
| [04](16-mcp-integration/04-desktop-application-surfaces.md) | Desktop Application Surfaces; Prompt Rendering of the MCP Surface; Validation and Launch Error Semantics | REQ-MCP-091 – REQ-MCP-107 (19) |
| [05](16-mcp-integration/05-data-formats.md) | Data & Formats; `mcp.json` discovery files; YAML configuration (server + persona surface); Normalized runtime server description; Per-server enablement; Secrets — `secrets.yaml`; Ordering; Health probe outcome; Session diagnostics and run state; Project setup step status; Setup warm steps; Timing and pinning constants | — |
| [06](16-mcp-integration/06-open-questions.md) | Open Questions | — |
