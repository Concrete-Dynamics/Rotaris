---
req-id: SWR-386
status: approved
title: Tier-aware coding-agent delegation guidance
epic: SWR-300
date: 2026-07-22
---

# Tier-aware coding-agent delegation guidance

The rendered orchestrator system prompt must surface the configured coding-agent
model tier under the `coding-agent` entry in `DELEGATES_SECTION` and provide
tier-specific task-sizing guidance.

- `large_model` guidance permits one cohesive end-to-end feature implementation,
  including cross-module changes and verification.
- `medium_model` guidance permits normal feature, bug-fix, and refactor slices
  spanning related files and tests.
- `small_model` guidance requires narrow, well-specified implementation slices and
  decomposition of broad work into ordered, non-overlapping tasks.
- A custom or ambiguous model assignment must be reported truthfully and receive
  conservative, bounded guidance rather than a guessed tier.

Tier detection must preserve the persona's original startup-slot alias even when
multiple slots resolve to the same concrete model or thinking overrides synthesize
a runtime model entry. Provider-specific model names and benchmark claims must not
be hard-coded into the prompt.

Related: [SWR-2416 — Persona × intent × model-tier prompt composition](SWR-2416-prompt-composition-matrix.md)
generalizes this requirement into a full persona × intent × tier prompt composition matrix.
The tier-detection and truthful-reporting rules above remain authoritative for both.
