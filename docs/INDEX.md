# Rotaris — Documentation Index

> **TL;DR:** `architecture.md` = system design · `requirements/` = feature tracking (epics + `SWR-<n>` files, frontmatter `status`) · `research/` = investigation results · `reference/` = upstream SDK & competitor docs · `testing/test_strategy.md` = canonical testing policy

---

## Quick Jump

| Section                                         | What you'll find                                                   | Entry point                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **[Architecture](#architecture)**               | Structural & behavioural views of the system                       | [`architecture.md`](architecture.md)                                    |
| **[Requirements](#requirements)**               | Per-requirement feature specs & implementation state               | [`requirements/`](requirements/)                                        |
| **[Research](#research)**                       | Investigation results — prompt patterns, OMO, SDK internals        | [`research/RESEARCH_INDEX.md`](research/RESEARCH_INDEX.md)              |
| **[Glossary](terminology-glossary.md)**         | Codebase-specific domain terminology and source references         | [`terminology-glossary.md`](terminology-glossary.md)                    |
| **[Reference Materials](#reference-materials)** | Upstream SDK docs & competitor agent implementations               | [`reference/`](reference/)                                              |
| **[UI Development](#ui-development)**           | Textual framework patterns, style guide & production-ready widgets | [`ui-styleguide.md`](ui-styleguide.md) · [`ui-patterns/`](ui-patterns/) |
| **[Testing](#testing)**                         | Product-centred test policy and UI-specific standards              | [`testing/test_strategy.md`](testing/test_strategy.md)                  |

---

## Architecture

Canonical architectural documentation describing the **current** codebase — no aspirational or per-feature implementation state.
Organized around 16 perspectives; see [`architecture.md`](architecture.md) for the full index.

**Quick start:** [01 System Context](architecture/01-system-context.md) · [02 Code Topology](architecture/02-code-topology.md) · [14 E2E Trace](architecture/14-e2e-trace.md) · [16 Decision Record](architecture/16-decision-record.md)

| #   | Document                                                                    | What it answers                                                      |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | [`01-system-context.md`](architecture/01-system-context.md)                 | Who uses the system and what external systems connect                |
| 2   | [`02-code-topology.md`](architecture/02-code-topology.md)                   | Repository layout and package dependency graph                       |
| 3   | [`03-integration-protocol.md`](architecture/03-integration-protocol.md)     | Runtime handshake with the OpenHands SDK                             |
| 4   | [`04-contract-layers.md`](architecture/04-contract-layers.md)               | Formal interfaces separating concerns                                |
| 5   | [`05-data-flow.md`](architecture/05-data-flow.md)                           | How shared state propagates from producers to consumers              |
| 6   | [`06-event-bus.md`](architecture/06-event-bus.md)                           | Message passing: steering prompts, queued prompts, TUI updates       |
| 7   | [`07-routing-map.md`](architecture/07-routing-map.md)                       | CLI routing and TUI screen navigation                                |
| 8   | [`08-lifecycle-errors.md`](architecture/08-lifecycle-errors.md)             | Child task state machine and Ralph stop conditions                   |
| 9   | [`09-persona-branching.md`](architecture/09-persona-branching.md)           | How behavior differs per persona type                                |
| 10  | [`10-auth-boundaries.md`](architecture/10-auth-boundaries.md)               | Auth flows, secret storage, enforcement points                       |
| 11  | [`11-dependency-sharing.md`](architecture/11-dependency-sharing.md)         | Singleton vs. per-iteration vs. per-child isolation                  |
| 12  | [`12-service-classification.md`](architecture/12-service-classification.md) | Pattern and role of each module                                      |
| 13  | [`13-version-compatibility.md`](architecture/13-version-compatibility.md)   | Version gates and upgrade coordination rules                         |
| 14  | [`14-e2e-trace.md`](architecture/14-e2e-trace.md)                           | One complete user story traced through all layers                    |
| 15  | [`15-dev-prod-topology.md`](architecture/15-dev-prod-topology.md)           | Dev setup vs. end-user install                                       |
| 16  | [`16-decision-record.md`](architecture/16-decision-record.md)               | Key architectural decisions with rationale                           |
| —   | [`prompt-composition-matrix.md`](architecture/prompt-composition-matrix.md) | Which prompt sections are injected per persona × intent × model tier |
| —   | [`NOTE-2026-08-22-desktop-host-boundary.md`](architecture/NOTE-2026-08-22-desktop-host-boundary.md) | How the desktop observes and controls a run today, what to preserve in a rewrite (SWR-2453, SWR-2454) |

---

## Requirements

Per-requirement spec files with implementation tracking and status. Linked to code and tests via ReqToCode annotations (`@traces` / `@verifies`).

The store follows `docs/reference/reqtocode-blueprint.md`: one epic file per
feature area (`<block>-<epic-slug>.md`, req-id `SWR-<block>`) plus one file per
requirement in the epic's subfolder (`SWR-<n>-<slug>.md`). Every file carries
YAML frontmatter (`req-id`, `status: draft|approved|deprecated`, `trace`,
`test`, `title`). See [`requirements/README.md`](requirements/README.md).

| Date Range        | Topics Covered                                                     |
| ----------------- | ------------------------------------------------------------------ |
| 2026-04-13        | Orchestration, personas & config, tools, TUI core, NFR & policy    |
| 2026-04-13 (late) | Iterative bug fixes, session/task name hygiene tweaks              |
| 2026-04-14        | Implementation requirements across subsystems                      |
| 2026-04-15–17     | OMO prompt adaptation, slash commands, style guidelines            |
| 2026-04-18–25     | Agent engineer persona, session management, theme styling          |
| 2026-04-26–29     | OpenHands alignment, QA enhancements                               |
| 2026-04-30        | HAET overhaul — hash anchoring, snapshot IDs, edit recovery        |
| 2026-05-03        | Skill MD protocol, style-guided theme, quit hardening              |
| 2026-05-09–06-03  | Runtime hardening, model/provider UX, diagnostics, tool truncation |

**Finding the right file:** Start from the epic that matches the feature area, then scan its index table inside the epic file. Each requirement file covers one atomic, testable behavior.

---

## Glossary

Use [`terminology-glossary.md`](terminology-glossary.md) when you need the local
meaning of a Rotaris term and direct source references showing where it is applied.

---

## Research

Investigation results from competitor analysis, SDK reverse-engineering, and experimental feature feasibility studies.

**Overview:** [`research/RESEARCH_INDEX.md`](research/RESEARCH_INDEX.md)

### Markt- & Wettbewerbsanalyse

| Document                                                                                                     | Scope                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`research/marktanalyse-agentic-harnesses-2026-08.md`](research/marktanalyse-agentic-harnesses-2026-08.md) | Gap-Analyse gegen die OpenRouter-Top-Harnesses (2026-08): P0-Must-have-Abgleich, Differenzierungs-Check (ReqToCode als USP), priorisierte Roadmap |

### System Prompt Patterns

Research on how major OSS agent projects structure their system prompts.

| Document                                                                                                                           | Scope                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`research/system-prompt-research/AGENT_PROMPTS_RESEARCH.md`](research/system-prompt-research/AGENT_PROMPTS_RESEARCH.md)           | Comprehensive — full prompt texts from OpenHands, Aider, SWE-agent, Goose (≈800 LOC) |
| [`research/system-prompt-research/PROMPT_PATTERNS_SUMMARY.md`](research/system-prompt-research/PROMPT_PATTERNS_SUMMARY.md)         | Quick reference — top 10 patterns with code examples & GitHub permalinks             |
| [`research/system-prompt-research/PROMPT_IMPLEMENTATION_GUIDE.md`](research/system-prompt-research/PROMPT_IMPLEMENTATION_GUIDE.md) | How to apply the patterns to Rotaris personas                                      |

### Ongoing Memory Operations (OMO)

Deep-dive into OpenHands's OMO mechanism — architecture audit, gap analysis, implementation plan, and mapping to Rotaris personas.

| Document                                                                                             | Focus                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [`research/omo/OMO_AGENT_ARCHITECTURE_RESEARCH.md`](research/omo/OMO_AGENT_ARCHITECTURE_RESEARCH.md) | OpenHands OMO internals & agent lifecycle  |
| [`research/omo/OMO_AGENT_MAPPING.md`](research/omo/OMO_AGENT_MAPPING.md)                             | Mapping OMO concepts to Rotaris personas |
| [`research/omo/OMO_AUDIT_FINDINGS.md`](research/omo/OMO_AUDIT_FINDINGS.md)                           | Gap audit against current implementation   |
| [`research/omo/OMO_GAPS_ANALYSIS.md`](research/omo/OMO_GAPS_ANALYSIS.md)                             | Detailed gap breakdown & priorities        |
| [`research/omo/OMO_IMPLEMENTATION_PLAN.md`](research/omo/OMO_IMPLEMENTATION_PLAN.md)                 | Step-by-step implementation roadmap        |
| [`research/omo/OMO_IMPLEMENTATION_COMPLETE.md`](research/omo/OMO_IMPLEMENTATION_COMPLETE.md)         | Post-implementation verification           |
| [`research/omo/OMO_RESEARCH_INDEX.md`](research/omo/OMO_RESEARCH_INDEX.md)                           | OMO-specific navigation & quick links      |
| [`research/omo/OMO_RESEARCH_SUMMARY.md`](research/omo/OMO_RESEARCH_SUMMARY.md)                       | Executive summary of OMO findings          |

### Provider Feasibility

Investigation into candidate new providers before they become formal requirements.

| Document                                                                                                                     | Scope                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`research/claude-code-subscription-provider/RESEARCH_PLAN.md`](research/claude-code-subscription-provider/RESEARCH_PLAN.md) | Running a private local harness against a Claude Code / Claude subscription (Agent SDK + OAuth) instead of API billing; open questions for fitting it into Rotaris's provider architecture |

### Legacy Manifests

| File                                                               | Purpose                                             |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| [`research/RESEARCH_MANIFEST.txt`](research/RESEARCH_MANIFEST.txt) | Timestamped log of research sessions & deliverables |

---

## Reference Materials

External documentation and competitive agent architecture snapshots for situational
awareness. These are reference snapshots, not canonical Rotaris architecture;
when SDK-adjacent code changes, verify them against the installed dependency and
upstream docs before relying on details.

| Document                                                                             | Source        | Topic                                                                              |
| ------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------- |
| [`reference/OPENHANDS_SDK_ARCHITECTURE.md`](reference/OPENHANDS_SDK_ARCHITECTURE.md) | OpenHands SDK | Internal architecture — Agent, AgentContext, LLM, LocalConversation, tool registry |
| [`reference/OPENCODE_AGENTS_REFERENCE.md`](reference/OPENCODE_AGENTS_REFERENCE.md)   | OpenCode      | Competitive agent project reference — architecture & design decisions              |

### Build & distribution

Rotaris runbooks (canonical, unlike the snapshots above).

| Document                                                                   | What it answers                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`reference/building-standalone.md`](reference/building-standalone.md)     | How the downloadable binaries are built per platform, and what the bundle must carry   |
| [`reference/releasing.md`](reference/releasing.md)                         | How a tag becomes a GitHub Release and a PyPI publish, and what to do when one fails   |
| [`reference/updating.md`](reference/updating.md)                           | How an installed copy finds a newer release, what it downloads, and what verified means |
| [`reference/reqtocode-playbook.md`](reference/reqtocode-playbook.md)       | What to do when a ReqToCode check fails                                                |

---

## UI Development

Documentation for building and maintaining the Textual-based TUI and the Rotaris desktop app.

### Design Systems

| Resource                                                                                           | Content                                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Rotaris Design System](https://claude.ai/design/p/13d7ad0d-cb06-4e6e-b6ec-06f25615a7d7?via=share) | Visual design system for the Rotaris desktop app (PySide6) — colors, typography, spacing, components |

### Style Guide

| Document                               | Content                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ui-styleguide.md`](ui-styleguide.md) | Single source of truth for all TUI visual decisions — principles, tokens, components, states, animations, layout, accessibility, anti-patterns |

### Production Patterns

| Document                                                             | Content                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`ui-patterns/TEXTUAL_PATTERNS.md`](ui-patterns/TEXTUAL_PATTERNS.md) | Reactivity, screens, themes, widget composition — production-grade Textual v8.2.1 patterns |

## Testing

| Document                                                                     | Content                                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`testing/test_strategy.md`](testing/test_strategy.md)                       | Canonical product-centred policy for unit, integration, hermetic user-flow E2E, capability tests, and ReqToCode portfolios |
| [`testing/textualize_testing_guide.md`](testing/textualize_testing_guide.md) | TUI-specific full-workflow, alternative-path, and random-interaction rules                                                 |
| [`../tests/AGENTS.md`](../tests/AGENTS.md)                                   | Executable test locations, fixtures, annotations, and commands                                                             |
| [`testing/sandbox-verification-protocol.md`](testing/sandbox-verification-protocol.md) | Manual protocol for verifying the OS-level sandbox (SWR-2507) on WSL2 and macOS — **written, not yet executed** |

---

## Document Lifecycle

```
idea → proposal/           Create a blueprint
       ↓
requirements/              Capture concrete requirements
  <block>-<epic>.md        Epic overview + index + history
  <block>-<epic>/SWR-*.md  One requirement per file (frontmatter status)
       ↓
research/                  Investigate feasibility & patterns
       ↓
reference/                 Gather upstream/competitor context
       ↓
implementation in code     Track via ReqToCode annotations
       ↓
requirement status → approved              Mark done
       ↓
proposal closed            Archive or close
```

Rules:

- **Requirements belong in** [`requirements/`](requirements/), nowhere else.
- **Implementation state lives in** requirement frontmatter `status` plus ReqToCode annotations (`@traces` / `@verifies`) — never embed progress logs in requirement files.
- **After changing a requirement's status,** update the `status` field in its frontmatter (files never move or get renumbered).
- **Architectural docs describe the CURRENT system** — not aspirational, not per-feature.
- **Proposals stay open** until accepted/rejected. Close them with a resolution note.
