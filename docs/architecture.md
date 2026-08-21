# Rotaris Architecture

> Canonical entry point and index for the architecture documentation set.
> Owner: `architect` persona.

This document is the index for the architecture documentation of Rotaris. The detailed
views live under [`docs/architecture/`](architecture/). Every linked document describes
the **current** architecture of the codebase only — none of them track per-feature
implementation state, project phases, or aspirational target architecture.
Per-requirement implementation state lives exclusively in the per-requirement files under
[`docs/requirements/`](requirements/) (frontmatter `status`: draft/approved/deprecated)
and the ReqToCode annotations (`@traces` / `@verifies`) linking them to code and tests.

The documentation set is organized around 16 perspectives drawn from a standard
architectural documentation taxonomy (perspective × diagram type). Each perspective
answers a distinct question about the system.

---

## Where to Start

If you are new to the codebase, read in this order:

1. [01 — System Context](architecture/01-system-context.md) — who's in the picture?
2. [02 — Code Topology](architecture/02-code-topology.md) — where does everything live?
3. [14 — End-to-End Trace](architecture/14-e2e-trace.md) — walk me through one complete story.
4. [08 — Lifecycle & Errors](architecture/08-lifecycle-errors.md) — what happens when things go wrong?
5. [16 — Decision Record](architecture/16-decision-record.md) — what did we choose and why?

For runtime versions and dependencies, see [`pyproject.toml`](../pyproject.toml). For
developer-facing onboarding, see [`AGENTS.md`](../AGENTS.md).

---

## 16-Perspective Documentation Set

| #   | Perspective                   | What it answers                                                                 | Diagram type  | Document                                                                  |
| --- | ----------------------------- | ------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| 1   | **System Context**            | Who uses the system, what external systems exist, and how they connect          | C4Context     | [01-system-context.md](architecture/01-system-context.md)                 |
| 2   | **Code Topology**             | Physical repository layout and dependency graph between packages                | Graph         | [02-code-topology.md](architecture/02-code-topology.md)                   |
| 3   | **Integration Protocol**      | Runtime handshake — what loads when and in what order                           | Sequence      | [03-integration-protocol.md](architecture/03-integration-protocol.md)     |
| 4   | **Contract Layers**           | Formal interfaces that separate concerns                                        | Graph + Table | [04-contract-layers.md](architecture/04-contract-layers.md)               |
| 5   | **Data / Context Flow**       | How shared state or context propagates from producers to consumers              | Flowchart     | [05-data-flow.md](architecture/05-data-flow.md)                           |
| 6   | **Event / Message Bus**       | Who emits what messages, who listens, and what payloads travel                  | Sequence      | [06-event-bus.md](architecture/06-event-bus.md)                           |
| 7   | **Routing Map**               | Who owns which entry path and how paths compose                                 | Graph         | [07-routing-map.md](architecture/07-routing-map.md)                       |
| 8   | **Loading & Error Lifecycle** | State machine for executing a child agent — happy path and every failure branch | Flowchart     | [08-lifecycle-errors.md](architecture/08-lifecycle-errors.md)             |
| 9   | **Role / Persona Branching**  | How the system behaves differently per persona type                             | Flowchart     | [09-persona-branching.md](architecture/09-persona-branching.md)           |
| 10  | **Authorization Boundaries**  | Where auth decisions are made and what is enforced vs. demonstrative            | Graph + Table | [10-auth-boundaries.md](architecture/10-auth-boundaries.md)               |
| 11  | **Dependency Sharing**        | Which dependencies are singletons, per-iteration, or per-child isolated         | Graph         | [11-dependency-sharing.md](architecture/11-dependency-sharing.md)         |
| 12  | **Service Classification**    | What pattern each module or subsystem follows                                   | Table         | [12-service-classification.md](architecture/12-service-classification.md) |
| 13  | **Version Compatibility**     | Version gates, what blocks vs. warns, upgrade coordination rules                | Flowchart     | [13-version-compatibility.md](architecture/13-version-compatibility.md)   |
| 14  | **End-to-End Trace**          | A single user story traced through every layer from input to completion         | Sequence      | [14-e2e-trace.md](architecture/14-e2e-trace.md)                           |
| 15  | **Dev / Prod Topology**       | How the system runs in development vs. for end users                            | Graph         | [15-dev-prod-topology.md](architecture/15-dev-prod-topology.md)           |
| 16  | **Decision Record**           | Key architectural decisions with rationale and alternatives considered          | Table         | [16-decision-record.md](architecture/16-decision-record.md)               |

---

## Ownership

The `architect` persona is the accountable owner of every document linked from this
index. When the codebase architecture changes in a way that affects documented structure,
boundaries, runtime flow, or responsibilities, the architecture documentation set must be
updated by the Architect persona.

The `docs-writer` persona is **not** the owner of architecture documentation. It may
assist only when explicitly delegated by the Architect; authoritative responsibility for
architectural correctness remains with the Architect persona.

The persona prompts that encode this ownership boundary live at
[`src/rotaris_core/agents/prompts/architect.md`](../src/rotaris_core/agents/prompts/architect.md)
and
[`src/rotaris_core/agents/prompts/docs_writer.md`](../src/rotaris_core/agents/prompts/docs_writer.md).

---

## Out of Scope for This Document Set

- Aspirational target architecture, migration plans, or any forward-looking project state.
- Per-requirement implementation state, percentage indicators, or per-feature status
  annotations. See the requirement files under [`docs/requirements/`](requirements/) instead.
- Prescriptive design proposals. Those belong in proposal documents, ADRs, or
  requirement entries under [`docs/requirements/`](requirements/).
