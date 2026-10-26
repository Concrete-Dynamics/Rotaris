---
reference: ROTARIS-CRW-001
domain: tools-permissions-approvals
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Agent Tooling, Terminal Execution, Permissions, and Approvals

## Overview

Every tool call an agent makes — built-in, custom plugin, or MCP — passes through a single permission gate that resolves to allow, ask, or deny before anything executes; asks are answered by an interactive approval prompt or a fail-safe headless policy, denials are returned to the agent as recoverable tool errors, and every decision is recorded to an append-only per-session audit trail with secrets redacted. Around that gate sits a fixed public tool surface (terminal execution with foreground and background sessions, workspace-fenced file and search tools, a local commit tool, task-list, artifact, delegation, and user-question tools), an opt-in OS-level sandbox that refuses to run commands rather than silently falling back, a host-classifying network egress policy for the fetch tool, and three permission-mode presets ordered by restrictiveness with an automatic downgrade for unattended, unsandboxed runs.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`05-tools-permissions-approvals/`](05-tools-permissions-approvals/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](05-tools-permissions-approvals/01-requirements.md) | Requirements; 1. Public Tool Surface and Persona Grants; 2. Central Permission Gate; 3. Terminal Command-Line Pattern Matching | REQ-TOOLS-001 – REQ-TOOLS-040 (40) |
| [02](05-tools-permissions-approvals/02-4-permission-mode-presets.md) | 4. Permission Mode Presets; 5. Interactive Approval Flow; 6. Headless / Unattended Resolution; 7. Effective Mode, Downgrade, and Mid-Session Change | REQ-TOOLS-041 – REQ-TOOLS-077 (37) |
| [03](05-tools-permissions-approvals/03-8-permission-audit-trail.md) | 8. Permission Audit Trail; 9. Network Egress Policy and the fetch Tool | REQ-TOOLS-078 – REQ-TOOLS-094 (17) |
| [04](05-tools-permissions-approvals/04-10-terminal-tool-foreground-execution.md) | 10. Terminal Tool — Foreground Execution; 11. Terminal Tool — Background Sessions; 12. Terminal Outcome Classification; 13. OS-Level Sandbox | REQ-TOOLS-095 – REQ-TOOLS-125 (32) |
| [05](05-tools-permissions-approvals/05-14-terminal-live-streaming.md) | 14. Terminal Live Streaming; 15. Workspace File Tools and the Path Fence; 16. Search Tools (grep, glob); 17. Local Git Tools; 18. Task-List Tool (todo) | REQ-TOOLS-126 – REQ-TOOLS-147 (25) |
| [06](05-tools-permissions-approvals/06-19-artifact-tools.md) | 19. Artifact Tools; 20. Delegation Tools; 21. User-Question Tool (ask_questions); 22. Verification-Gate Capabilities (Outside the Public Tool Surface) | REQ-TOOLS-148 – REQ-TOOLS-190 (14) |
| [07](05-tools-permissions-approvals/07-23-custom-tool-plugins.md) | 23. Custom Tool Plugins; 24. MCP Server Grants and Per-Persona Narrowing; 25. Secret Redaction; 26. Cross-Cutting Ordering, Isolation, and Lifecycle; 27. Event-Stream Integration; 28. Desktop Surfaces | REQ-TOOLS-161 – REQ-TOOLS-192 (28) |
| [08](05-tools-permissions-approvals/08-data-formats.md) | Data & Formats; Where this domain's material is kept (workspace-observable); Record shapes; Configuration key reference (behavioral defaults); Limits and timing inventory (defaults) | — |
| [09](05-tools-permissions-approvals/09-open-questions.md) | Open Questions | — |
