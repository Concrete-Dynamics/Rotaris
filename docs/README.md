# The record — what is in `docs/`, and how long a document may be

The index of this folder, and the rule that keeps each document in it loadable whole. Where a *thing* lives in the
code is [`module-map.md`](module-map.md)'s question, not this file's.

| Folder | What it holds | Its index |
|---|---|---|
| [`product/`](product/) | The owner's requests and the directives that govern over the specification | [`product/README.md`](product/README.md) |
| [`spec/`](spec/) | The approved behavioural requirements, one file per domain, and their resolutions | [`spec/README.md`](spec/README.md) |
| [`architecture/`](architecture/) | ADRs, views, open questions, the build's own record | [`architecture/README.md`](architecture/README.md) |
| `clean-room/` | Process, the gates, the provenance record | — |
| [`design/`](design/) | The adopted design language | [`design/README.md`](design/README.md) |
| [`defects/`](defects/) | Defect notes, open and fixed | [`defects/README.md`](defects/README.md) |
| [`proofs/`](proofs/) | One record per built-app proof | [`proofs/README.md`](proofs/README.md) |
| [`research/`](research/) | Measurements and probes that informed a decision | — |
| `archive/` | Ruled, closed and withdrawn entries, moved out of the live record whole (R-092) | [The archive](#the-archive), below |

## The document budget

**A Markdown file of the record holds at most 500 lines and at most 32 KiB, whichever it reaches first; 150 to 300
lines is the comfortable size.** 32 KiB is about 8,000 tokens. The record is read by agents that load a document
whole, and an agent asked to work in one area must be able to load the document that governs it without the rest of
the corpus. Set on 2026-10-26 at the owner's request:

> "alle Files, was mit der Architektur zu tun angeht, die zu lang sind, also ein bestimmtes Budget überschreiten,
> müssen aufgeteilt werden, in Subfolder strukturiert werden, referenziert werden und so weiter, dass es das
> Kontext-Window nicht sprengt. Das sollte man generell festlegen."

**Where the numbers come from** (each page read on 2026-10-26; the vendor documentation pages carry no date of their own):

| Source | What it says |
|---|---|
| Anthropic, Claude Code, [*How Claude remembers your project*](https://code.claude.com/docs/en/memory) | "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence"; imports "don't reduce its context cost" |
| Anthropic, Claude Code, [*Skills*](https://code.claude.com/docs/en/skills), and [*Skill authoring best practices*](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | "Keep `SKILL.md` under 500 lines"; "For reference files longer than 100 lines, include a table of contents at the top"; "Keep references one level deep" |
| Anthropic Engineering, [*Effective context engineering for AI agents*](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29 | "as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases" |
| OpenAI Codex, [*AGENTS.md*](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | stops reading once the combined size reaches `project_doc_max_bytes`, "32 KiB by default"; "split instructions across nested directories when you hit the cap" |
| Cursor, [*Rules*](https://cursor.com/docs/context/rules) | "Keep rules under 500 lines"; "Split large rules into multiple, composable rules" |
| GitHub, [*Customizing code review*](https://docs.github.com/en/copilot/tutorials/customize-code-review) | "Limit any single instruction file to a maximum of about 1,000 lines" |
| Chroma Research, [*Context Rot*](https://www.trychroma.com/research/context-rot), 2025-07-14 | across 18 models, "performance degrades as input length increases, often in surprising and non-uniform ways" |
| Liu et al., [*Lost in the Middle*](https://arxiv.org/abs/2307.03172), TACL, 2023 | performance "significantly degrades when models must access relevant information in the middle of long contexts" |

No vendor publishes a bound for a specification or architecture document. One is loaded on demand, like a skill or a
rule file, so it takes their 500 lines; and since this record writes lines of about 100 characters, where a line
bound alone would admit a file of several hundred kilobytes, it also takes Codex's 32 KiB.

**How a document over the budget is split.**

- **By what it is about, not by line count**: a domain, an epic, a section, one entry per file where entries are
  cited one at a time. A part that cannot be cut without cutting an entry in two keeps the entry whole and is listed
  as debt.
- **The original path becomes the index**, so every link and every mention of the file still lands on it. The parts
  sit beside it in a folder of the same name (`open-questions.md` and `open-questions/`; `README.md` and `README/`),
  each a file whose name sorts in the document's order. A part that begins inside a table repeats the table's
  header rows. An index states what each part holds, and where a new entry goes.
- **The text moves verbatim.** No requirement, ruling or entry is reworded, renumbered or dropped; an anchor moves with
  its text, and every link to it in the repository is rewritten to the part in the same commit
  (`tools/check-record-links.mjs` fails `pnpm lint` on one left behind).
- **A gate or a test that reads a split document whole** reads it through `tools/record-parts.mjs`, which returns the
  index and its parts in order.

**Enforced by `tools/check-doc-budget.mjs`** in `pnpm lint`: a record file over the budget fails unless
`tools/doc-budget-baseline.json` lists it. That list is the debt the first split did not reach and it only shrinks — a
listed file back within the budget fails until its line is removed.

**Split on 2026-10-26:**

| Document | Before | Now |
|---|---|---|
| [`architecture/open-questions.md`](architecture/open-questions.md) | 16,723 lines, 1.7 MB | an index and 68 parts by section |
| [`product/directives.md`](product/directives.md) | 9,904 lines, 0.9 MB | an index by domain and one file per directive |
| [`architecture/views/reconciliation-log.md`](architecture/views/reconciliation-log.md) | 3,697 lines, 0.4 MB | the newest entries and 12 archived parts |
| The 19 live domains of [`spec/`](spec/), `01` to `16` and `19` to `21` | 12,148 lines, 2.9 MB | each an index (frontmatter, overview, parts table) and 5 to 13 parts by subtopic |
| [`architecture/README.md`](architecture/README.md) | 2,386 lines, 224 KiB | an index and 13 parts by section |
| [`architecture/codebase.md`](architecture/codebase.md) | 2,596 lines, 352 KiB | an index and 22 parts by section |
| [`architecture/first-executions.md`](architecture/first-executions.md) | 586 lines, 918 KiB | an index and 34 parts, the register's table cut between rows |
| [`architecture/first-release-plan.md`](architecture/first-release-plan.md) | 958 lines, 89 KiB | an index and 8 parts by section, its `§` numbers listed |
| [`architecture/owner-decisions.md`](architecture/owner-decisions.md) | 1,789 lines, 130 KiB | an index and 15 parts by section |
| [`architecture/constraints.md`](architecture/constraints.md) | 767 lines, 239 KiB | an index and 22 parts by section |
| [`architecture/proposals/data.md`](architecture/proposals/data.md) | 2,324 lines, 162 KiB | an index and 25 parts by section |
| [`architecture/views/02-process-view.md`](architecture/views/02-process-view.md) | 916 lines, 155 KiB | an index and 8 parts by section |
| [`architecture/views/03-runtime-view.md`](architecture/views/03-runtime-view.md) | 2,260 lines, 299 KiB | an index and 16 parts by section |
| 32 ADRs in [`architecture/adr/`](architecture/adr/) (0002 to 0065), the four other proposals, eight spike reports, two live-run autopsies, `background-update-plan.md`, the component, seams and sequences views, [`design/README.md`](design/README.md) | 39,504 lines, 3.3 MB | each an index and 2 to 22 parts by section |
| 19 files of [`spec/resolutions/`](spec/resolutions/) | 5,409 lines, 0.8 MB | each an index and 2 to 8 parts by section |

**Not split, and why** — each listed in `tools/doc-budget-baseline.json`:

- `AGENTS.md` (724 lines, 83 KiB): a governance document, and the place agents look first; moving its live-run chapter
  out is a restructuring for its owner to approve, not a verbatim split.
- `product/requests.md`: the request log is one table that `tools/check-request-log.mjs` reads and every change
  appends to; splitting it is a change to that gate and to every lane's habit, worth its own request.
- `spec/17-terminal-ui.md` and `spec/18-cli-headless.md`: the retired domains. They stay single files so that their
  444 identifiers stay counted ([`spec/README.md`](spec/README.md), "Domains 17 and 18 are retired"); no agent works
  in them.
- Four directives (`PD-LIBRARY-002`, `PD-ORCH-004`, `PD-ORCH-005`, `PD-TOOLS-006`), one open-questions part and two
  defect notes: each is one entry, which is not cut in two.
- `architecture/implementation-conditions.md` and the two `clean-room/` records: owned by other work at the time of
  the split.

## The archive

**A ruled, closed, resolved or withdrawn entry is history, and it leaves the live record for `docs/archive/`** (the
owner's request [R-092](product/requests.md#r-092), 2026-11-01; the design is
[`architecture/hardening.md` §6](architecture/hardening.md#6-requirements-traceability-and-the-decision-archive--r-092)).
An agent that opens a part to read the questions still open loads those, and not the hundreds already answered.

- **The archive mirrors the record's paths.** The archived entries of `architecture/open-questions/<part>.md` are in
  `archive/architecture/open-questions/<part>.md`, under the same part name; the escalations and gate rulings, the
  history of an ADR and the repaired defect notes take the same shape (`archive/architecture/owner-decisions/…`,
  `archive/architecture/adr/<nnnn>-history.md`, `archive/defects/…`), and so does a superseded or withdrawn
  requirement's text (`archive/spec/<domain>/…`), whose identifier, anchor and definition line stay in `spec/`.
- **An entry moves whole, under its own anchor** — its heading, its body and the anchors above it, verbatim; only a
  relative path in it is rewritten to reach the same file from the archive's folder. An entry that had no explicit
  anchor is given one, `<a id="oq-<n>"></a>`, so that a link can land on it.
- **The live file keeps one index line per moved entry**, where the entry stood:
  `- OQ-<n> — <title>; ruled <date>; [archived](../../archive/architecture/open-questions/<part>.md#oq-<n>)`. The part's
  opening sentence and its row in the record's index say what stays and what is archived.
- **Every link to a moved anchor is repointed** to the archive, in the record (the files `tools/check-record-links.mjs`
  reads) and in the code (a `docs/….md#anchor` path under `apps/`, `packages/` or `tools/`). Only the target changes.
- **Nothing in the archive is edited by hand after it moves.** Only the script writes there.
- **The archive is under the budget too**: an archived part that would pass it is continued in
  `<part>-continued-<k>.md`, and `tools/check-doc-budget.mjs` measures the archive like any other folder of `docs/`.

**The move is a script**, `tools/archive/migrate.mjs`: `pnpm archive:migrate` moves and repoints, `--dry-run` lists what
would move and which files would change, and `--check` (in `pnpm lint` from the first migration on) fails while an entry that qualifies is still
live. It is idempotent and deterministic, so **ruling a question is followed by `pnpm archive:migrate` in the same
commit**, and a branch that rebases over a move re-runs it rather than merging moved text by hand, as `pnpm proofs:index`
regenerates the proof index. An open question qualifies exactly when `tools/check-open-question-claims.mjs` reads it as
settled (`entryState`: one rule for both); a deferred one stays live. **A gate that asks what the record holds reads the
live parts and the archived ones alike** through `tools/record-parts.mjs` (`archivePartsOf`, `readRecordWithArchive`):
a question moved to the archive is still settled for the claims gate.
