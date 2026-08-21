---
req-id: SWR-3216
status: approved
trace: required
test: required
title: "Board projection API"
type: technical
derived-from: SWR-3201
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3216 — Board projection API

The user interface must not parse CLI output, re-implement health rules, or
reach into the delivery store's file layout — those are three different ways for
the board to start disagreeing with the engine. The desktop app and the TUI both
need the same answers, and the engine is where they are computed.

Requirement: one read API in `rotaris_core` returns the complete board
projection — per requirement: canonical fields, lifecycle, delivery state,
health, evidence health per obligation with its detail records, execution
summary, blockers and relations; per epic: its aggregation. The API is
side-effect free, returns plain serialisable objects, and is the only surface
the UI layers consume.

## Test coverage

Unit tests cover the projection's shape and its serialisability, and assert that
calling it performs no write. An integration test builds the projection over
this repository's store and asserts one entry per requirement. A guard test
asserts that no module under `apps/rotaris/src/` invokes a ReqToCode or verifier
CLI, which is what SWR-3311 depends on. The originating product flow enabled by
`derived-from` is the board itself (SWR-3302).

Derived from: [SWR-3201 — Requirement delivery state](SWR-3201-delivery-state-model.md)

Derived requirements: [SWR-3223 — One board pass costs no more than linear in the store](SWR-3223-board-pass-cost-is-linear.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
