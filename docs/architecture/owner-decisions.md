# Product-owner decisions on the architecture record

- **Status:** decided. These are rulings by the product owner, not proposals.
- **Date:** 2026-08-31
- **Scope:** escalations ESC-1 to ESC-10 as raised in [`open-questions.md`](open-questions.md), plus two
  contradictions found inside the approved design material during its import, plus the structural rulings
  recorded at the end of this document, plus ESC-11 to ESC-18, delegated by the owner to the clean-room
  manager and ruled on 2026-08-31. **Every escalation raised against the architecture record is now
  ruled.** Where a ruling is contingent on an unrun spike, the contingency is stated in the ruling.

Escalations are cited by number *and* by content, because `open-questions.md` is being revised and the
numbering may shift. Where a ruling requires a requirement to be amended, that is noted explicitly: the
amendment is authorised by this record but is not yet made.

**Where the multi-window planning rulings live — not here.** The four taken while planning the work that reaches
a project folder from inside the window (build the window builder now rather than a single-window stopgap; the
new-window route as its own gesture; the same-folder offer in place of a silent no-op; and the refusal of a
second operating-system process) are requests and directives rather than escalations. Nothing in the record
contradicted itself: the owner asked for behaviour the specification does not have, which is the one case
`docs/product/README.md`'s table sends to the directive layer. They are logged in
[`../product/requests.md`](../product/requests.md) as R-001 to R-005 and ruled in
[`../product/directives.md`](../product/directives.md) as `PD-SHELL-001` and `PD-WORKSPACE-001`. This document
stays what it has been: where a corpus that disagrees with itself is settled.

---

## Parts

Since 2026-10-26 the rest of this document is in [`owner-decisions/`](owner-decisions/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

**The archive.** Since 2026-11-01 ([R-092](../product/requests.md#r-092)) a ruling the specification carries is not kept
here: its entry is in [`docs/archive/architecture/owner-decisions/`](../archive/architecture/owner-decisions/), in the file
named like its part, whole and under its own `esc-<n>`-shaped anchor, and the part keeps one index line in its place
(`- ESC-<n> — <title>; ruled <date>; [archived](…#esc-<n>)`). What stays is what no requirement carries: the gate
decisions about the process and an escalation still the owner's. The move is `pnpm archive:migrate`
([the archive](../README.md#the-archive)); on its first run it moved 45 entries and left GD-2, GD-3, GD-5 to GD-10 and
ESC-43 live. **A ruling that lands in the specification** is followed by `pnpm archive:migrate` in the same commit, and
`pnpm lint` fails while one is still live.

| Part | What it holds |
|---|---|
| [01](owner-decisions/01-design-material-contradictions.md) | Design-material contradictions |
| [02](owner-decisions/02-escalations.md) | Escalations; ESC-1 — the shared save path between Settings and the composer's permission-mode control; ESC-2 — configuration write-back and comments; ESC-3 — silent loss of a review decision under last-writer-wins; ESC-4 — a workspace with no version-control repository has no undo; ESC-5 — the pooled terminal backend; ESC-6 — Windows users get no confinement; ESC-7 — the plugin language; ESC-8 — what the update path establishes; ESC-9 — session retention; ESC-10 — controlling a run owned by a second application instance — archived in [the archive](../archive/architecture/owner-decisions/02-escalations.md): ESC-1; ESC-2; ESC-3; ESC-4; ESC-5; ESC-6; ESC-7; ESC-8; ESC-9; ESC-10 |
| [03](owner-decisions/03-standing-direction-inherited-structure-is-not-a.md) | Standing direction: inherited structure is not a reason |
| [04](owner-decisions/04-structural-rulings-under-the-standing-direction.md) | Structural rulings under the standing direction; SR-1 — one running instance; SR-2 — a run this application does not own cannot be viewed; SR-3 — no polling; SR-4 — a database is the store for what only the application reads; SR-5 — a workspace held by another machine is refused, and that refusal is a safety feature; SR-6 — the export obligation covers every record a user could previously read for themselves — archived in [the archive](../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md): SR-1; SR-2; SR-3; SR-4; SR-5; SR-6 |
| [05](owner-decisions/05-escalations-esc-11-to-esc-18-ruled-2026-08-31.md) | Escalations ESC-11 to ESC-18 — ruled 2026-08-31; ESC-11 — the Linux artifact's runtime; ESC-12 — the tool-server protocol era floor; ESC-13 — the benchmark invariant against screen-reader access; ESC-14 — corrections to SR-4's own reasoning; ESC-15 — a workspace on a network share or in a cloud-sync folder; ESC-16 — a store that will not open means no run at all; ESC-18 — ESC-3 has been overtaken; SR-7 — the onefile portable extracts once to a cache; SR-8 — REQ-ORCH-155's 100 ms is a percentile, not an absolute bound; SR-9 — two gaps the specification pass exposed in SR-4 and SR-6 — archived in [the archive](../archive/architecture/owner-decisions/05-escalations-esc-11-to-esc-18-ruled-2026-08-31.md): ESC-11; ESC-12; ESC-13; ESC-14; ESC-15; ESC-16; ESC-18; SR-7; SR-8; SR-9 |
| [06](owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md) | Escalations ESC-19 to ESC-21 — ruled 2026-09-01, against comparative evidence; What the field actually does; ESC-19 — the backup disclosure; ESC-20 — the export list, and where SR-6's reasoning stops; ESC-21 — the integration lock on synchronised storage; A consequence for ADR-0058 the comparison surfaced; Sources; ESC-26 — a restore may establish the workspace identifier, on explicit confirmation, and only there; ESC-22, ESC-24 and ESC-27 to ESC-31 — ruled 2026-09-02; Consequences to carry — archived in [the archive](../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md): ESC-19; ESC-20; ESC-21; ESC-26; ESC-22, ESC-24 and ESC-27 to ESC-31 |
| [07](owner-decisions/07-architecture-gate-decisions-ruled-2026-09-02.md) | Architecture Gate decisions — ruled 2026-09-02; GD-1 — the approved visual design reference is not a gate condition, and OQ-31 is ruled without it; GD-2 — ESC-15's and SR-7's stated reasons are corrected in place; both rulings stand; GD-3 — the corrected restore is re-measured as a condition on its implementation, not on the gate; GD-4 — a restore under way is visible; a backup may be abandoned; GD-5 — the Linux and macOS build-host obligations are deferred to hardware, not waived — archived in [the archive](../archive/architecture/owner-decisions/07-architecture-gate-decisions-ruled-2026-09-02.md): GD-1; GD-4 |
| [08](owner-decisions/08-the-architecture-gate-closed-2026-09-03.md) | The Architecture Gate — CLOSED 2026-09-03; GD-6 — implementation is authorized, bounded; GD-7 — the three closures resting on argument are bound as conditions; GD-8 — a spike is taken as the first act of building the thing it prices; GD-9 — a stated, non-build-wrong defect does not block implementing against a record; GD-10 — the first-execution recording rule is standing policy |
| [09](owner-decisions/09-rulings-after-the-gate-2026-09-06.md) | Rulings after the gate — 2026-09-06; ESC-32 — IC-7: the code-intelligence language servers are tools provisioned after installation; ESC-33 — REQ-MCP-044's 8-second toast is a second copy of an owned figure; ESC-34 — the notice action vocabulary was closed against two actions the product owes; ESC-35 — the intent-classification bound was set against a hosted provider's latency; ESC-36 — the provider row visibility: REQ-PROVIDER-140's union against REQ-CONFIG-389's authenticated-only list; ESC-37 — what invoking a skill delivers: REQ-CHAT-034/162's attached payload against REQ-WORKSPACE-062/073's force-loaded block; ESC-38 — the Skills table's columns: REQ-CONFIG-343's five against REQ-WORKSPACE-067's amended seven; ESC-39 — a skill whose command name is taken: REQ-CHAT-034 skips it, REQ-SHELL-056 renames it — archived in [the archive](../archive/architecture/owner-decisions/09-rulings-after-the-gate-2026-09-06.md): ESC-32; ESC-33; ESC-34; ESC-35; ESC-36; ESC-37; ESC-38; ESC-39 |
| [10](owner-decisions/10-rulings-and-escalations-after-the-gate-2026-09.md) | Rulings and escalations after the gate — 2026-09-16; ESC-41 — the exit-1 success conventions: REQ-TOOLS-112's test 4 against `git diff`, `diff` and `grep`; ESC-40 — `session_log_level`'s default and vocabulary: REQ-CLI-065's lowercase `info` against three requirements' uppercase `WARNING`; OQ-62 — a provider-reported cost, ruled; the other two branches stated and left open — archived in [the archive](../archive/architecture/owner-decisions/10-rulings-and-escalations-after-the-gate-2026-09.md): ESC-41; ESC-40 |
| [11](owner-decisions/11-rulings-after-the-gate-2026-09-23.md) | Rulings after the gate — 2026-09-23; OQ-63 — the application log's threshold, ruled; OQ-21 — per-token prices are decimal strings, ruled; OQ-62's configured-rate branch with it |
| [12](owner-decisions/12-rulings-after-the-gate-2026-09-27.md) | Rulings after the gate — 2026-09-27; ESC-37, ESC-38, ESC-39 — the three portable-skill escalations, ruled; OQ-64 — an instruction override suppresses its base only while it is switched on, ruled; The updater ships in the first release, ruled — archived in [the archive](../archive/architecture/owner-decisions/12-rulings-after-the-gate-2026-09-27.md): ESC-37, ESC-38, ESC-39 |
| [13](owner-decisions/13-escalations-after-the-gate-2026-09-28.md) | Escalations after the gate — 2026-09-28; ESC-42 — the money rule against the property it is said to guarantee: REQ-SHELL-045's "never rendered as zero" under REQ-PROVIDER-121's four places — archived in [the archive](../archive/architecture/owner-decisions/13-escalations-after-the-gate-2026-09-28.md): ESC-42 |
| [14](owner-decisions/14-rulings-after-the-gate-2026-09-29.md) | Rulings after the gate — 2026-09-29 |
| [15](owner-decisions/15-escalations-after-the-gate-2026-10-22.md) | Escalations after the gate — 2026-10-22; ESC-43 — domain 19's update requirements were never swept after ESC-8 and SR-1: REQ-NOTIFY-219 and REQ-NOTIFY-212 against domain 11 |
