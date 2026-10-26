---
reference: ROTARIS-CRW-001
domain: workspace-context-onboarding
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Workspace Handling, Context Injection, and Project Onboarding

## Overview

The product operates on a user-selected workspace folder: the desktop app resolves which folder to open at startup (remembering the last one, prompting on first launch), shows that folder's path alongside the checked-out git branch in its chrome, keeps per-workspace state in a `.rotaris/` directory layered with global configuration, injects workspace context files (`AGENTS.md`) and a discovered portable-skill catalog (`SKILL.md`) into every agent, runs a one-time background project-initialization step (code-intelligence indexing via a configured MCP server), gates repository-authored hook commands behind an explicit trust review, and guides first-run users toward provider authentication and (on bundled builds) machine tool setup. Throughout, "the code-intelligence runtime" names whatever runtime the build pins behind the MCP server configured under the name `code_intelligence`; that name, the set of built-in server entries it belongs to, and the runtime's own identifiers are fixed elsewhere (REQ-MCP-010, REQ-CONFIG-181, REQ-MCP-116) and this domain names no package, vendor or product of its own. "Claude Code" names an external third-party assistant whose user-global settings may be imported read-only. All quoted strings, sizes, timeouts, and file layouts below are externally observable behavior.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`13-workspace-context-onboarding/`](13-workspace-context-onboarding/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](13-workspace-context-onboarding/01-requirements.md) | Requirements; Application Launch and File-Access Boundary; Startup Workspace Resolution and First-Launch Onboarding; Workspace Switching; Desktop Workspace and Branch Display; Workspace and Branch Label Rendering; Git Reading and Degradation | REQ-WORKSPACE-001 – REQ-WORKSPACE-033 (36) |
| [02](13-workspace-context-onboarding/02-workspace-state-directory-and-configuration.md) | Workspace State Directory and Configuration Layering; Workspace Context Injection (AGENTS.md); Portable Skill Discovery and Parsing (SKILL.md); Skill Catalog Injection and Load Policies; Skill Controls in Settings | REQ-WORKSPACE-034 – REQ-WORKSPACE-069 (36) |
| [03](13-workspace-context-onboarding/03-typeable-commands-from-skills-desktop-composer.md) | Typeable Commands from Skills (Desktop Composer); Project Initialization Framework; Registered Setup Task: Code-Intelligence Indexing; Workspace Classification (code vs non-code) | REQ-WORKSPACE-070 – REQ-WORKSPACE-101 (33) |
| [04](13-workspace-context-onboarding/04-initialization-ui-consent-and-run-gating-desktop.md) | Initialization UI, Consent, and Run Gating (Desktop); Workspace Hook Trust Gate; Hook Scope Fallback — Declining Preserves the User's Own Hooks; Desktop Hook Trust UI | REQ-WORKSPACE-102 – REQ-WORKSPACE-132 (31) |
| [05](13-workspace-context-onboarding/05-first-launch-provider-guidance-and-login.md) | First-Launch Provider Guidance and Login; Bundled-Build Machine Setup; Cross-Cutting Invariants | REQ-WORKSPACE-133 – REQ-WORKSPACE-153 (17) |
| [06](13-workspace-context-onboarding/06-data-formats.md) | Data & Formats; Persisted application settings; Workspace state directory `<workspace>/.rotaris/`; Hook digest payload; Merged workspace context (AGENTS.md); SKILL.md; Model-facing skill catalog block; Skill listing and force-loaded body; `.mcp.json`; Code-intelligence artifacts; Machine setup state; Minimal bootstrap `agents.yaml`; Provider snapshot | — |
| [07](13-workspace-context-onboarding/07-open-questions.md) | Open Questions | — |
