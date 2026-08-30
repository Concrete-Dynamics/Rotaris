# Behavioral Specification Index

These documents state the observable behavior an independent implementation must provide. They are
the approved input to architecture and implementation work. They describe *what* must happen, never
how any other implementation achieves it.

- Behavioral target: `ROTARIS-CRW-001` (see [`../clean-room/reference-record.md`](../clean-room/reference-record.md))
- Status: **draft — gate decisions recorded, awaiting the sufficiency statement**
- Open questions: resolved per domain; decisions recorded in [`resolutions/`](resolutions/)
- Requirements: **4,182** across 21 domains
- Clean-room audit: 6 domains clean, 15 with minor concerns, 0 contaminated — see
  [`../clean-room/specification-gate.md`](../clean-room/specification-gate.md)

Requirement identifiers are stable and permanent: `REQ-<DOMAIN>-<NNN>`. Once assigned, an ID is
never renumbered or reused. A changed requirement gets a new revision, not a new number.

## Domains

| # | Domain | Prefix | Reqs | Priority |
|---|--------|--------|-----:|----------|
| 01 | [Multi-Agent Run Orchestration](01-run-orchestration.md) | `REQ-ORCH` | 149 | core |
| 02 | [Run Monitoring and Steering](02-run-monitoring-steering.md) | `REQ-MONITOR` | 298 | core |
| 03 | [Conversation, Composer, and Transcript](03-conversation-composer-transcript.md) | `REQ-CHAT` | 157 | core |
| 04 | [Model Providers, Sign-In, and Model Routing](04-model-providers-auth.md) | `REQ-PROVIDER` | 139 | core |
| 05 | [Agent Tooling, Terminal Execution, Permissions, and Approvals](05-tools-permissions-approvals.md) | `REQ-TOOLS` | 186 | core |
| 06 | [Git Integration, Worktrees, and Checkpoints](06-git-worktrees-checkpoints.md) | `REQ-GIT` | 151 | core |
| 07 | [Session Persistence, Resume, and Background Sessions](07-sessions-persistence.md) | `REQ-SESSION` | 181 | core |
| 08 | [Requirements Board and Traceability](08-requirements-traceability.md) | `REQ-TRACE` | 500 | core |
| 09 | [User-Defined Lifecycle Hook Commands](09-lifecycle-hooks.md) | `REQ-HOOKS` | 135 | core |
| 10 | [Command Sandboxing and Network Egress Policy](10-sandbox-network-egress.md) | `REQ-SANDBOX` | 125 | core |
| 11 | [Application Startup, Distribution, and Updates](11-startup-distribution-updates.md) | `REQ-STARTUP` | 152 | secondary |
| 12 | [Desktop Shell, Navigation, and Window Management](12-desktop-shell-windows.md) | `REQ-SHELL` | 159 | secondary |
| 13 | [Workspace Handling, Context Injection, and Project Onboarding](13-workspace-context-onboarding.md) | `REQ-WORKSPACE` | 147 | secondary |
| 14 | [Library, Artifacts, and Improvement Proposals](14-library-artifacts-improvements.md) | `REQ-LIBRARY` | 164 | secondary |
| 15 | [Settings and Configuration](15-settings-configuration.md) | `REQ-CONFIG` | 460 | secondary |
| 16 | [MCP Server Integration](16-mcp-integration.md) | `REQ-MCP` | 107 | secondary |
| 17 | [Interactive Terminal UI](17-terminal-ui.md) | `REQ-TUI` | 206 | **retired** |
| 18 | [Command-Line and Headless Entry Points](18-cli-headless.md) | `REQ-CLI` | 228 | **retired** |
| 19 | [Notifications, Error Handling, and Recovery](19-notifications-errors-recovery.md) | `REQ-NOTIFY` | 262 | secondary |
| 20 | [Machine-Readable Event Stream, Replay, and Trajectory Export](20-event-history-replay-export.md) | `REQ-EVENTS` | 167 | secondary |
| 21 | [Installed UI Performance Benchmark Command](21-ui-performance-benchmark.md) | `REQ-UIBENCH` | 109 | peripheral |

Domains 17 and 18 are **retired**. The product is one Electron desktop application; it has no
command-line interface and no terminal user interface. Every capability those documents carried
that a user needs is restated as desktop behavior in the domain that owns it, and the
`REQ-TUI` and `REQ-CLI` identifiers are withdrawn and never reused.

Priority reflects centrality to the product, not implementation order. Implementation order is an
architecture-gate decision.

## How these were produced

Each domain was analyzed by an isolated agent with reference access, whose raw findings were written
to a sealed area outside this repository. A separate gateway agent, which never saw the reference,
converted exactly one sealed findings file into the specification here. Further passes compared each
specification against the reference for copied phrasing, internal identifiers, and implementation
detail, and rewrote what they found. A final read-only pass adjudicated the result without editing
it. No agent that read the reference wrote a specification, and no specification author had
reference access.

## Reading a specification

Each file carries frontmatter naming the behavioral target and its draft status, an overview, the
numbered requirements grouped by subtopic, a data and formats section describing externally
observable shapes, and open questions.

**Open Questions are load-bearing.** They record behavior that could not be determined, conflicting
values that need a canonical choice, and scope decisions. They are inputs to the Specification Gate,
not footnotes.
