---
reference: ROTARIS-CRW-001
domain: notifications-errors-recovery
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Notifications, Error Handling, and Recovery

## Overview

This document states what Rotaris shows a user about the progress and outcome of work, and what it does when work does not succeed. It covers the two feedback channels and the rule for choosing between them; the content, identity and lifetime of a persistent notice; the vocabularies of run and child state that reach the screen; the classification of a failed run and the recovery each class offers; the bounded automatic recovery the runtime performs unprompted — provider fallback, quota waiting, transient retry, loop supervision, verification repair; the detection and repair of state left behind by a stopped process; and the obligations of each surface that reports any of this, namely the desktop window and the session’s own durable record.

Requirements are grouped by the scope of what they govern, from surfaces shared by everything, through a single run and the calls it makes, through delegated work and its evidence, through recovery of state after a crash, to the requirement-delivery surfaces, the workspace and machine configuration, and the application itself. Numeric values are defaults unless stated otherwise. Where a list has no observable order, it is given alphabetically or by ascending severity.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`19-notifications-errors-recovery/`](19-notifications-errors-recovery/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](19-notifications-errors-recovery/01-requirements.md) | Requirements; A1. Guarantees that bind every requirement below; A2. What every workflow makes visible; A3. Regions, controls and confirmations; A4. Choosing a channel; A5. Transient acknowledgements; A6. Persistent notices: fields, identity and lifetime; A7. Persistent notices: where and how they are drawn; A8. Which session a notice belongs to | REQ-NOTIFY-254 – REQ-NOTIFY-032 (53) |
| [02](19-notifications-errors-recovery/02-a9-what-a-notice-can-offer-the-user.md) | A9. What a notice can offer the user; B1. Authentication failures; B2. Failed runs: classification and the recovery each class offers; B3. Loop and stuck-state supervision; B4. Message limits; B5. Quota and usage limits | REQ-NOTIFY-044 – REQ-NOTIFY-263 (56) |
| [03](19-notifications-errors-recovery/03-b6-run-lifecycle-vocabulary-and-run-controls.md) | B6. Run lifecycle vocabulary and run controls; B7. Transient failures and bounded operations; C1. Child dependencies and terminal child states; C2. Child reports and re-delegation; C3. Verification evidence and completion gating; C4. Verification while a suite runs; D1. Checkpoints: listing, preview and restore | REQ-NOTIFY-048 – REQ-NOTIFY-198 (64) |
| [04](19-notifications-errors-recovery/04-d2-requirement-flows-abandoned-mid-run.md) | D2. Requirement flows abandoned mid-run; D3. Sessions left by a stopped process: detection; D4. Sessions left by a stopped process: repair and how it is announced; E1. Board refusals, blockers and standing banners; E2. Requirement units: failure and bounded retry; F1. Lifecycle hooks; F2. Optional components and degraded features; F3. Project initialization | REQ-NOTIFY-161 – REQ-NOTIFY-235 (66) |
| [05](19-notifications-errors-recovery/05-f4-providers-health-truthful-status-and.md) | F4. Providers: health, truthful status and settings-level recovery; G1. Application updates; G2. Window chrome and attention state | REQ-NOTIFY-199 – REQ-NOTIFY-253 (29) |
| [06](19-notifications-errors-recovery/06-data-formats.md) | Data & Formats; What a session records, as this document relies on it; Persistent notice shape; Notice action vocabulary; Status vocabularies; Report artifact read by a parent in place of a child transcript; Timeline and diagnostics entries produced by this domain; Reports whose information content is fixed and whose wording is not; Retry-after forms accepted from a provider; Structured-output format preference order; Configuration keys named in this document; Consolidated thresholds and timings | — |
| [07](19-notifications-errors-recovery/07-open-questions.md) | Open Questions | — |
