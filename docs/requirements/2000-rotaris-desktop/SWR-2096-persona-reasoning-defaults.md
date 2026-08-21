---
req-id: SWR-2096
status: approved
trace: required
test: required
type: product
title: "Distinct persona reasoning defaults"
epic: SWR-2000
date: 2026-07-22
---

# SWR-2096 — Distinct persona reasoning defaults

Persona reasoning settings MUST expose distinct **Default** and **Provider default**
choices plus supported normalized effort levels.

## Acceptance criteria

- Default inherits reasoning configured for selected model or model slot in Models.
- Provider default explicitly clears reasoning effort, including framework defaults.
- Low, Medium, High, and Max delegate provider-specific translation to LiteLLM;
  Max maps only to LiteLLM's normalized `xhigh` spelling.
- Choices follow LiteLLM model capability metadata. `auto` is not exposed as effort.
- Custom OpenAI-compatible dialects may define a per-model `reasoning_effort_map`
  while native providers require no Rotaris provider mapping.

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
