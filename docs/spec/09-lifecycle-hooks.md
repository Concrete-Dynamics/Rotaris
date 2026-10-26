---
reference: ROTARIS-CRW-001
domain: lifecycle-hooks
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# User-Defined Lifecycle Hook Commands

## Overview

Users can attach shell commands ("hooks") to named points during a run: around tool calls, and at session, iteration, child-agent, and verifier boundaries. Every hook is handed a secret-masked JSON description of what happened on standard input, is given a wall-clock budget to finish in, and answers with its exit status. Only a hook attached to the point before a tool call is capable of stopping anything. Hooks are declared in layered YAML configuration; commands declared by a repository stay inert until the user reviews and approves them; hooks configured for an external agent can optionally be imported; and every invocation is recorded both in session diagnostics and on the event stream.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`09-lifecycle-hooks/`](09-lifecycle-hooks/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](09-lifecycle-hooks/01-requirements.md) | Requirements; Event Model; Configuration Schema and Validation; Configuration Layering and Provenance; Hook Identity and Ordering; Matcher Semantics; Execution Engine; Exit-Code Semantics and Blocking | REQ-HOOKS-001 – REQ-HOOKS-048 (48) |
| [02](09-lifecycle-hooks/02-message-formats-agent-and-user-visible.md) | Message Formats (Agent- and User-Visible); Failure Budget and Auto-Disable; Payload Content and Redaction; Tool-Dispatch Integration; Lifecycle Event Delivery; Run Wiring, Notices, Teardown | REQ-HOOKS-049 – REQ-HOOKS-089 (41) |
| [03](09-lifecycle-hooks/03-workspace-trust-gate.md) | Workspace Trust Gate; Scope Fallback on Refusal; Untrusted-Hooks Notice Hygiene; Desktop Settings and Review Dialog | REQ-HOOKS-090 – REQ-HOOKS-138 (23) |
| [04](09-lifecycle-hooks/04-external-agent-hook-import-claude-code.md) | External-Agent Hook Import (Claude Code); Persistence, Audit, Diagnostics; Wire Events; Cross-Cutting Invariants; Performance Contracts | REQ-HOOKS-110 – REQ-HOOKS-139 (27) |
| [05](09-lifecycle-hooks/05-data-formats.md) | Data & Formats; Configuration (YAML); Hook stdin payload (JSON, UTF-8, one object); Trust decision file; External-hooks policy file; Session diagnostics; Wire events (session stream); Environment variables | — |
| [06](09-lifecycle-hooks/06-open-questions.md) | Open Questions | — |
