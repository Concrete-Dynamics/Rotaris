---
reference: ROTARIS-CRW-001
domain: model-providers-auth
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Model Providers, Sign-In, and Model Routing

## Overview

Rotaris connects to a fixed set of AI model providers plus user-defined OpenAI-compatible endpoints. Users sign in per provider using a device-code flow, a browser authorization-code-with-PKCE flow, or a pasted API key/token; credentials are persisted per provider in a per-user credential store, transparently refreshed, and never written to logs, config snapshots, or workspace files. After sign-in, the product discovers each provider's model catalog over the wire (or from a fixed offline list), persists the discovered catalog to a per-user snapshot, automatically assigns models to small/medium/large capability slots, and merges the snapshot into the effective configuration at load time. The desktop interface exposes sign-in, sign-out, provider settings, catalog refresh, model slot assignment, subscription usage, and hosted-account credit displays with the information content, timeouts, and error classifications specified below. The product has no command-line entry point and no text-mode interface of its own: every user-facing surface named in this document is reached from the desktop window.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`04-model-providers-auth/`](04-model-providers-auth/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](04-model-providers-auth/01-requirements.md) | Requirements; Provider Catalog and Transparency Metadata; Sign-In Methods, Token Model, and Status Classification; Credential Persistence — Location, Format, Protection; GitHub Copilot Sign-In (Device Code + Session Exchange); OpenAI Codex Sign-In (Authorization Code + PKCE); Rotaris Cloud Sign-In (OIDC PKCE, Coming-Soon Gating); Claude Code Subscription Provider (Pasted Token, Local Runtime) | REQ-PROVIDER-001 – REQ-PROVIDER-049 (50) |
| [02](04-model-providers-auth/02-deepseek-and-openai-compatible-endpoints-api.md) | DeepSeek and OpenAI-Compatible Endpoints (API Keys, Labelled Instances); Credential Lifecycle (Get, Renew, Sign-Out, Errors); Credential Bridges and Key Hygiene; Run-Time Credential Priming and Transparent Refresh; Model Discovery (Catalog Sync); Known Token Limits and Normalization; Automatic Slot Selection from a Discovered Catalog | REQ-PROVIDER-050 – REQ-PROVIDER-083 (36) |
| [03](04-model-providers-auth/03-providermodel-snapshot-persistence-on-disk.md) | Provider/Model Snapshot Persistence (On-Disk Catalog); Configuration: Model Slots, Routing Fields, Snapshot Merge; Provider Sign-In Flow; Sign-Out, Provider Management, Catalog Refresh; Retired Terminal-UI Surfaces | REQ-PROVIDER-084 – REQ-PROVIDER-115 (32) |
| [04](04-model-providers-auth/04-desktop-application-surfaces.md) | Desktop Application Surfaces; Subscription Usage Endpoints and Rendering; Rotaris Cloud Account Credit | REQ-PROVIDER-116 – REQ-PROVIDER-130 (23) |
| [05](04-model-providers-auth/05-cross-cutting-invariants.md) | Cross-Cutting Invariants | REQ-PROVIDER-131 – REQ-PROVIDER-152 (11) |
| [06](04-model-providers-auth/06-data-formats.md) | Data & Formats; Stored credential file (per provider); Provider/model snapshot; Identifiers; Copilot gateway staging files; Discovery response (consumed contract); Subscription usage payloads (consumed contracts); Cloud account credit payload (consumed contract); Rendering formats; Workspace bootstrap | — |
| [07](04-model-providers-auth/07-open-questions.md) | Open Questions | — |
