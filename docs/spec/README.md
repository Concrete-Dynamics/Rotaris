# Behavioral Specification Index

These documents state the observable behavior an independent implementation must provide. They are
the approved input to architecture and implementation work. They describe *what* must happen, never
how any other implementation achieves it.

- Behavioral target: `ROTARIS-CRW-001` (see [`../clean-room/reference-record.md`](../clean-room/reference-record.md))
- Status: **draft — gate decisions recorded, awaiting the sufficiency statement**
- Open questions: resolved per domain; decisions recorded in [`resolutions/`](resolutions/)
- Requirements: **3,950** identifiers across the 19 shipping domains, of which **258** are withdrawn
  in place, leaving **3,692** that carry live behavior. The two retired domains (17 and 18) hold a
  further **444** identifiers, **10** of them withdrawn in place; those are counted separately and
  are not part of the shipping total — **4,394** identifiers in all, **268** of them withdrawn.
  Every figure here counts identifiers, not behaviors: an identifier is never removed, so a
  withdrawn requirement keeps its number and keeps being counted. A total that rose while behavior
  was being removed rose because resolution minted new identifiers to carry rescued capabilities,
  not because more was specified. Every figure below is a count of the requirement definitions in
  each file, re-taken after the **measurement round**, which followed the defect-correction round,
  the ruling-application round, the storage-ruling round, the structural-ruling round and the sixth
  post-resolution reconciliation round (see [`../clean-room/provenance.md`](../clean-room/provenance.md)); each
  domain's identifiers run contiguously from 1 to its total, with no gap, no duplicate, and no
  number defined in more than one place.
  - The **structural-ruling round** applied SR-1 to SR-3 — one running instance, no session
    observable in a process this application does not own, and no polling. It withdrew 15
    identifiers and minted 4, so live behavior fell by 11 while the identifier space grew by 4.
  - The **storage-ruling round** applied SR-4 to SR-8 and ESC-11, ESC-13, ESC-15, ESC-16 and
    ESC-18, recorded in [`../architecture/owner-decisions.md`](../architecture/owner-decisions.md).
    Session-owned data moved from a fixed directory layout into a machine-local durable store, the
    export obligation widened from the event history to five records, the onefile portable gained a
    launch preparation, and two defects were corrected. It withdrew 6 identifiers and minted 7, so
    the identifier space grew by 7 and live behavior grew by 1 — the first round in this
    specification's history in which live behavior did not fall. Nothing behavioural was withdrawn
    with a mechanism: every guarantee carried by a withdrawn layout was re-homed to a named
    requirement first, and the re-homings are enumerated in `provenance.md`.
  - The **ruling-application round** applied every ruling that had been recorded and never made:
    ESC-1, ESC-2, ESC-5, ESC-6, ESC-7, ESC-8, ESC-13's withheld half, ESC-19, ESC-20, ESC-21 and
    SR-9, plus the ESC-11 gate follow-through. It **withdrew no identifier and minted 7**, so live
    behavior grew by 7: everything withdrawn in it was a clause or a vocabulary value inside a
    requirement that kept its number, and each such withdrawal is recorded *in place* rather than
    deleted, so a conformance-test author who has seen an earlier draft is told a value is gone. The
    round also swept all thirty rulings — ESC-1 to ESC-21 and SR-1 to SR-9 — against the corpus,
    because the round existed at all only because several rulings had been recorded as decided and
    then never applied, and nothing checked.
  - The **defect-correction round** answered an architecture pass that had read the amended corpus
    closely enough to implement it and returned twelve defects, ten of them the specification's. It
    **withdrew no identifier and minted one** — `REQ-CONFIG-478`, for what a fatal configuration
    load failure conveys and how a user recovers from it — so live behavior grew by 1. Everything
    else it changed was amended in place, and the three clause-level withdrawals it made (the batch
    wrapper's two-key inventory in `REQ-SESSION-189`, the second spelling of the busy
    integration-lock refusal in `REQ-GIT-124`, and the withdrawn export-document shapes in the
    retired domain 18) are each recorded *in place* with the withdrawn text quoted, so a
    conformance-test author who has seen an earlier draft is told which keys and which sentence are
    gone. Its governing rule was that a machine-readable contract has exactly one home: two
    contracts that had been stated twice — the batch trajectory wrapper and the record locator —
    were each given a single owning requirement, and every other statement of them in the corpus was
    turned into a citation or recorded as withdrawn.
  - The **measurement round** applied ESC-26 and closed one gap that measurement exposed. It
    **withdrew no identifier and minted one** — `REQ-EVENTS-179`, for a store that reports itself
    opened and then fails on the first operation issued against it, a case that fell between
    `REQ-EVENTS-084` (a store that cannot be opened) and `REQ-EVENTS-088` (a write that fails during
    a run) and belonged to neither — so live behavior grew by 1. `REQ-SESSION-197` was amended in
    place with the single restore-only, user-confirmed exception ESC-26 rules, and
    `REQ-SESSION-201`, `REQ-SESSION-089`, `REQ-EVENTS-084` and `REQ-EVENTS-088` were amended in
    place to name the boundaries the new identifier draws. Nothing was withdrawn, and no
    requirement's strength was reduced: the round narrows one absolute rule by one confirmed action
    and closes one hole.
- Clean-room audit: 6 domains clean, 15 with minor concerns, 0 contaminated — see
  [`../clean-room/specification-gate.md`](../clean-room/specification-gate.md)

Requirement identifiers are stable and permanent: `REQ-<DOMAIN>-<NNN>`. Once assigned, an ID is
never renumbered or reused. A changed requirement gets a new revision, not a new number.

## Domains

| # | Domain | Prefix | Reqs | Withdrawn | Priority |
|---|--------|--------|-----:|----------:|----------|
| 01 | [Multi-Agent Run Orchestration](01-run-orchestration.md) | `REQ-ORCH` | 156 | 1 | core |
| 02 | [Run Monitoring and Steering](02-run-monitoring-steering.md) | `REQ-MONITOR` | 305 | 12 | core |
| 03 | [Conversation, Composer, and Transcript](03-conversation-composer-transcript.md) | `REQ-CHAT` | 174 | 49 | core |
| 04 | [Model Providers, Sign-In, and Model Routing](04-model-providers-auth.md) | `REQ-PROVIDER` | 152 | 18 | core |
| 05 | [Agent Tooling, Terminal Execution, Permissions, and Approvals](05-tools-permissions-approvals.md) | `REQ-TOOLS` | 192 | 0 | core |
| 06 | [Git Integration, Worktrees, and Checkpoints](06-git-worktrees-checkpoints.md) | `REQ-GIT` | 161 | 8 | core |
| 07 | [Session Persistence, Resume, and Background Sessions](07-sessions-persistence.md) | `REQ-SESSION` | 201 | 22 | core |
| 08 | [Requirements Board and Traceability](08-requirements-traceability.md) | `REQ-TRACE` | 514 | 16 | core |
| 09 | [User-Defined Lifecycle Hook Commands](09-lifecycle-hooks.md) | `REQ-HOOKS` | 139 | 1 | core |
| 10 | [Command Sandboxing and Network Egress Policy](10-sandbox-network-egress.md) | `REQ-SANDBOX` | 130 | 1 | core |
| 11 | [Application Startup, Distribution, and Updates](11-startup-distribution-updates.md) | `REQ-STARTUP` | 168 | 11 | secondary |
| 12 | [Desktop Shell, Navigation, and Window Management](12-desktop-shell-windows.md) | `REQ-SHELL` | 168 | 4 | secondary |
| 13 | [Workspace Handling, Context Injection, and Project Onboarding](13-workspace-context-onboarding.md) | `REQ-WORKSPACE` | 153 | 17 | secondary |
| 14 | [Library, Artifacts, and Improvement Proposals](14-library-artifacts-improvements.md) | `REQ-LIBRARY` | 176 | 14 | secondary |
| 15 | [Settings and Configuration](15-settings-configuration.md) | `REQ-CONFIG` | 478 | 16 | secondary |
| 16 | [MCP Server Integration](16-mcp-integration.md) | `REQ-MCP` | 117 | 11 | secondary |
| 17 | [Interactive Terminal UI](17-terminal-ui.md) | `REQ-TUI` | 207 | 1 | **retired** |
| 18 | [Command-Line and Headless Entry Points](18-cli-headless.md) | `REQ-CLI` | 237 | 9 | **retired** |
| 19 | [Notifications, Error Handling, and Recovery](19-notifications-errors-recovery.md) | `REQ-NOTIFY` | 268 | 4 | secondary |
| 20 | [Machine-Readable Event Stream, Replay, and Trajectory Export](20-event-history-replay-export.md) | `REQ-EVENTS` | 179 | 39 | secondary |
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
