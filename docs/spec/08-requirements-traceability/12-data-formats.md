# Requirements Board and Traceability — Requirement document

Part 12 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part.

## Data & Formats

Every artifact described below is a **file in the user's own repository** and stays one; REQ-TRACE-513 states that boundary and the grounds that reach it, and REQ-TRACE-089 fixes the only terms on which an index over these files may exist.

### Requirement document

```
---
req-id: <PREFIX>-<number>              # or a bracketed list: [<PREFIX>-<a>, <PREFIX>-<b>]
status: draft | approved | deprecated
trace: required | optional             # default required
test: required | optional              # default required
title: <free text>
type: product | technical              # default product
derived-from: <PREFIX>-<n>             # or a bracketed list; technical only, mandatory there
legacy-id: <legacy identifier>         # optional provenance, NOT unique across documents
priority: <token>                      # optional provenance
epic: <PREFIX>-<n>                     # optional provenance; parent epic is derived from layout
date: <YYYY-MM-DD>                     # optional provenance
source: <original document path>       # optional provenance
---

# <PREFIX>-<n> - <Title>

<prose>
```

- The frontmatter delimiters are lines that strip to exactly three hyphens; the opening one must be line 1.
- A field line opens with a letter, continues with letters, digits, underscores or hyphens, and then carries a colon; any other line continues the field above it, joined with one space.
- A value is the text after the first colon, stripped, with one matching outer quote pair removed.
- A multi-identifier document adds, per declared identifier, a heading of level 2 to 6 beginning with that identifier, optionally followed by an override block whose keys are a lowercase letter, any run of lowercase letters and hyphens, and a colon.
- Prose extraction: for a single-identifier document, the text between the top-level identifier heading and the first second-level section; for a multi-identifier document, the text of that identifier's own section.

### Identifier format

- `<PREFIX>-<digits>` and nothing else, where `<PREFIX>` is one uppercase token fixed for the project, declared by the layout key `id_prefix` and defaulting to `REQ`. No leading zeros, no upper bound on the number.
- `x00` is an epic; `x01` upward are that epic's requirements; one hundreds-block per epic.
- Maps to a generated integer-valued symbol whose value equals the number.
- Transitional coverage comment: the case-insensitive token `covers:` followed by one or more identifiers separated by commas, whitespace, or both, recognized to the end of that line. Each token is either a canonical identifier or a run of one or more hyphen-separated alphanumeric segments; a non-canonical token resolves only through the `legacy-id` alias table, and there is no hard-coded list of legacy prefixes.

### Hashes

- Store content hash: the first **16** hexadecimal characters of a SHA-256 over the whole normalized document text.
- Global fingerprint: a full SHA-256 (64 hexadecimal characters) over the newline-joined per-requirement payload `identifier|status|int(trace)|int(test)|title|source_path|content_hash|type|comma-joined derived-from`, requirements in ascending number order.
- Canonical hash: the first **32** hexadecimal characters of a SHA-256 over the LF-joined payload `identifier`, `status`, `trace`, `test`, `type`, comma-joined `derived-from`, `title`, and that identifier's own prose — each line stripped and its interior whitespace collapsed to single spaces. Frontmatter-order and formatting independent, distinct per declared identifier, and not interchangeable with the store hash; the two are told apart by length.

### Generated requirement-symbol artifact

The artifact is a source file in the host language. Its contents appear in this fixed order:

1. A documentation header stating that the file is generated and must not be hand-edited, naming the store directory it was compiled from, and stating how it is regenerated.
2. A suppression directive for the linter, then one for the formatter.
3. A comment line carrying a labelled fingerprint whose value is 64 hexadecimal characters (a full, untruncated SHA-256).
4. Whatever the host language requires in order for the items below to resolve: the integer-enumeration base the enumeration is built on, and the metadata record together with the lifecycle enumeration, both of which the hand-written declarations module defines and this artifact only refers to. The artifact declares no type of its own here; what a reader can observe is that those names resolve to the hand-written declarations and to nothing this file introduced.
5. One integer-valued enumeration, holding one member per requirement in ascending number order. Each member's name is the requirement identifier with its separator replaced by an underscore, its value is the requirement number, and it is followed by a documentation string reading `[<status marker>] <title> - <source path>` and then a blank line.
6. A constant holding the frozen set of deprecated members. It is emitted even when nothing is deprecated, in which case it is an empty set; otherwise it spans several lines.
7. A constant holding a mapping from requirement number to a metadata record. Each record is built by a positional call whose arguments are, in order: identifier, number, lifecycle, title, source path, trace-required flag, test-required flag, content hash, type, and the derived-from tuple.

Members appear in ascending number order. The file is written UTF-8 with LF line endings and a trailing newline, and is replaced atomically. The status marker used for a deprecated requirement is the longer, explicit wording that forbids adding new references.

### Debt baseline

```
# <header: shrink-only; the line shape; how to pay debt; the pruning action;
#  never add entries for new work>
<PREFIX>-<n> trace
<PREFIX>-<n> test
<PREFIX>-<n> test trace
```

Flags sorted and space-joined; entries ascending numerically; blank lines and comment lines skipped; malformed lines reported with a 1-based line number counted over the raw file.

### Orphan-module baseline

```
# <header: shrink-only; the remedies; the pruning action; quoting the configured exempt marker>
<repository-relative source path>
```

One path per line; the basename must contain a dot and the line must contain no space; rendered sorted lexicographically.

### Orphan-test baseline

```
# <header: shrink-only; the remedies; the pruning action; quoting the configured exempt marker>
path/to/test_file.<ext>::test_function
path/to/test_file.<ext>::ClassName::test_method
```

A path with an extension, zero or more `::`-separated class segments, and a final `::`-prefixed test segment; rendered sorted.

### Retired-identifier log

```
# <header: append-only; a tombstone is the only record a deleted identifier existed;
#  reusing a tombstoned identifier is rejected; identifiers are never reassigned>
<PREFIX>-<n><TAB><YYYY-MM-DD><TAB><last known title>
```

Records ascending by number; at least two tab-separated fields required; the title field optional; malformed lines skipped silently; the write is atomic, with the retry ladder, on the terms REQ-TRACE-061 fixes (temporary file in the same parent directory, then an atomic replace).

### Layout configuration (`rotaris-traceability.json`, at the repository root — REQ-TRACE-040)

```json
{
  "layout": {
    "requirements_dir": "docs/requirements",
    "id_prefix": "REQ",
    "generated_path": "src/requirement_ids.<ext>",
    "impl_roots": ["src"],
    "test_roots": ["tests"],
    "excused_test_roots": [],
    "baseline_path": "docs/requirements/debt-baseline.txt",
    "orphan_baseline_path": "docs/requirements/orphan-modules.txt",
    "test_orphan_baseline_path": "docs/requirements/orphan-tests.txt",
    "tombstone_path": "docs/requirements/retired-identifiers.tsv",
    "exempt_marker": "trace-exempt",
    "skip_parts": ["<generated-cache directory>", "<installed-dependency directory>", "fixtures"],
    "annotation_conventions": [
      {
        "name": "<convention name>",
        "extensions": [".<ext>", "..."],
        "reference_pattern": "<expression capturing one identifier or number>",
        "annotation_pattern": "<expression matching a whole annotation site>",
        "test_pattern": "<expression capturing a collectable test function name>",
        "exempt_module_pattern": "<expression matching an excused module>"
      }
    ]
  }
}
```

The values shown are the defaults; a repository that configures nothing behaves exactly as one that writes all thirteen of them. The two placeholder entries in `skip_parts`, like the source extension in `generated_path`, stand for names REQ-TRACE-039 leaves to the implementation language's toolchain; `fixtures` is the one component name that requirement fixes. Keys may also sit at the top level. Unknown keys are an error listing offenders and accepted keys, both sorted. Path values must be non-empty, relative, free of `..`, and are normalized to forward slashes. List-valued keys reject a bare string. `id_prefix` must be uppercase letters and digits, beginning with a letter and carrying no hyphen. `annotation_conventions` is an ordered list of objects carrying exactly the six keys shown, registered after the built-in convention; an expression that does not compile is a configuration error.

### Toolchain operations

The toolchain offers exactly four operations, every one of them reached from the desktop application and none of them from a shell. There is no invocation, no flag, no stream and no exit status.

| Operation | What it reports | Writes |
| --- | --- | --- |
| Check (REQ-TRACE-508) | errors and warnings grouped and ordered by REQ-TRACE-091, each located per REQ-TRACE-100; the statistics of REQ-TRACE-101; a stated "no violations" result; parse errors alone where the store will not parse | nothing |
| Regenerate (REQ-TRACE-509) | the artifact path, which of "regenerated" or "already up to date" was observed, the requirement count; parse errors where the store will not parse | the generated artifact and the retired-identifier log |
| Update baselines (REQ-TRACE-510) | per baseline, the file written and the resulting entry count | the three baselines |
| Compare against a base (REQ-TRACE-511) | one entry per change with its sites; the drift finding; "no base artifact"; "no requirement changes" | nothing |

| Aspect | Value |
| --- | --- |
| Repository root | the open workspace's, resolved by the discovery walk; never nominated by the user |
| Layout configuration | `rotaris-traceability.json` at that root (REQ-TRACE-040); no override path exists |
| Base revision default | the revision the working tree sits on |
| Combined order | regenerate, then rewrite the baselines against the fresh parse, then verify |
| Enforcement | the check gates nothing by itself; no control and no configuration key suppresses a finding |
| Concurrency | at most one operation of a kind per workspace in flight; a second request is refused with a stated reason |

Distinct results a surface must be able to state, each of them required by the operation named in the table above and none of them fixed here: no violations; a violation count; an error; a warning; a parse error; a configuration error naming the configuration path and its cause (REQ-TRACE-046, REQ-TRACE-512); an unanticipated failure naming what failed (REQ-TRACE-512); a regeneration outcome naming the artifact path and which of "regenerated" or "already up to date" was observed together with the requirement count (REQ-TRACE-509); the three baselines written, each with a path and an entry count (REQ-TRACE-510); the statistics (REQ-TRACE-101); "no base artifact to compare against" (REQ-TRACE-158); "no requirement changes" (REQ-TRACE-167); the per-change entries (REQ-TRACE-164); the count of unpropagated requirements; and the empty-store warning naming the store directory and which of the three empty findings holds.

Statistics fields (REQ-TRACE-101): total requirements; approved, traced and test-covered counts; and the four baseline-debt counts labelled trace, test, orphan and orphan-test.

Change-comparison entry, whose fields are REQ-TRACE-164's, whose obligation text per kind is REQ-TRACE-165's, and whose empty-site cases are REQ-TRACE-166's:

```
<KIND> <identifier> '<title>'[ (<from> -> <to>)]: <obligation text>[  <drift marker>]
    <file>:<line> (<kind>)
    ...
```

with a single "no annotation sites yet" placeholder for an added or modified change that has none, and no site entries at all for a removed or status change that has none.

### Progress protocol

Each line below is fixed by the requirement named beside it; this summary fixes nothing of its own.

- Phases: `reading`, `checks`, `coverage`, `recording`, `adopting` — the closed set of REQ-TRACE-210.
- Sequences: verification is `reading` then `checks` then `coverage` then `recording`; adoption is `reading` then `checks` then `coverage` then `adopting` then `recording` (REQ-TRACE-211).
- Phase report: the phase and the number of items it will report, a total of **0** meaning one indivisible step. It always precedes that phase's first item report (REQ-TRACE-213).
- Item report: the phase, a label, a **1-based** position, the phase total, an optional detail, and the deadline in seconds applying to the item in progress — the deadline being **absent** where the wait is unlimited, never zero (REQ-TRACE-213).
- Both are delivered on the pass's own thread (REQ-TRACE-214). With no consumer: no reporting work at all, and an identical report, identical records and identical writes (REQ-TRACE-215).
- Throttling: only above **20** items in a phase; minimum publication interval **0.1 s**; a phase change and a phase's last item are always published (REQ-TRACE-351).

### Board tokens

Each vocabulary below is closed by the requirement named beside it; this list holds no second copy of
any of them and adds nothing to any of them.

- Delivery columns: `backlog`, `ready`, `running`, `review`, `needs-update`, `done` (REQ-TRACE-232); plus `blocked`, which is a condition rather than a stage of progress (REQ-TRACE-241).
- Grouping axes: `delivery` (default), `health`, `lifecycle`, `epic`, `priority`, `source` (REQ-TRACE-293).
- Sort orders: priority-then-identifier (default), identifier, health-then-identifier (REQ-TRACE-287).
- Priority order: `Critical`, `High`, `Normal`, `Low`, then everything else (REQ-TRACE-288).
- Health tokens: `healthy`, `needs-update`, `incomplete-traceability`, `verification-failed`, `blocked`, `superseded`, `deprecated` (REQ-TRACE-252).
- Board actions: `release`, `return`, `accept`, `rerun`, `send-back`, `reject`, `hold`, `resume`, `answer-blocker`, `edit`, `create`, `accept-proposal`, `accept-change-work`, `keep-worktree` (REQ-TRACE-382).
- Blocker kinds: `dependency`, `conflict`, `decision`, `run-failure`, `stated` (REQ-TRACE-446).
- Blocker answer paths: choose, navigate, `resume` (the path described as clearing the blocker), inspect (REQ-TRACE-448).
- Relation tokens: `parent`, `children`, `derived-from`, `derived-requirements`, `supersedes`, `superseded-by`, `depends-on`, `blocks`, `refines`, `refined-by`, `conflicts-with`, `related-to` (REQ-TRACE-274).
- Detail sections: `requirement`, `relations`, `execution`, `traceability`, `verification` (REQ-TRACE-271).
- Review element keys, in order: agent summary; reported risks; completion claim; checks run; verification; changed files; traceability changes; unmet completion conditions; specification version; execution units; branch and worktree; proposals. Sides: claim, measurement, work (REQ-TRACE-420).
- Review decision order: accept, rerun, send-back, edit, reject, keep-worktree (REQ-TRACE-422).
- Queue controls: automatic, concurrency, stop, start (REQ-TRACE-479).
- Pane keys: `review`, `queue`, `editor`, `create`, `blockers` (REQ-TRACE-375); view identifier `requirements`; cross-view navigation targets: the workspace view and the version-control view (REQ-TRACE-475).
- Graph node kinds: `requirement`, `epic`, `implementation`, `test` (REQ-TRACE-326); an evidence node identifier is `<site kind>:<address>` (REQ-TRACE-331).
- Column header text: `<Label> · <count>`. Column keys that are project-supplied identifiers print as-is; other keys are title-cased by splitting on hyphens (REQ-TRACE-234).
- Test node identifiers: `path::function` or `path::Class::function` (REQ-TRACE-111).
- Evidence obligation kinds, in indicator order: `implementation-trace`, `covering-test`, `verification` (REQ-TRACE-258).
- Recorded-evidence states: `satisfied`, `stale`, `failed` (REQ-TRACE-270).
- Drag payload: a private application-specific transfer type, never plain text (REQ-TRACE-396).
- Run branch naming: the branch a unit run occupies is named by the requirement-execution `branch_template` REQ-GIT-074 defines, which is normative for the template, its placeholders and its default; this document restates neither and observes only that a unit's branch is derived from the requirement identifier and the unit id.
- Named on-disk files carried between a run and its review: the requirement's recorded source, and the run's proposed technical requirements — `proposed-requirements.json`, a JSON array of proposal objects in the run's artifact directory.

### Persisted state

Workspace configuration (travels with the repository). Every key below is registered by the settings
domain, which fixes its name, type and default; this table holds no second copy of any of them and
names only what this domain relies on each for. The scheduling keys are REQ-CONFIG-196's, the
human-in-the-loop and change-analysis keys REQ-CONFIG-198's, `permission_mode` REQ-CONFIG-122's and
`allow_unsandboxed_autonomous` REQ-CONFIG-124's, with the two together forming the elevation
REQ-CONFIG-411 defines:

| Key | Values | What this domain relies on it for |
| --- | --- | --- |
| `requirements.scheduling.mode` | `manual` / `automatic` | whether the queue picks the next candidate up on its own (REQ-TRACE-483) |
| `requirements.scheduling.*` (concurrency limit) | integer | how many units run at once; the control's own input ceiling of 64 is REQ-TRACE-481's and is not this key's |
| `requirements.change.analyze_changes` | boolean | when off, the board states why change analysis produced nothing |
| `requirements.human_in_the_loop.confirm_source_writes` | boolean | never consulted for an accepted derived-requirement proposal |
| `runtime.permission_mode` | e.g. `ask` / `autonomous` | board runs receive the permissive value for that run only |
| `runtime.allow_unsandboxed_autonomous` | boolean | the second half of the board-run elevation |
| requirement source configuration | — | which sources exist, which declare the create capability, which are writable |

Person- and installation-level preferences (stay on this machine). They live in the per-user desktop preference store, whose key set REQ-SHELL-006 registers. This domain owns what each of them means; the type and default of `requirements/fullPermissionRuns`, `requirements/fullPermissionNoticeSuppressed` and `requirements/answerWaitSeconds` are registered by REQ-CONFIG-405 and are repeated below only as the values this domain relies on:

| Key | Default |
| --- | --- |
| `requirements/filter/{text,epic,source,lifecycle,health,priority}` | `""` |
| `requirements/sort` | `priority` |
| `requirements/blocked_column` | `true` — any value other than the string `false`, case-insensitively, reads as true |
| `requirements/axis` | `delivery` |
| `workspaces/<resolved absolute path, or the literal default key>/requirementColumnFolds` | `{}` — one JSON object string, keys sorted, mapping column key to boolean |
| `requirements/fullPermissionRuns` | on |
| `requirements/fullPermissionNoticeSuppressed` | off |
| `requirements/answerWaitSeconds` | `0`, meaning indefinitely |

Boolean reads MUST tolerate however the settings backend wrote them: a text backend round-trips a boolean as a string, a native backend does not.

### Numeric constants

Every figure below is fixed by the requirement named beside it and is gathered here only so the whole
set can be checked at once; this table fixes nothing of its own, and where it and a defining
requirement differ, the requirement governs.

| Constant | Value | Defined by |
| --- | --- | --- |
| Content hash length | 16 hexadecimal characters | REQ-TRACE-036, REQ-TRACE-037 |
| Canonical hash length | 32 hexadecimal characters | REQ-TRACE-037 |
| Global fingerprint length | 64 hexadecimal characters | REQ-TRACE-052, REQ-TRACE-058 — the length of an untruncated SHA-256 in hexadecimal, which is what those two require |
| Deprecated-reference site cap | 5, then an "and N more" tail | REQ-TRACE-095 |
| Orphan-test annotation window slack above the span | 2 lines | REQ-TRACE-112 |
| Whole-file replacement retry ladder | 5 attempts in total; delays of 0.05 / 0.1 / 0.2 / 0.4 s before the four retries; the last attempt within 0.75 s of the first | REQ-TRACE-061 — the only replacement ladder this domain states, covering the generated artifact, the baselines, the retired-identifier log and the export destination, and cited by REQ-LIBRARY-176 |
| Consumer-layer version-control timeout | 30 s | REQ-TRACE-201 |
| Change-comparison version-control timeout | 30 s | REQ-TRACE-170 |
| Minimum supported window | 1000 × 680 | REQ-SHELL-022, which fixes the figure; REQ-TRACE-237 states what this domain guarantees at it |
| Open column width | minimum 276, maximum 340; margins 10 on every side | REQ-TRACE-238 (the two widths), REQ-TRACE-310 (the margin) |
| Folded rail | 8 characters of its own font wide; 2 heading lines; margin 4 | REQ-TRACE-310 (width and margin), REQ-TRACE-309 (heading lines) |
| Folded rail extra height during a drag | 1.5 lines | REQ-TRACE-318 |
| Folded column width during a drag | the open-column minimum, 276 | REQ-TRACE-318, over the minimum REQ-TRACE-238 fixes |
| Realised card widgets | the viewport band plus a margin of 5 cards above and 5 below; up to 20 released widgets retained per column for reuse | REQ-TRACE-360 |
| Search debounce | 150 ms | REQ-TRACE-363 |
| Evaluation retry while a read is in flight | 150 ms | REQ-TRACE-350 |
| Elapsed-clock redraw interval | 1000 ms | REQ-TRACE-352 |
| Progress throttle threshold / minimum publication interval | above 20 items / 0.1 s | REQ-TRACE-351 |
| Graph depth | floor 1, default 2, ceiling 3; not persisted | REQ-TRACE-323 |
| Graph neighbours admitted per node per level | 50, in identifier order, with the omitted count stated | REQ-TRACE-505 |
| Graph unexpanded-identifier list cap | 4, then an "and N more" tail | REQ-TRACE-324 |
| Blocked summary rows listed | 20, then a row stating how many more and filtering the board to them | REQ-TRACE-240 |
| Card dependency list cap | 4, then an "and N more" tail | REQ-TRACE-243 |
| Refusal-report cap inside a notice | 20 | REQ-TRACE-415 |
| Concurrency control ceiling | 64 | REQ-TRACE-481 |
| Default concurrency limit | 2 | REQ-CONFIG-196, which registers the key and its default; REQ-TRACE-483 states that a workspace setting none of the queue keys takes it |
| Supported populated-column bound on an open axis | 100 | REQ-TRACE-300 |
| Interface responsiveness budget | 100 ms to put a board on screen once the engine has answered, and 100 ms for the post-debounce filter recomputation | REQ-TRACE-239 (board on screen), REQ-TRACE-367 (post-debounce recomputation) |
| Primary action height / other control height | 32 / 24 | REQ-TRACE-491 |
| Closed-vocabulary / open-vocabulary drop-down width | 240 / 150 | REQ-TRACE-490 |
| Contrast floors | 3:1 for status marks against the card ground; 4.5:1 for alert text | REQ-TRACE-261 (status marks), REQ-TRACE-247 (alert text) |
| Relative-age thresholds | under 60 s, under 1 hour, under 1 day, otherwise days | REQ-TRACE-250 |
| Wait budget | not fixed here — `runtime.approval_timeout_seconds` (REQ-CONFIG-126, REQ-TOOLS-055), cited by REQ-TRACE-467 | REQ-CONFIG-126 |
| Sweep scale expectation | order 10^4 annotation sites over order 10^3 files in about 1 s | REQ-TRACE-088, whose reference conditions are part of the figure |
| Virtualisation acceptance | a 300-card column realises fewer than a quarter of its members; the realised count does not grow with column length; revealing a named card realises that card and its band only | REQ-TRACE-365 |
