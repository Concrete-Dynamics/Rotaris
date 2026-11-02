# The archive — the record's history, out of the live files

What the record has settled, moved out of the files an agent opens to learn what is still live (the owner's request
[R-092](../product/requests.md#r-092), 2026-11-01). The design is [`architecture/hardening.md` §6](../architecture/hardening.md#6-requirements-traceability-and-the-decision-archive--r-092);
the rule every writer follows is [the record's "The archive"](../README.md#the-archive). This page says what is here, how
to read it, and how it is kept.

## What is here

The archive mirrors the record's paths: a moved entry stands in the file of the same name under `docs/archive/` that
its live file has under `docs/`.

| Kind | From | To | Moves when |
|---|---|---|---|
| Open questions | `architecture/open-questions/<part>.md` | `archive/architecture/open-questions/<part>.md` | the claims gate reads the question as ruled, closed, resolved or withdrawn |
| Owner decisions | `architecture/owner-decisions/<part>.md` | `archive/architecture/owner-decisions/<part>.md` | an ESC, SR or GD entry is ruled and a sentence of `spec/` carries its ruling |
| ADR history | `architecture/adr/<nnnn>-….md` | `archive/architecture/adr/<nnnn>-history.md` | a revision's explanation, a correction holding only the falsified reason, a struck sentence beside its dated replacement |
| Repaired defect notes | `defects/` (and the retired `defects/fixed/`) | `archive/defects/<name>.md` | the note is repaired |
| Superseded requirements | `spec/<NN-domain>/<part>.md` | `archive/spec/<NN-domain>/<part>.md` | the artifact marks the requirement withdrawn or superseded; only its text beyond the definition moves |

An entry moves whole and verbatim, under its own anchor; only a relative path in it is rewritten to reach the same file
from here. A file that would pass the document budget continues in `<part>-continued-<k>.md`.

## Reading an archived entry

Start from the live file. Where an entry stood, its live file keeps one line that names it and links here:

- an open question or an owner decision: `- OQ-<n> — <title>; ruled <date>; [archived](…#oq-<n>)`;
- an ADR's history: `*History: [the correction of <date>](…/<nnnn>-history.md#correction-<date>).*`;
- a requirement: `*(Text archived: [docs/archive/spec/…#req-x-nnn](…) — withdrawn)*` under its definition line, which
  stays in `docs/spec/` with its marker and its directive back-pointer: the specification alone defines identifiers, and
  `pnpm symbols` never reads this folder;
- a repaired note has no line left behind: every pointer to it, in the record, the code and the agent instructions, was
  repointed here when it moved.

Each archive file opens with a sentence naming the live file it mirrors. A gate that asks what the record holds reads
live and archived parts alike (`tools/record-parts.mjs`), so a question moved here is still settled for the claims gate,
and a link to a moved anchor was repointed to it.

## Who writes here

**Only the script**, `tools/archive/migrate.mjs`. Nothing here is edited by hand after it moves, and since 2026-11-02 that
is checked: every run writes [`manifest.json`](manifest.json), one SHA-256 per archived entry (an entry is the text from
one column-0 `<a id="…"></a>` to the next, or a whole file without one; its line endings read as LF), and `--check` fails
on an entry whose text differs from its hash, one the manifest does not hold, and one it holds that is gone, naming each.
This page and the manifest are the only files here the script does not hash.

A deliberate change (a date a ruling lacked, a note repaired after it moved) is made and then registered by a run of
`pnpm archive:migrate`, which rewrites the manifest from the archive as it stands, in the same commit. A repaired note
moved straight into `archive/defects/` is registered the same way. A rebase that conflicts on `manifest.json` or on a
moved entry is resolved by re-running the script, never by merging the file by hand.

## The commands

```
pnpm archive:migrate                      move what qualifies, repoint every link, rewrite the manifest
pnpm archive:migrate --dry-run            print what would move and which files would change; write nothing
pnpm archive:migrate --dry-run --verbose  the same, with each ADR passage and each ruling's evidence
node tools/archive/migrate.mjs --check    fail while anything that qualifies is live, or the archive differs from its manifest (in pnpm lint)
```

The run is idempotent and deterministic: a second run changes nothing, and the same tree gives the same output. Each
kind is a module of `tools/archive/` with its rule as code and a test over fixtures beside it: `migrate.mjs` (open
questions), `owner-decisions.mjs`, `adr-history.mjs`, `defects.mjs`, `spec.mjs`, and `manifest.mjs` for the guard.

## What the first execution found

The whole migration's counts, the live record's size before and after and the gate's cost are in
[`architecture/hardening.md` §6](../architecture/hardening.md#6-requirements-traceability-and-the-decision-archive--r-092)
and [`first-executions.md`](../architecture/first-executions.md).
