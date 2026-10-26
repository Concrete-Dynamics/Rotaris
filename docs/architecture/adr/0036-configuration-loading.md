# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` ESC-14, and against the specification as amended —
  `REQ-CONFIG-477` (new), `REQ-CONFIG-252`, `REQ-CONFIG-288`, `REQ-CONFIG-192`, `REQ-CONFIG-010`
- **Supersedes reasoning in:** its own 2026-08-31 revision, whose placement argument leaned on
  `REQ-CONFIG-192` (see alternative D, objection 3)
- **Origin:** DATA (ADR-DATA-03, Spike 2)
- **Depends on:** ADR-0002, ADR-0004
- **Constrains:** ADR-0015, ADR-0017, ADR-0022, ADR-0023, ADR-0032, ADR-0034

## Parts

Since 2026-10-26 the rest of this document is in [`0036-configuration-loading/`](0036-configuration-loading/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0036-configuration-loading/01-context.md) | Context |
| [02](0036-configuration-loading/02-alternatives-considered.md) | Alternatives considered |
| [03](0036-configuration-loading/03-decision.md) | Decision; What the SR rulings change here |
| [04](0036-configuration-loading/04-consequences-accepted.md) | Consequences accepted |
| [05](0036-configuration-loading/05-revisit-if.md) | Revisit if |
| [06](0036-configuration-loading/06-first-slice-built-2026-09-03-for-the-hooks-adr.md) | First slice built — 2026-09-03, for the hooks (ADR-0015) |
| [07](0036-configuration-loading/07-first-execution-2026-09-05-the-whole-loader-the.md) | First execution — 2026-09-05, the whole loader, the four writers, and the screen (Part I) |
| [08](0036-configuration-loading/08-second-execution-2026-09-05-layer-3-folded-part.md) | Second execution — 2026-09-05, layer 3 folded (Part K) |
| [09](0036-configuration-loading/09-third-execution-2026-09-08-the-display-sections.md) | Third execution — 2026-09-08, the `display:` section's surface and write path (Part AG) |
| [10](0036-configuration-loading/10-the-first-executions-proof-on-linux-with-the.md) | The first execution's proof on Linux with the code-intelligence bundle present — 2026-09-28 (R-062) |
| [11](0036-configuration-loading/11-discard-pressed-where-the-notice-banner-moved.md) | Discard pressed where the notice banner moved it — 2026-10-23 |
