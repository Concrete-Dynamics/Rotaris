---
reference: ROTARIS-CRW-001
domain: requirements-traceability
date: 2026-08-30
status: resolved
---

# Open-Question Resolutions — Domain 08, Requirements Board and Traceability


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **Row 6 is still valid and is recorded here so it is not swept up with the rest.** It resolves "no
>   locking, leases or coordination files; every artifact the toolchain writes is written by atomic
>   replace". REQ-TRACE-513 keeps the requirement documents, the three baselines, the generated symbol
>   artifact and the retired-identifier log as **plain files in the user's own repository**, so this
>   disposition survives untouched and no store's concurrency properties reach those four artifacts.
> - **ESC-14 withdrew SR-4's claim that the database dissolves OQ-41.** It does not: those artifacts never
>   reach any store. What narrows the defect is **SR-1** (one running instance), which removes the
>   unbounded concurrent processes the defect rested on. A residue remains, recorded as OQ-44: no
>   requirement in the corpus now states a Windows retry ladder for these four files, and REQ-TRACE-061
>   requires a failed replace to be re-raised.


This record disposes of every open question raised in the draft of
[`08-requirements-traceability.md`](../08-requirements-traceability.md) (requirement prefix
`REQ-TRACE`). It was produced under the product-owner decisions recorded on 2026-08-30:

1. **Compatibility ambition — behavioural inspiration only.** The rewrite owes no other
   implementation a matching format, command surface, exit code or event vocabulary. Where the
   draft left a case under-determined, this record chooses; awkward or arbitrary behaviour is never
   preserved for compatibility's sake.
2. **Defect policy — omit what conflicts.** Internal contradictions are resolved towards the
   reading more coherent with the rest of the document and stated normatively. Where a conflict
   admits no coherent resolution, the behaviour is omitted rather than reproduced.
3. **Unbuilt-but-intended behaviour is in scope.** A requirement is not dropped merely because it
   describes intent rather than something known to work.
4. **Scope — the product is one Electron desktop application.** It has no command-line interface and
   no terminal user interface; both were removed, not deferred. Domains 17 and 18 are retired and
   the `REQ-TUI` and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. The
   dispositions below were taken before that decision; the graphical-only sweep further down applies
   it to this domain. The traceability engine itself is untouched — what was withdrawn is the way a
   user drove it.
5. **Message text — information content, not wording.** Human-readable messages are specified by
   what they must convey; exact phrasing is left to the implementation. Exact strings are fixed
   only where they form part of a machine-readable contract.

Requirement identifiers are permanent. Amendments were made in place; new behaviour that no
existing requirement covered was added as `REQ-TRACE-501` and upward.

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | The commit-time hook stages exactly the two paths the toolchain may write (the generated artifact and the retired-identifier log) and nothing else; it blocks on **errors only**, printing warnings without declining the commit; it finds the repository root by the ordinary discovery walk starting from the directory it was invoked in, needing no activated environment. | REQ-TRACE-185 |
| 2 | RESOLVED | A base revision that exists but predates the generated artifact takes the base-unavailable path, indistinguishable from a missing revision: no changes computed, one "no base artifact" line, exit 0 even under `--strict`. Reconstructing a "before" state from historical documents stays forbidden. | REQ-TRACE-158 |
| 3 | RESOLVED | Output ordering is pinned **within each stream** for a combined invocation: stdout carries the regeneration notice, the three baseline notices, warnings, statistics, then the OK line; stderr carries errors then the failure line. Cross-stream interleaving is explicitly unspecified and may not be relied upon, because the two streams may be redirected separately. | REQ-TRACE-147 |
| 4 | RESOLVED | Convention registration is one totally ordered sequence with no simultaneous entries, so "earliest wins" always decides and no further tie-break exists: the built-in convention is position one, project-declared conventions follow in configuration order. A later duplicate claim is accepted silently and never consulted. | REQ-TRACE-074 |
| 5 | RESOLVED | The store parse gets a stated budget in the same shape as the sweep budget: linear in documents and bytes, of the order of 10^3 documents in about one second under the reference conditions, with peak memory bounded by the largest single document plus accumulated metadata records rather than by the store's total prose. | REQ-TRACE-501 (new), REQ-TRACE-088 |
| 6 | RESOLVED | No locking, leases or coordination files. Every artifact the toolchain writes is written by atomic replace — the retired-identifier log's non-atomic write is corrected — so a concurrent reader sees one whole version and two concurrent writers leave one whole file. No invocation waits for another; a racing check may legitimately report the artifact stale, and a re-run reports it fresh. | REQ-TRACE-502 (new), REQ-TRACE-126, REQ-TRACE-137, Data & Formats (retired-identifier log) |
| 7 | RESOLVED | An empty store is reported, not passed over: `check` emits a **warning** naming the store directory and distinguishing three findings via the probe — directory absent, no document carries frontmatter, or documents carry frontmatter but none declares an identifier (the "requirements we cannot read" case). The run still succeeds absent other violations and statistics report zero. | REQ-TRACE-503 (new) |
| 8 | RESOLVED | Reciprocal navigation lines are convention only and are validated by nothing: a missing, stale or wrong line produces no error and no warning from any command, and the derived-from integrity checks read the forward frontmatter link alone. | REQ-TRACE-196 |
| 9 | RESOLVED | The unbounded file-system scan is **deliberate policy**, and stated as such: cost is bounded by store and root size, a partial scan is worthless to a caller, and the layers that must abandon work own their own cancellation. The genuinely unbounded cost — a child process — is closed instead: command-line version-control invocations gain the same 30-second bound the consumer layer already applies, so no command can block indefinitely. | REQ-TRACE-154, REQ-TRACE-170, Data & Formats (numeric constants) |
| 10 | RESOLVED | Two enforcement levels, selected only at the command line: enforcing (default) and reporting (`check --report-only`). Reporting prints identical findings, including the failure line, but returns 0 for traceability violations; parse errors and a bad layout configuration still return 1 at either level. Every run prints which level was in force. Deliberately no configuration key, so a repository cannot disarm its own gate. A first-adopting repository gets its non-blocking coverage report by running `check --report-only` before any ratchet exists. | REQ-TRACE-504 (new), REQ-TRACE-142, REQ-TRACE-144, REQ-TRACE-145, REQ-TRACE-146, Data & Formats (command-line contract) |
| 11 | OMITTED | Automatic project-structure detection is withdrawn rather than specified. No requirement in this document defines a detection surface, the toolchain deliberately offers no authoring, migration or scaffolding command, and a half-specified detector proposing a layout would be a second, rival definition of the repository's shape. Adoption is: write the layout configuration, or accept the default layout unchanged. | REQ-TRACE-155 (narrowed to state the absence normatively) |
| 12 | RESOLVED | The declaration surface is built: a thirteenth layout key `annotation_conventions`, an ordered list of objects each carrying `name`, `extensions`, `reference_pattern`, `annotation_pattern`, `test_pattern` and `exempt_module_pattern`. Conventions register after the built-in one, in written order. A pattern that does not compile, a missing or unknown key, or an empty extension list is a configuration error. Concrete non-host-language conventions are supplied by the project, not shipped: the toolchain ships exactly one built-in convention. | REQ-TRACE-073, REQ-TRACE-039, REQ-TRACE-044, REQ-TRACE-045, Data & Formats (layout configuration) |
| 13 | RESOLVED | No wall-clock bound on the engine read behind a refresh, stated as a deliberate decision: the read runs off the interface thread, the board states that a refresh is in progress, the last good board stays on screen, and every external call the read makes is already bounded at 30 s. A deterministic refresh therefore has no stop control and no timeout. | REQ-TRACE-225 |
| 14 | RESOLVED | Last writer wins, stated normatively. The fold value is one JSON object string written whole, so a reader always sees one window's complete decision set and never a blend; two windows may overwrite each other's folds, which costs a fold and can never corrupt the value. No merge, no locking. | REQ-TRACE-313 |
| 15 | RESOLVED | Pruning is confined to project-supplied column keys (epic and source), which is the only place entries accumulate without bound. A decision recorded against a closed-vocabulary column is retained while that column is absent, so the blocked column returns carrying the decision the user last made about it. | REQ-TRACE-316 |
| 16 | RESOLVED | Immediately: unfolding realises the column's visible band within the same update that unfolds it, never on a later repaint, so an expanded column is never observable empty or half-painted. Folding releases that column's widgets in the same update. | REQ-TRACE-307 |
| 17 | RESOLVED | A node-count bound is added and stated: at most 50 neighbours per node per level, admitted in identifier order so the selection is deterministic. A node cut off this way joins the unexpanded set, and the statement of the bound says how many were left out and that re-centring shows them. Evidence nodes count under the same bound. | REQ-TRACE-505 (new), REQ-TRACE-324, REQ-TRACE-331 (cited) |
| 18 | RESOLVED | No pagination and no truncation. Every implementation site and covering test is listed, ordered by path then line, beneath a stated count per kind; the view scrolls. A site the view declined to show is a site nobody checks. | REQ-TRACE-265 |
| 19 | RESOLVED | The heading always states the true total; at most 20 rows are listed, and a final row states how many were not listed and, when activated, filters the board to the blocked requirements so the remainder stay reachable in one action. | REQ-TRACE-240 |
| 20 | RESOLVED | Segment colours are taken from the theme's semantic status tokens — the same tokens the alert severities use — and never written as literal values inside the widget, so a theme change reaches the indicator without a rebuild. The normative constraints stay the 3:1 floor and the never-colour-alone rule; concrete values belong to the design system, not to this specification. | REQ-TRACE-261 |
| 21 | RESOLVED | Not animated. The widening takes effect in the update that begins the drag and is surrendered in the update that ends it, so the refusal reason is legible for the whole drag instead of arriving part-way through. | REQ-TRACE-318 |
| 22 | RESOLVED | The prompt is withdrawn without performing the action and a stated notice names the requirement and says it is no longer in the state the action was offered for. Nothing is written and nothing is dispatched; the action becomes available again only by being invoked afresh. | REQ-TRACE-506 (new) |
| 23 | RESOLVED | The board has no exit code, and the specification now says so: exit codes govern the command-line surface only, and nothing in the board is to be described in terms of one. The adjacent headless command's exit semantics stay with the command-line domain. | REQ-TRACE-145 |
| 24 | RESOLVED | The filter is **preserved**, not cleared. Switching the grouping axis to a dimension a filter already narrows leaves the filter in force, so the board shows the one populated column that value produces plus whatever empty columns the axis rules require, and the filter summary still states the filter. Changing an axis never alters a filter and writes nothing. | REQ-TRACE-299 |
| 25 | RESOLVED | The subscription is supervised: an ended or failed subscription raises a persistent notice naming what stopped, carrying a re-subscribe action, keeping the last good board and continuing to state when it last evaluated. No polling, no automatic retry, no backoff, and explicitly no inference of a dead watcher from silence — an idle repository looks identical. The explicit re-evaluation control remains the guaranteed route to a current board. | REQ-TRACE-507 (new), REQ-TRACE-336 / REQ-TRACE-342 (cited) |
| 26 | RESOLVED | Not persisted. The graph opens at the default depth of 2 every time; depth belongs to the question being asked at that moment, not to the person, and the persisted display settings are not extended to cover it. | REQ-TRACE-323 |
| 27 | RESOLVED | At most one state-changing action per requirement may be in flight; a second request for a requirement that already has one is refused with a stated reason and writes nothing — not queued, not raced. No bound is placed on actions in flight across different requirements. | REQ-TRACE-388 |
| 28 | RESOLVED | Yes, and it is now stated as intended behaviour rather than left as a consequence: on the epic axis an epic card lands in the column named by its own identifier, alongside its own children. | REQ-TRACE-296 |
| 29 | RESOLVED | The default exempt marker is the bare token `trace-exempt`, deliberately free of any one language's comment punctuation because the marker is matched as a plain substring and must work inside whatever comment syntax the file uses. A project is not expected to change it; changing it rewrites the orphan baseline headers and the diagnostics quoting it on the next baseline update, which is a consequence to accept deliberately. | REQ-TRACE-039, REQ-TRACE-105 (cited), Data & Formats (layout configuration) |
| 30 | RESOLVED | An unrecognized frontmatter key is carried through untouched and otherwise ignored: no error, no warning, no part in any check. Rejecting it would contradict the write path's obligation to preserve fields the model does not represent, and would turn one added template field into a repository-wide parse failure. | REQ-TRACE-014 |
| 31 | RESOLVED | The prefix is declared by a new layout key `id_prefix`, defaulting to `REQ`, validated as uppercase letters and digits beginning with a letter and carrying no hyphen. It is deliberately not inferred from the documents, since inferring it from the first document scanned would let one typographical error silently redefine what every other document must say. | REQ-TRACE-022, REQ-TRACE-039, REQ-TRACE-044, Data & Formats (identifier format, layout configuration) |
| 32 | RESOLVED | The canonical hash is fixed: the first 32 hexadecimal characters of a SHA-256 over the LF-joined payload identifier, lifecycle, trace, test, type, comma-joined derived-from, title, and that identifier's own prose — every line stripped with interior whitespace collapsed. That makes it frontmatter-order and formatting independent and per-identifier distinct, and the 16/32 length difference lets a consumer detect being handed the wrong hash. | REQ-TRACE-037, Data & Formats (hashes, numeric constants) |
| 33 | RESOLVED | Every layout key now has a default and the default layout is complete: `generated_path` = `src/requirement_ids` plus the built-in convention's extension; `impl_roots` = `src`; `test_roots` = `tests`; `excused_test_roots` = empty; `exempt_marker` = `trace-exempt`; `id_prefix` = `REQ`; `annotation_conventions` = empty; and the four bookkeeping artifacts are named explicitly inside the store directory. | REQ-TRACE-039, REQ-TRACE-038 (cited), Data & Formats (layout configuration) |
| 34 | RESOLVED | Wording is left to the implementation, information content is fixed: each lifecycle has exactly one marker text, constant across generations so generation stays deterministic, and the three are distinct. Draft conveys not-yet-approved and nothing enforced; approved conveys approved and carrying its declared obligations; deprecated conveys deprecated and no new references, and is the longest. | REQ-TRACE-054 |
| 35 | RESOLVED | The comment form is fixed as a machine-readable contract: the case-insensitive token `covers:`, then one or more identifiers separated by commas and/or whitespace, recognized to end of line. The enumerated legacy-prefix list is abolished rather than invented: a non-canonical token resolves solely through the `legacy-id` alias table, so a project declares the legacy identifiers it recognizes on the requirements that inherited them, and an unresolved token warns as it already does. | REQ-TRACE-070, REQ-TRACE-076, REQ-TRACE-021 / REQ-TRACE-071 (cited), Data & Formats (identifier format) |
| 36 | RESOLVED | Reference conditions are stated: one execution thread on a contemporary developer workstation with a solid-state disk and a warm file-system cache, timing the sweep alone (enumeration, read, match) and excluding process start-up and the store parse. The linear-growth clause is the binding one; the wall-clock figure is checked under those conditions. | REQ-TRACE-088 |
| 37 | RESOLVED | A module is re-export-only when its parsed contents hold nothing but imports, module-level assignments naming exported symbols, and documentation or bare string-literal statements. Any function, class, conditional or other executable statement disqualifies it, and an unparseable module is never excused by this rule. A project-declared convention uses its own `exempt_module_pattern` instead. | REQ-TRACE-104, REQ-TRACE-073 (cited) |
| 38 | RESOLVED | The deadline field is **absent** when the wait is unlimited, never zero, so a consumer can tell "no countdown to draw" from "no time remains". The zero-means-unlimited convention stays confined to the stored settings space and does not reach the progress protocol. | REQ-TRACE-213, REQ-TRACE-467 (cited), Data & Formats (progress protocol) |
| 39 | RESOLVED | Both get a 100 ms interface-thread budget, measured at the minimum window size under the same reference conditions as the sweep budget: putting a board on screen once the engine has answered, and the post-debounce filter recomputation. A keystroke itself costs nothing beyond restarting the debounce timer and painting the character. | REQ-TRACE-239, REQ-TRACE-367, Data & Formats (numeric constants) |
| 40 | RESOLVED | The obligation-kind set is closed at three, in fixed indicator order: `implementation-trace` (owed when `trace: required`), `covering-test` (owed when `test: required`), `verification` (owed when the requirement is approved and the workspace declares a check suite). Segment count is therefore predictable from the requirement's own flags and lifecycle, and a fourth kind fails the presentation lookup rather than receiving a fallback. | REQ-TRACE-258, REQ-TRACE-262, Data & Formats (board tokens) |
| 41 | RESOLVED | Yes: the traced proportion is computed over the same population as the progress total — children that are not deprecated — so the two figures on one card always describe the same set. | REQ-TRACE-282 |
| 42 | RESOLVED | The supported bound is 100 populated columns; every guarantee in the document holds up to it. Beyond it the board still renders correctly and stays operable but claims no responsiveness budget, and it never truncates, hides or refuses a column on account of their number. | REQ-TRACE-300, Data & Formats (numeric constants) |
| 43 | RESOLVED | The move control takes the platform's primary modifier with `M`; the evidence view takes it with `E`. Both are registered through the application's own keybinding surface rather than bound privately by this view, so collisions are settled in one place and the chords stay re-bindable, and every sentence naming a chord names the one actually in force. | REQ-TRACE-390, REQ-TRACE-486 |
| 44 | RESOLVED | `proposed-requirements.json`, in the run's own artifact directory beside the requirement's recorded source: a JSON array of proposal objects, each carrying proposed title, proposed description, origin identifier and the execution unit that raised it. Written once by the run as it finishes, read and never written by the review. Absent, empty or unreadable reads as "this run put forward no proposals" and never fails the run or the review. | REQ-TRACE-427, REQ-TRACE-430 (cited), Data & Formats (board tokens) |
| 45 | RESOLVED | The default concurrency limit is **2**: a release dispatches an unattended, fully permitted run in its own worktree, and two are as many as one person can follow, while a third would mostly compete for the same reviewer's attention. A project wanting more says so, and the engine — not the control — enforces it. | REQ-TRACE-483, REQ-TRACE-481 (cited), Data & Formats (persisted state, numeric constants) |
| 46 | RESOLVED | The plain re-evaluation control holds the primary-action position: the one action always available, always meaningful and never destructive on a surface whose other writes are per card. While an analysing refresh runs, the stop it has turned into holds the position instead, so exactly one control occupies it at any moment. | REQ-TRACE-491, REQ-TRACE-342 / REQ-TRACE-343 (cited) |
| 47 | RESOLVED | The declaration lives in the layout configuration as one entry of `annotation_conventions`, carrying exactly `name`, `extensions`, `reference_pattern`, `annotation_pattern`, `test_pattern` and `exempt_module_pattern`; patterns are regular expressions over the file's normalized text. Because such a convention has no syntax tree, a test it collects spans the matched line plus the existing two-line slack above and takes the node identifier `path::name` with no class segment; the class-nesting rule stays with the built-in convention. | REQ-TRACE-073, REQ-TRACE-039, REQ-TRACE-044, Data & Formats (layout configuration) |
| 48 | RESOLVED | Findings are grouped by check and ordered by the check order the requirement already lists — generated artifact, malformed baseline lines, derived-from integrity, removed-requirement references, deprecated references, missing traces, missing coverage, stale baseline entries, unresolved legacy comments, orphan modules, orphan tests — each check's findings contiguous and internally ordered as that check specifies, in the error list and the warning list alike. | REQ-TRACE-091 |
| 49 | RESOLVED | The overscan margin is 5 cards above and 5 below the viewport band, and a column retains at most 20 released widgets for reuse; anything released beyond that is discarded. | REQ-TRACE-360, Data & Formats (numeric constants) |

## Summary

49 open questions: **48 RESOLVED**, **1 OMITTED** (question 11, automatic project-structure
detection), **0 ESCALATED**. One question (23) was answered by scoping rather than by new behaviour.
Seven new requirements were added, `REQ-TRACE-501` through `REQ-TRACE-507`, and no identifier was
renumbered, reused or deleted.

## Graphical-only sweep

Recorded 2026-08-30, after the dispositions above were settled. The product is one Electron desktop
application: it has no command-line interface and no terminal user interface, and domains 17 and 18
are retired. This domain's open questions were answered before that decision was taken, so it still
carried the shell surface every other domain has since had removed. That surface is swept here.

The traceability *engine* is untouched. What is withdrawn is the way a user drove it — the three
subcommands, their flags, the two byte streams, the emitted line shapes and the process exit codes.
The engine still runs external programs where it always did: the change comparison's version-control
queries stay in scope, keep their read-only child process and keep the 30-second bound (REQ-TRACE-170,
amended only to name the operation that issues them rather than "the command-line layer").

**Sixteen requirements** had no surface other than a shell invocation, a flag, a byte stream or an
exit code. Each is withdrawn in place, and every capability a user could reach through one is now
carried by a desktop requirement.

| Withdrawn | What its only surface was | Capability now carried by |
| --- | --- | --- |
| **REQ-TRACE-050** | A repository-root option on the command line, hidden from help output. | **REQ-TRACE-512** (new) — the root is the open workspace's, resolved by the discovery walk of REQ-TRACE-048 and REQ-TRACE-049 and never nominated by the user. A caller that already knows the root still supplies it, every entry point taking one. |
| **REQ-TRACE-142** | The three subcommands `check`, `generate`, `diff`, and a usage error exiting 2. | **REQ-TRACE-508** (check), **REQ-TRACE-509** (regenerate), **REQ-TRACE-511** (compare against a base revision) — the same three capabilities as desktop operations. |
| **REQ-TRACE-143** | Global `--repo-root` and `--layout` options preceding the subcommand. | **REQ-TRACE-512** (new) — root and layout configuration are both taken from the workspace the window has open. No override path exists, which is the point: there is one answer to "which repository is this about". |
| **REQ-TRACE-144** | The meaning of five flags. | **REQ-TRACE-509** (`--fix`), **REQ-TRACE-510** (`--update-baseline`), **REQ-TRACE-511** (`--base`, and the drift finding `--strict` gated on), **REQ-TRACE-508** (`--report-only`, which now needs no asking — see REQ-TRACE-504 below). |
| **REQ-TRACE-145** | Exit codes 0, 1 and 2, and their classification of failures. | **REQ-TRACE-508** (violations, parse errors), **REQ-TRACE-512** (a malformed layout configuration, an unanticipated failure), **REQ-TRACE-511** (unpropagated drift). Each is a stated finding instead of a number. The requirement's own observation that the board has no exit code now holds of the whole product, which settles OQ 23 more broadly than OQ 23 did. |
| **REQ-TRACE-146** | The `check` command's nine numbered steps, seven of which were writes to a stream. | **REQ-TRACE-508** — the ordering that survives is regenerate, then rewrite the baselines against the fresh parse, then verify. Stream routing has no successor and needs none. |
| **REQ-TRACE-147** | Line ordering within stdout and within stderr for a combined invocation (the OQ 3 resolution). | **REQ-TRACE-508** for the operation order; **REQ-TRACE-091** already fixes, for every surface alike, the order in which findings are presented. OQ 3's cross-stream caveat is moot: there are no streams. |
| **REQ-TRACE-148** | The `generate` command's output line and exit code. | **REQ-TRACE-509** — it reports the artifact path, which of "regenerated" and "already up to date" was observed, and the requirement count, so a rewriting run stays distinguishable from a no-op. |
| **REQ-TRACE-149** | Which findings went to stdout and which to stderr. | **REQ-TRACE-508** — errors, warnings, statistics and notices are presented together and told apart by what each one is, never by which stream carried it. |
| **REQ-TRACE-150** | A constant bracketed tag on every emitted line, for disentangling a mixed log. | None is owed. Nothing is emitted into a mixed log; findings are records, each already attributed by the location form of REQ-TRACE-100 (**REQ-TRACE-508**). |
| **REQ-TRACE-151** | The one-line statistics summary. | **REQ-TRACE-101** keeps the figures unchanged and **REQ-TRACE-508** requires them stated on every check. Only the line was withdrawn, never the numbers. |
| **REQ-TRACE-153** | A command-line entry point depending on the standard library alone, so a CI gate and a commit hook could run it. | **REQ-TRACE-013** keeps the self-containment that is still observable — no third-party parser, layout configuration in JSON. The two consumers it was sized for are themselves withdrawn below. |
| **REQ-TRACE-184** | A continuous-integration workflow invoking the plain check on pull requests and pushes. | **REQ-TRACE-183** — the meta-tests inside the project's own test suite, which any CI run of that suite exercises with no extra configuration — together with **REQ-TRACE-508** and the board's continuous evaluation (REQ-TRACE-334, REQ-TRACE-347). The capability is *finding out without remembering to look*, and it survives. |
| **REQ-TRACE-185** | A commit-time hook that regenerated, staged, and blocked the commit (the OQ 1 resolution). | **REQ-TRACE-508** states every violation over the repository as it stands; **REQ-TRACE-183** fails the project's own test suite on the same findings; **REQ-TRACE-402** refuses to record a requirement as delivered once its text has moved on. The staging half needs no successor: the two paths the toolchain may write are written by REQ-TRACE-509 and REQ-TRACE-510 and committed by the user like any other change. OQ 1 is superseded. |
| **REQ-TRACE-186** | Convenience build targets wrapping the check, with the direct command-line invocation as the contract. | None is owed. The four operations of REQ-TRACE-508 through REQ-TRACE-511 are the contract, and they are reached identically on every supported platform — which was the concern behind the original requirement. |
| **REQ-TRACE-504** | Two enforcement levels, selected only at the command line and observable only in an exit code (the OQ 10 resolution). | **REQ-TRACE-508** — the check performs the whole verification, states every finding and gates nothing by itself, so the complete non-blocking report a first-adopting repository had to ask for is what every check now produces. The decision that a repository may not disarm its own gate is kept there: no configuration key, no control, no suppressed finding. OQ 10 is superseded. |

### Requirements added

| New | Carries |
| --- | --- |
| **REQ-TRACE-508** | The desktop traceability check: the verification pass of REQ-TRACE-090 to REQ-TRACE-101 presented in the grouped order of REQ-TRACE-091, each finding located per REQ-TRACE-100 and openable at its line, statistics always stated, a clean repository stated in words, parse errors presented alone, nothing written, nothing gated, and the combined operation order. Distinct from the check-suite verification of REQ-TRACE-410, and it adds no key to the closed pane namespace of REQ-TRACE-375. |
| **REQ-TRACE-509** | The regeneration action: the generation of REQ-TRACE-059 to REQ-TRACE-063 with the retirement record of REQ-TRACE-132 and REQ-TRACE-133 written first, reporting path, outcome and requirement count, and writing nothing on parse errors. |
| **REQ-TRACE-510** | The baseline-update action: REQ-TRACE-123 to REQ-TRACE-129 performed deliberately and never as a side effect of reading a board. |
| **REQ-TRACE-511** | The change-comparison surface: a selectable base revision defaulting to the current one, the classified changes of REQ-TRACE-160 with their sites openable at file and line, the drift finding of REQ-TRACE-168 presented distinctly, and the unavailable-base and no-changes cases stated in words. |
| **REQ-TRACE-512** | Where the four operations run: the open workspace's root and the layout configuration found there, off the interface thread, one operation of a kind at a time, a configuration failure or an unanticipated failure stated rather than swallowed, nothing started on the view's own initiative, and no delivery record written by any of them. |

### Clauses struck, requirements kept

Each of these is otherwise in scope and loses only its shell half. Nothing moves.

- **REQ-TRACE-040** — the layout configuration path is no longer overridable "by an explicit
  command-line option"; the file at the repository root is the only one read.
- **REQ-TRACE-051** and the generated-artifact format — the header states *how* the artifact is
  regenerated (REQ-TRACE-509) instead of naming a command to type.
- **REQ-TRACE-013** — the parser's self-containment is justified by where the engine is embedded,
  not by the withdrawn commit-time hook.
- **REQ-TRACE-038**, **REQ-TRACE-089**, **REQ-TRACE-134**, **REQ-TRACE-196**, **REQ-TRACE-502** —
  "command" becomes "operation" where the word denoted a subcommand rather than a unit of work.
- **REQ-TRACE-071** — an unresolved legacy reference no longer "makes a command exit non-zero"; it
  is never reported as a violation.
- **REQ-TRACE-090**, **REQ-TRACE-093**, **REQ-TRACE-099**, **REQ-TRACE-107**, **REQ-TRACE-121**,
  **REQ-TRACE-123**, **REQ-TRACE-124**, **REQ-TRACE-127**, **REQ-TRACE-191** and the three baseline
  headers — every "the command to run" becomes the named action of REQ-TRACE-509 or REQ-TRACE-510.
  A diagnostic still names the concrete step that resolves it, which is what REQ-TRACE-099 asks.
- **REQ-TRACE-152** — the write discipline is unchanged; it now names the two actions that write
  rather than the two flags.
- **REQ-TRACE-154** — the silent-scan clause is restated without the statistics line and the
  per-change lines; the deliberate absence of a scan limit is untouched.
- **REQ-TRACE-155** — the toolchain still offers no authoring, renumbering, migration or scaffolding
  operation, the OQ 11 omission stands, and the creation form of REQ-TRACE-442 is named as the one
  surface that brings a requirement into existence.
- **REQ-TRACE-156**, **REQ-TRACE-158**, **REQ-TRACE-164**, **REQ-TRACE-166**, **REQ-TRACE-167**,
  **REQ-TRACE-169** — the comparison keeps every rule and loses the line-and-indent framing, the
  suppressed rendering and the exit codes.
- **REQ-TRACE-168** — drift is now always reported as a distinct finding rather than being selected
  by `--strict` and expressed as exit 1. Nothing suppresses it and nothing has to ask for it.
- **REQ-TRACE-170** — kept in full, including the 30-second bound of OQ 9. Only its framing moved
  from "this layer" to the comparison's own version-control queries, and the constant table entry is
  renamed accordingly.
- **REQ-TRACE-181** — the five enforcement moments become: compile-time through the generated
  symbols; the test session's regeneration; the meta-tests; the desktop check with the board's
  continuous evaluation; and the completion conditions no surface may relax. The post-compile hook,
  the build gate and the commit hook are gone.
- **REQ-TRACE-182** — the test session still regenerates before collection and still never blocks
  it; its notices go to the test run's own diagnostic reporting rather than to standard error.
- **REQ-TRACE-183** — the stale-artifact failure message names the regeneration action.
- **REQ-TRACE-187** — the acceptance criteria are restated without exit codes; the fifth, which
  exercised the commit hook, now requires that a violation introduced while the board is open shows
  on the card and on the check surface without a restart and blocks delivery (REQ-TRACE-402).
- **REQ-TRACE-188** — six propagation triggers become five; "a commit the hook declined" is gone and
  the other five are untouched.
- **REQ-TRACE-189** — the procedure names the comparison, the regeneration and the check by
  requirement rather than by command, and completes when the check reports no violation and the
  comparison reports no drift.
- **REQ-TRACE-206**, **REQ-TRACE-377** — the prohibition on a consuming surface or a desktop module
  launching a checker as a process is kept and reworded, since there is no command-line module left
  to import.
- **REQ-TRACE-218** — the seam's second independent host is a programmatic embedding of the engine,
  the project's own test suite among them, in place of the headless verification command. Two hosts
  are still required, which is the whole point of the requirement.
- **REQ-TRACE-464**, **REQ-TRACE-471** — "headless invocation" and "the terminal interface or the
  headless command line" are struck; the substance (a composition without a coordinator still runs;
  the board's permission elevation reaches no other run) is unchanged.
- **REQ-TRACE-498** — the failure table's command-line row is replaced by the desktop behaviour: an
  unreadable layout configuration is stated in the terms of REQ-TRACE-046, with no operation
  performed and nothing written.
- **REQ-TRACE-500** — a broken trace still fails compilation and still fails the project's own
  meta-tests, and is stated as a violation by the check; the post-compile hook, the CI gate and the
  commit hook drop out of the sentence, and the propagation triggers become a build, a test run, or
  a change the board observes for itself.
- **REQ-TRACE-503** — the empty-store warning keeps its three findings and its zero statistics; its
  venue is the check of REQ-TRACE-508 rather than the `check` command.

The section heading **Command-Line Surface** is renamed **Toolchain Operations**, and the Data &
Formats subsection **Command-line contract** is replaced by **Toolchain operations**, which states
the four operations, what each reports, what each writes, and the results a surface must be able to
state. The numeric constant "Command-line version-control timeout" is renamed
"Change-comparison version-control timeout"; its value is unchanged at 30 s.

Sixteen requirements withdrawn, five added (`REQ-TRACE-508` through `REQ-TRACE-512`), no identifier
renumbered, reused or deleted. Dispositions OQ 1, OQ 3, OQ 10 and OQ 23 are superseded by this
sweep; OQ 9's 30-second bound and OQ 7's empty-store warning survive it intact.
