# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-08
- **Origin:** the map's tools row (`codebase.md`, "owes" — `REQ-ORCH-093`'s context-window condensation),
  taken as Part AH
- **Depends on:** ADR-0026 (the model boundary — the compressing pass is a second call over the same port),
  ADR-0027 (the client; `REQ-MONITOR-081` prefers the provider's own prompt-token figure), ADR-0036 (the
  `compressor:` section), ADR-0010 (the run's publications), ADR-0059 (the in-turn observer, whose position
  in the step loop the trigger shares)
- **Requirements:** `REQ-ORCH-093`, `REQ-MONITOR-076..089`, `REQ-MONITOR-281`, `REQ-CONFIG-085`,
  `REQ-CONFIG-132..135`

## Parts

Since 2026-10-26 the rest of this document is in [`0060-context-compression-over-a-replaceable-conversation/`](0060-context-compression-over-a-replaceable-conversation/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0060-context-compression-over-a-replaceable-conversation/01-context.md) | Context |
| [02](0060-context-compression-over-a-replaceable-conversation/02-alternatives-considered.md) | Alternatives considered |
| [03](0060-context-compression-over-a-replaceable-conversation/03-decision.md) | Decision |
| [04](0060-context-compression-over-a-replaceable-conversation/04-consequences-accepted.md) | Consequences accepted |
| [05](0060-context-compression-over-a-replaceable-conversation/05-revisit-if.md) | Revisit if |
| [06](0060-context-compression-over-a-replaceable-conversation/06-first-execution-2026-09-08.md) | First execution — 2026-09-08 |
| [07](0060-context-compression-over-a-replaceable-conversation/07-second-execution-2026-09-08-the-first-live-run.md) | Second execution — 2026-09-08, the first live run against a real provider |
| [08](0060-context-compression-over-a-replaceable-conversation/08-third-execution-2026-09-09-part-ao-the-manual.md) | Third execution — 2026-09-09 (Part AO): the manual arm, decision 1's second reader |
| [09](0060-context-compression-over-a-replaceable-conversation/09-fourth-execution-2026-09-11-part-c-the-manual.md) | Fourth execution — 2026-09-11 (Part C″), the manual arm re-measured on the build three lanes merged into |
| [10](0060-context-compression-over-a-replaceable-conversation/10-the-compressors-reading-repaired-2026-09-30.md) | The compressor's reading, repaired — 2026-09-30 (acceptance finding A12) |
| [11](0060-context-compression-over-a-replaceable-conversation/11-the-compressing-model-follows-the-agents-cell.md) | The compressing model follows the agent's cell — 2026-10-02 (fin10) |
