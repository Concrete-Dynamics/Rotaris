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
