# Architecture proposals — DATA slice

Status: **proposal**. Nothing here is approved. The Architecture Gate has not been held and
implementation is not authorised.

Slice owner domains: **06** (git, worktrees, checkpoints, `REQ-GIT`), **08** (requirements board and
traceability, `REQ-TRACE`), **14** (library, artifacts, improvement proposals, `REQ-LIBRARY`),
**15** (settings and configuration, `REQ-CONFIG`).

## Parts

Since 2026-10-26 the rest of this document is in [`data/`](data/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](data/01-scope-of-this-slice.md) | Scope of this slice |
| [02](data/02-a-on-disk-shape-and-file-formats.md) | A. On-disk shape and file formats |
| [03](data/03-b-write-discipline-atomicity-ordering-durability.md) | B. Write discipline: atomicity, ordering, durability |
| [04](data/04-c-concurrency.md) | C. Concurrency |
| [05](data/05-d-configuration-load-semantics.md) | D. Configuration load semantics |
| [06](data/06-e-when-a-change-takes-effect.md) | E. When a change takes effect |
| [07](data/07-f-git-execution.md) | F. Git execution |
| [08](data/08-g-the-traceability-engine-scale-cost-and.md) | G. The traceability engine: scale, cost and statelessness |
| [09](data/09-h-delivery-records-and-the-write-path.md) | H. Delivery records and the write path |
| [10](data/10-i-versioned-artifact-history-and-retention.md) | I. Versioned artifact history and retention |
| [11](data/11-j-free-and-explicitly-so.md) | J. Free, and explicitly so |
| [12](data/12-spike-1-atomic-replacement-on-windows.md) | Spike 1 — atomic replacement on Windows |
| [13](data/13-spike-2-yaml-library-behaviour.md) | Spike 2 — YAML library behaviour |
| [14](data/14-adr-data-01-documents-on-disk-are-the-system-of.md) | ADR-DATA-01 — Documents on disk are the system of record; no relational database; Decision to be made; Constraints that bear on it; Alternative A — SQLite as the primary store for delivery records, traceability and improvement artifacts; Alternative B — SQLite as a rebuildable derived index alongside the files; Alternative C — an event-sourced journal with projections for the whole slice; Recommendation; Consequences accepted; What would have to change to revisit this |
| [15](data/15-adr-data-02-one-document-store-primitive-with-a.md) | ADR-DATA-02 — One document-store primitive, with a guarded read side; Decision to be made; Constraints that bear on it; Alternative A — one primitive, uniform policy; Alternative B — a primitive with an explicit per-store policy, and store-specific readers; Alternative C — a third-party atomic-write package; Recommendation; Consequences accepted; What would have to change to revisit this |
| [16](data/16-adr-data-03-configuration-is-loaded-through-the.md) | ADR-DATA-03 — Configuration is loaded through the YAML document AST over a tri-state model; Decision to be made; Constraints that bear on it; Alternative A — parse to plain objects and merge with a schema library's defaults; Alternative B — parse to the YAML document AST, merge over a tri-state model, validate the merged result; Alternative C — a configuration library (cosmiconfig, node-config, convict); Recommendation; Consequences accepted; What would have to change to revisit this |
| [17](data/17-adr-data-04-git-is-reached-by-spawning-the-git.md) | ADR-DATA-04 — Git is reached by spawning the `git` executable; Decision to be made; Constraints that bear on it; Alternative A — `isomorphic-git` (pure JavaScript); Alternative B — libgit2 bindings (`nodegit`); Alternative C — `simple-git` (a promise wrapper over the CLI); Recommendation; Consequences accepted; What would have to change to revisit this |
| [18](data/18-adr-data-05-checkpoints-are-built-with-a.md) | ADR-DATA-05 — Checkpoints are built with a private index and Git plumbing; Decision to be made; Constraints that bear on it; Alternative A — `git stash`, or a temporary branch; Alternative B — snapshot outside Git entirely (a content-addressed store of our own); Alternative C — a private index plus plumbing; Recommendation; Consequences accepted; What would have to change to revisit this |
| [19](data/19-adr-data-06-the-traceability-engine-is-a.md) | ADR-DATA-06 — The traceability engine is a stateless streaming library with its own parser; Decision to be made; Constraints that bear on it; Alternative A — parse the store into a resident model and refresh it incrementally; Alternative B — a stateless engine invoked per operation, streaming its parse; Recommendation; Consequences accepted; What would have to change to revisit this |
| [20](data/20-adr-data-07-the-delivery-store-is-per.md) | ADR-DATA-07 — The delivery store is per-requirement documents behind a capability-split writer; Decision to be made; Constraints that bear on it; Alternative A — one document for the whole store; Alternative B — one document per requirement, plus an append-only audit log; Alternative C — one document per transition (an append-only event log per requirement); Recommendation; Consequences accepted; What would have to change to revisit this |
| [21](data/21-adr-data-08-where-the-data-layer-runs.md) | ADR-DATA-08 — Where the data layer runs; Decision to be made; Constraints that bear on it; Alternative A — everything in the Electron main process, heavy passes on worker threads; Alternative B — a long-lived workspace service process, separate from per-run runtime processes; Alternative C — in the renderer with Node integration; Recommendation; Consequences accepted; What would have to change to revisit this |
| [22](data/22-adr-data-09-the-preference-store-is-a-closed.md) | ADR-DATA-09 — The preference store is a closed typed registry over a plain file; Decision to be made; Constraints that bear on it; Alternative A — `electron-store` or a similar preferences package; Alternative B — a native platform store per platform; Alternative C — a small typed registry over a single JSON file; Recommendation; Consequences accepted; What would have to change to revisit this |
| [23](data/23-esc-1-the-shared-save-path-between-settings-and.md) | ESC-1 — The shared save path between Settings and the composer's permission-mode control |
| [24](data/24-esc-2-whether-configuration-write-back.md) | ESC-2 — Whether configuration write-back preserves comments |
| [25](data/25-esc-3-silent-loss-of-a-review-decision-under.md) | ESC-3 — Silent loss of a review decision under last-writer-wins |
