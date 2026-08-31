# Behavioral Specification Index

These documents state the observable behavior an independent implementation must provide. They are
the approved input to architecture and implementation work. They describe *what* must happen, never
how any other implementation achieves it.

- Behavioral target: `ROTARIS-CRW-001` (see [`../clean-room/reference-record.md`](../clean-room/reference-record.md))
- Status: **draft — gate decisions recorded, awaiting the sufficiency statement**
- Open questions: resolved per domain; decisions recorded in [`resolutions/`](resolutions/)
- Requirements: **3,930** identifiers across the 19 shipping domains, of which **237** are withdrawn
  in place, leaving **3,693** that carry live behavior. The two retired domains (17 and 18) hold a
  further **444** identifiers, **10** of them withdrawn in place; those are counted separately and
  are not part of the shipping total — **4,374** identifiers in all, **247** of them withdrawn.
  Every figure here counts identifiers, not behaviors: an identifier is never removed, so a
  withdrawn requirement keeps its number and keeps being counted. A total that rose while behavior
  was being removed rose because resolution minted new identifiers to carry rescued capabilities,
  not because more was specified. Every figure below is a count of the requirement definitions in
  each file, re-taken after the sixth and last post-resolution reconciliation round (see
  [`../clean-room/provenance.md`](../clean-room/provenance.md)); each domain's identifiers run
  contiguously from 1 to its total, with no gap, no duplicate, and no number defined in more than
  one place.
- Clean-room audit: 6 domains clean, 15 with minor concerns, 0 contaminated — see
  [`../clean-room/specification-gate.md`](../clean-room/specification-gate.md)

Requirement identifiers are stable and permanent: `REQ-<DOMAIN>-<NNN>`. Once assigned, an ID is
never renumbered or reused. A changed requirement gets a new revision, not a new number.

## Domains

| # | Domain | Prefix | Reqs | Withdrawn | Priority |
|---|--------|--------|-----:|----------:|----------|
| 01 | [Multi-Agent Run Orchestration](01-run-orchestration.md) | `REQ-ORCH` | 156 | 1 | core |
| 02 | [Run Monitoring and Steering](02-run-monitoring-steering.md) | `REQ-MONITOR` | 305 | 7 | core |
| 03 | [Conversation, Composer, and Transcript](03-conversation-composer-transcript.md) | `REQ-CHAT` | 174 | 49 | core |
| 04 | [Model Providers, Sign-In, and Model Routing](04-model-providers-auth.md) | `REQ-PROVIDER` | 152 | 18 | core |
| 05 | [Agent Tooling, Terminal Execution, Permissions, and Approvals](05-tools-permissions-approvals.md) | `REQ-TOOLS` | 192 | 0 | core |
| 06 | [Git Integration, Worktrees, and Checkpoints](06-git-worktrees-checkpoints.md) | `REQ-GIT` | 161 | 8 | core |
| 07 | [Session Persistence, Resume, and Background Sessions](07-sessions-persistence.md) | `REQ-SESSION` | 196 | 17 | core |
| 08 | [Requirements Board and Traceability](08-requirements-traceability.md) | `REQ-TRACE` | 512 | 16 | core |
| 09 | [User-Defined Lifecycle Hook Commands](09-lifecycle-hooks.md) | `REQ-HOOKS` | 139 | 1 | core |
| 10 | [Command Sandboxing and Network Egress Policy](10-sandbox-network-egress.md) | `REQ-SANDBOX` | 129 | 1 | core |
| 11 | [Application Startup, Distribution, and Updates](11-startup-distribution-updates.md) | `REQ-STARTUP` | 160 | 11 | secondary |
| 12 | [Desktop Shell, Navigation, and Window Management](12-desktop-shell-windows.md) | `REQ-SHELL` | 168 | 4 | secondary |
| 13 | [Workspace Handling, Context Injection, and Project Onboarding](13-workspace-context-onboarding.md) | `REQ-WORKSPACE` | 153 | 17 | secondary |
| 14 | [Library, Artifacts, and Improvement Proposals](14-library-artifacts-improvements.md) | `REQ-LIBRARY` | 175 | 14 | secondary |
| 15 | [Settings and Configuration](15-settings-configuration.md) | `REQ-CONFIG` | 476 | 16 | secondary |
| 16 | [MCP Server Integration](16-mcp-integration.md) | `REQ-MCP` | 117 | 11 | secondary |
| 17 | [Interactive Terminal UI](17-terminal-ui.md) | `REQ-TUI` | 207 | 1 | **retired** |
| 18 | [Command-Line and Headless Entry Points](18-cli-headless.md) | `REQ-CLI` | 237 | 9 | **retired** |
| 19 | [Notifications, Error Handling, and Recovery](19-notifications-errors-recovery.md) | `REQ-NOTIFY` | 268 | 4 | secondary |
| 20 | [Machine-Readable Event Stream, Replay, and Trajectory Export](20-event-history-replay-export.md) | `REQ-EVENTS` | 178 | 28 | secondary |
| 21 | [UI Performance Benchmark](21-ui-performance-benchmark.md) | `REQ-UIBENCH` | 119 | 14 | peripheral |

"Reqs" is the count of identifiers a domain defines; "Withdrawn" is how many of those are withdrawn
in place, retaining their number while carrying no behavior. Subtracting the second from the first
gives the live behavior a domain states.

Domains 17 and 18 are **retired**. The product is one Electron desktop application; it has no
command-line interface and no terminal user interface. Every capability those documents carried
that a user needs is restated as desktop behavior in the domain that owns it, and the
`REQ-TUI` and `REQ-CLI` identifiers are withdrawn and never reused. Both series are **closed**: no
further identifier may be added to either document, and an identifier minted into one of them after
the retirement decision is withdrawn on that ground alone, pointing at the desktop requirement that
carries the capability. Their counts are listed above so the identifier space stays auditable, and
are excluded from the shipping total.

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
