# The decisions — how a record in `adr/` is laid out, and what lives beside it

The decisions this system is built from: **one record per decision**, numbered `0001` upward. That folder is the
record of *why* — what the system must do is `docs/spec/`, what the owner decided instead is `docs/product/`.

**66 records on 2026-11-05**, no gap in the numbering. **The list of the decisions is not in this file** — it is §7
"Index of decisions" of [the architecture README](../README/13-7-index-of-decisions.md), one row per record with the
measurement each rests on beside it, and that is the page to cite a decision from. This page answers the two
questions a reader has *after* they have the number: what a record's file looks like, and where the rest of it went.

## The shape of a record's file

- **`NNNN-<slug>.md` is the record.** Since 2026-10-26 a record over the document budget is an **index**: its title,
  its header fields and a table of its parts; the rest moved verbatim into `NNNN-<slug>/`, one file per section, each
  named so it sorts in the record's order ([the document budget](../../README.md#the-document-budget)). **32 of the 66
  have a parts folder** on 2026-11-05. Every anchor kept its text, so a link to one now names its part.
- **The header is what to check before citing a record.** `Status`, `Date`, `Revised` (one bullet per revision),
  `Origin` (the requirement, ruling or request the record answers), `Depends on`, `Governed by` (an ESC, SR or GD
  entry of [`../owner-decisions.md`](../owner-decisions.md)), `Evidence` (the measurement in
  [`../spikes/`](../spikes/README.md) the record rests on) and `Requirements`.
- **A record's history is not in it since 2026-11-01** ([R-092](../../product/requests.md#r-092)): the sentences that
  explain a revision, a correction that holds only its falsified reason, and a struck sentence beside its dated
  replacement are in [`../../archive/architecture/adr/`](../../archive/architecture/adr/), one `<nnnn>-history.md` per
  record, each leaving one `*History: […](…)*` line where it stood. The Status, the Date, the Decision, the
  Consequences and every correction that carries its own replacement stay in the record.
- **ADR-0011 is withdrawn in place** under SR-1 and SR-2: it keeps its number, its text and its row, and nothing
  cites it as live. A superseded decision is withdrawn, never deleted and never renumbered.

## The records §7's table does not carry

§7's table stops at **ADR-0058**, and [`../README.md`](../README.md)'s "Decisions" bullet still counts "58 records",
while this folder holds **66**; the eight below are accepted and are cited from ADRs, requirements and requests.
They are listed here so nothing in the folder is reachable only by listing it — and they belong in §7's table, which
is where a reader looks first ([the note](../../defects/the-architecture-readmes-decision-index-and-record-count-lag-the-adr-folder.md)).

| # | Decision | Status | Parts |
|---|---|---|---|
| [0059](0059-the-loop-supervisor-as-an-in-turn-observer.md) | The loop supervisor is an in-turn observer; its pause is a withheld model step | accepted, first execution recorded | — |
| [0060](0060-context-compression-over-a-replaceable-conversation.md) | Context compression replaces a conversation; the conversation is the addressable thing | accepted, first execution recorded | 11 |
| [0061](0061-the-improvement-artifact-store-write-path.md) | The improvement artifact store's write path: rows, one indivisible mutation, two counters | accepted, first executed | — |
| [0062](0062-the-plan-gate-as-a-run-segment.md) | The plan gate as a run segment: park rather than block, and three places that enforce it | accepted, first execution recorded | — |
| [0063](0063-portable-skills.md) | Portable skills: a discovery library in `config`, a catalog the run host owns, skills as context units | accepted, first execution recorded | — |
| [0064](0064-the-project-initialization-registry.md) | Project initialization: a task registry in `config`, one marker writer in main, the work delegated | accepted, first execution recorded | 6 |
| [0065](0065-the-retrospective-pass.md) | The retrospective: a second analysis pass, user-started, workspace-wide | accepted, awaiting its first execution | 13 |
| [0066](0066-the-linux-artifact-is-built-on-a-developer-host.md) | The Linux artifact is built on a developer host, and accepted against stated criteria | accepted (the owner, 2026-10-26), awaiting its first execution | — |

**Five things the numbering itself carries**, each stated in §7 as well: the records are numbered in dependency
order, not in the order they were written; **two break that rule deliberately** (ADR-0057, found missing after the
others were numbered, and ADR-0058, added under SR-4 after everything it constrains); **three filenames no longer
match their titles** (ADR-0003, ADR-0024, ADR-0058 — the number and path are cited from other records, so the name
stays), and §7 says for each whether the record is stale.

## What lives here besides the records

- **Nothing.** The folder holds the records and their parts folders, and this page. A record's history is in
  [`../../archive/architecture/adr/`](../../archive/architecture/adr/); a proposal that a record consolidated or
  reversed is in [`../proposals/`](../proposals/README.md); the measurement a record cites is in
  [`../spikes/`](../spikes/README.md). The architecture README is one level up: [`../README.md`](../README.md).

## Where a new record goes

The next free number, as `NNNN-<slug>.md` — **split into `NNNN-<slug>.md` and `NNNN-<slug>/` in the same commit** if
it would pass the document budget — with its row added to §7's table, and to the table above **only while §7's table
ends before it**. A decision that reverses another is a new record (or a `Revised` bullet) that withdraws the old one
in place; a record is never renumbered. [`tools/folder-indexes.test.ts`](../../../tools/folder-indexes.test.ts) fails
`pnpm test` when a record in this folder is named in neither §7's table nor this page.
