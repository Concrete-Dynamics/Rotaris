# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier scope-and-location decision, *"one database per workspace, at
  `<workspace>/.rotaris/workspace.db`"*, recorded under this number on 2026-08-31 and reversed by ESC-15.
  The superseded argument is preserved below as alternative **J**.
- **Revised:** 2026-09-02, to build **ESC-19**'s whole-store backup and restore, to fold in the
  comparative evidence ESC-19 to ESC-21 were decided against, and to correct three statements this record
  made that the specification has since overtaken.
- **Revised again:** 2026-09-02, against two measurements — `../spikes/remote-and-synchronised-storage.md`
  and `../spikes/commit-on-the-publish-path.md` — and against **ESC-26**. **Every decision this record had
  taken survives. Four of the reasons it gave for them do not**, and each is corrected in place rather than
  quietly rewritten, because a decision resting on a falsified reason is a decision the next reader
  simplifies away. The four: that write-ahead logging is unsupported on network filesystems; that the store
  therefore opens read-only; that reading the journal-mode pragma back is a sufficient guard; and that the
  strongest durability setting is what makes a terminal status readable by another process. One new hazard
  is recorded that no version of this record considered — a store reached through two path spellings — and
  ESC-26's confirmed-establishment path is built.
- **Revised a third time:** 2026-09-02, against `../spikes/backup-restore-mechanism.md`, which ran the
  restore end to end for the first time. **Every decision the restore section takes survives. Three defects
  in its mechanism do not, and each is corrected in place below with the measurement that found it**, because
  all three are the kind a later simplification would put back. The three: the staging store was opened and
  no step closed it, so the install rename could not run at all (0 of 30); the live-session gate was
  evaluated before the run host was told to refuse runs and nothing re-checked, which destroyed a live
  session and every row it had written; and the reversal was a single rename onto a name whose occupancy is
  the commonest reason the step it reverses had just failed. Consequence 17 records what three such findings
  in a row imply about the parts of this record nobody has run.
- **Revised a fourth time:** 2026-09-02, against the three build-wrong defects spike 22 left open in this
  record. **D3** the unbounded close handshake: bounded at 2,000 ms with **expiry taking the abandonment
  path**, since an unanswered close is indistinguishable from a run host still writing, and step 1's refusal
  made a **lease the run host expires itself**, because the measured dual failure leaves no workspace service
  alive to release it. **D6** the displaced-store stamp: milliseconds, claimed by an exclusive create with a
  counter on collision — granularity is not uniqueness. **D7** the container layout becoming the store
  layout: the conversion is now a step rather than an assumption, and `origin.txt` is written by the restore,
  having been absent from every restored store. **None of the three corrections has been run**; that is IC-1
  in `../implementation-conditions.md`, and consequence 17 is why it exists.
- **Re-measured:** 2026-09-02, `../spikes/corrected-restore-rerun.md`, discharging **IC-1**. All three
  corrections above were run for the first time and **all five experiments pass, with every counterfactual
  reproducing the original defect**. Two wording refinements were owed and are applied in place: the
  aside-name's claim is the rename rather than a create, and the D6 correction's load-bearing half is the
  counter rather than the granularity. **The corrections are now measured rather than argued**; consequence
  17 stands unchanged, and its estimate now rests on three mechanisms rather than being tested by a fourth.
- **Authority:** `owner-decisions.md` SR-4 (the store), **ESC-15** (machine-local, keyed by a workspace
  identifier), ESC-16 (a store that will not open means no run), ESC-18, SR-9(b), **ESC-19** (the backup
  and restore action; the configurable store location refused), **ESC-20** (the export boundary is
  redaction safety), **ESC-26** (a restore may establish the workspace identifier on explicit
  confirmation, and no other path ever may). All decided, not proposed.
- **Evidence:** `../spikes/remote-and-synchronised-storage.md` (2026-09-02),
  `../spikes/commit-on-the-publish-path.md` (2026-09-02) and `../spikes/backup-restore-mechanism.md`
  (2026-09-02). Every figure quoted below is from one of those three and is a measurement; none is
  estimated.
- **Depends on:** ADR-0001, ADR-0002, ADR-0003
- **Constrains:** ADR-0004, ADR-0005, ADR-0008, ADR-0009, ADR-0024, ADR-0039, ADR-0041, ADR-0042, ADR-0046

## Parts

Since 2026-10-26 the rest of this document is in [`0058-the-workspace-database/`](0058-the-workspace-database/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0058-the-workspace-database/01-context.md) | Context; What the comparison established, and what it protects |
| [02](0058-the-workspace-database/02-alternatives-considered-the-engine.md) | Alternatives considered — the engine |
| [03](0058-the-workspace-database/03-alternatives-considered-scope.md) | Alternatives considered — scope |
| [04](0058-the-workspace-database/04-alternatives-considered-where-machine-local-is.md) | Alternatives considered — where "machine-local" is |
| [05](0058-the-workspace-database/05-alternatives-considered-how-a-store-is-located.md) | Alternatives considered — how a store is located |
| [06](0058-the-workspace-database/06-alternatives-considered-how-one-artifact-is.md) | Alternatives considered — how one artifact is taken from a store while runs are live |
| [07](0058-the-workspace-database/07-alternatives-considered-what-a-restore-does.md) | Alternatives considered — what a restore does about the identifier |
| [08](0058-the-workspace-database/08-decision.md) | Decision; Engine, location and layout; The workspace identifier; Two workspaces presenting the same identifier; Concurrency across ADR-0002's topology |
| [09](0058-the-workspace-database/09-durability-and-what-it-costs.md) | Durability, and what it costs; The whole-store backup (`REQ-SESSION-201`); The restore, and the identifier question that is the sharp edge |
| [10](0058-the-workspace-database/10-the-restore-and-the-identifier-question-that-is.md) | The restore, and the identifier question that is the sharp edge *(continued, from "And OQ-47's copied-folder direction is not closed by this.")* |
| [11](0058-the-workspace-database/11-corruption-domain-and-recovery-for-a-store.md) | Corruption domain, and recovery for a store nobody backed up; Reclaiming a superseded store; Schema evolution; What is not in the store |
| [12](0058-the-workspace-database/12-consequences-accepted.md) | Consequences accepted |
| [13](0058-the-workspace-database/13-consequences-accepted-2.md) | Consequences accepted *(continued, from "18. **What in this record is known to be wrong, or known to be silent, and is not …")* |
| [14](0058-the-workspace-database/14-revisit-if.md) | Revisit if |
| [15](0058-the-workspace-database/15-first-execution-2026-09-03-the-walking-skeleton.md) | First execution — 2026-09-03, the walking skeleton |
| [16](0058-the-workspace-database/16-spikes-8-and-18-2026-09-03-taken-with-the.md) | Spikes 8 and 18 — 2026-09-03, taken with the session writer |
| [17](0058-the-workspace-database/17-the-run-loop-2026-09-03-schema-v3-and-the-sixth.md) | The run loop — 2026-09-03: schema v3 and the sixth of consequence 17 |
| [18](0058-the-workspace-database/18-first-execution-2026-09-03-the-restore-behind.md) | First execution — 2026-09-03, the restore behind the real run host, and the backup from the Settings view |
| [19](0058-the-workspace-database/19-part-us-first-execution-2026-09-06-the-deletes.md) | Part U's first execution — 2026-09-06, the delete's cascade, table by table |
| [20](0058-the-workspace-database/20-part-xs-execution-2026-09-07-the-saved-prompts.md) | Part X's execution — 2026-09-07, the saved prompts as rows (schema v11) |
| [21](0058-the-workspace-database/21-part-aes-execution-2026-09-08-schema-v14-image.md) | Part AE's execution — 2026-09-08, schema v14: image attachment metadata |
| [22](0058-the-workspace-database/22-part-ys-first-execution-2026-09-07-schema-v12.md) | Part Y's first execution — 2026-09-07, schema v12: the session artifact store |
