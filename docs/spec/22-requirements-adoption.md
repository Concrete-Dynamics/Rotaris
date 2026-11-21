---
reference: ROTARIS-CRW-001
domain: requirements-adoption
date: 2026-10-29
status: decided at the owner's ask under R-088 (PD-TRACE-001); not derived
---

# Requirements Adoption Assistant

> **Decided, not derived.** Every identifier in this domain was minted on 2026-10-29 at the owner's explicit ask,
> logged as [R-088](../product/requests.md#r-088), and carries behaviour the behavioural target never had. The
> domain exists because [`PD-TRACE-001`](../product/directives/pd-trace-001.md#pd-trace-001) narrows REQ-TRACE-155's
> "no project-structure detection and no configuration-scaffolding operation" for this one surface; outside it
> REQ-TRACE-155 governs in full. The amendment is recorded in
> [`resolutions/22-requirements-adoption.md`](resolutions/22-requirements-adoption.md).

## Overview

A project opened in the desktop application may keep its requirements in a shape that matches nothing the
traceability toolchain reads: Markdown whose identifiers sit in headings or bold bullets rather than in an
identifier block, an identifier family other than the default, implementation and test roots elsewhere than the
default layout's, and annotations written in the project's own vocabulary. The **adoption assistant** brings such a
project in. It is **not** a fifth toolchain operation (REQ-TRACE-155 keeps the four of REQ-TRACE-508 to
REQ-TRACE-511 as the whole of what the toolchain offers): it is a separate surface on the requirements board that
*produces* what the toolchain already consumes — the layout configuration of REQ-TRACE-040, its
`annotation_conventions` entries (REQ-TRACE-073), and a record of the requirements it found.

The assistant works in three steps. A **detection pass** reads the open workspace, by script and without a model,
and reports what it found and what it could not decide. An **adapter** is then composed from the detection result
and one model interpretation, validated field by field, and **executed** against the workspace to extract the
requirements it describes. Its result is **recorded** in the workspace scope directory, so that every later opening
of the board compares the project as it now stands against the recorded set and names the requirements that are
**new**, **changed** and **removed** since — new requirements added to the codebase being the case the surface
exists for. Opening the board is a read: nothing is written and no model is consulted by looking.

## Parts

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](22-requirements-adoption/01-requirements.md) | The surface; The detection pass; The adapter; Executing and recording; The comparison on opening; Progress and refusal; The surveyed shape; The survey; The board through a shape; Write-back; Staying current | REQ-ADOPT-001 – REQ-ADOPT-052 (52) |
| [02](22-requirements-adoption/02-data-formats.md) | Data & Formats; The detection result; The interpretation; The adoption record; The comparison; The shape; The shape record; The survey's actions and its preview | — |

Since 2026-11-21 ([`PD-TRACE-002`](../product/directives/pd-trace-002.md#pd-trace-002), [R-116](../product/requests.md#r-116))
the domain also holds the **surveyed shape**: a repository's own requirement form, proposed by a bounded read-only
agent, previewed and accepted, through which every extracted requirement is drawn as a card, and under which a
document's status word and acceptance criteria are read and written back (REQ-ADOPT-031 to REQ-ADOPT-052).

