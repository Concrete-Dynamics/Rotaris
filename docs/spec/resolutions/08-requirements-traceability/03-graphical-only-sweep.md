# Open-Question Resolutions — Domain 08, Requirements Board and Traceability — Graphical-only sweep

Part 3 of 4 of [domain 08's resolutions](../08-requirements-traceability.md), which indexes every part.

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

  > **Corrected 2026-09-01, in the ruling-application round.** This substitution named a host the
  > product does not have: REQ-EVENTS-178 states there is no embedding surface and no programmatic
  > entry point, and the identical defect was corrected in REQ-EVENTS-081 and REQ-HOOKS-089 in the
  > same round. The second host is now **the project's own test suite**, which the requirement already
  > named and which drives the seam directly rather than through any surface. Two independent
  > consumers are still required, at least one of which is not a product surface — a test suite that
  > can only reach the seam through the desktop worker is not a second consumer. The obligation is
  > unchanged in strength; only a host that could not exist was removed from it.
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


> ## Amendment, 2026-09-02 — `REQ-TRACE-061` states a replacement retry ladder
>
> *Recorded by the sweep pass rather than by the agent that made the amendment, so the record is not
> owed twice.*
>
> **The defect.** `REQ-TRACE-061` required a failed whole-file replacement to be re-raised, with no
> retry of any kind. Measurement on the target platform showed that on storage shared with, or reachable
> from, another machine the replacement fails transiently **with no other opener present at all**, and
> that the failures were absorbed by two further attempts in every case where a retry was made. A user
> who asks for a regeneration therefore meets a failure caused by a condition of their storage that they
> can neither act on nor reproduce, and the requirement gave the build nothing to absorb it with.
>
> **The amendment.** At most five attempts in total — the first and at most four retries — with delays
> of 0.05, 0.1, 0.2 and 0.4 s, so the last attempt begins no more than 0.75 s after the first; an
> attempt that succeeds reports nothing; only after the last has failed is the failure re-raised on the
> terms already stated; and no attempt leaves a temporary artifact behind.
>
> **The clause that stops the wrong build.** The retry SHALL NOT be conditioned on this application
> being able to attribute the failure to another process holding the target. The measured failure has no
> other opener at all, so a build that gates its retry on detecting contention absorbs none of it — and
> both the corpus's other ladder and every derivation of it in the architecture record argue from
> contention, which is precisely why the negative had to be written down.
>
> **The constants are this domain's own and were deliberately not borrowed.** `REQ-SESSION-033`'s figures
> govern a different target on different storage; OQ-44 and ADR-0004 both refuse borrowing a neighbouring
> store's constants to pretend a ladder exists; and `REQ-SESSION-033`'s own list was ambiguous between
> five attempts and six, which this ladder refused to inherit. The requirement states in terms that
> neither ladder may be cited in place of the other.
>
> **Scope, and cross-domain citation.** The ladder covers every whole-file replacement this domain
> performs — the generated artifact, `REQ-TRACE-126`'s three baselines, `REQ-TRACE-137`'s
> retired-identifier log, and the destination `REQ-TRACE-514`'s export writes to — and declares itself
> the only replacement ladder this domain states. A requirement in another domain whose write lands on a
> destination the product does not choose MAY cite it rather than state a third;
> `REQ-LIBRARY-176`, `REQ-SESSION-189` and `REQ-SESSION-199` do.
>
> **A boundary sentence added on judgement.** `REQ-TRACE-502` says no invocation may wait for another.
> That is the sentence a conformant implementer would cite to delete the ladder, so `REQ-TRACE-502` now
> states that a bounded replacement retry is not a wait for another invocation, holds nothing another
> invocation needs, and completes or re-raises within its own bound.
>
> **ESC-30 on the delivery side.** `REQ-TRACE-514` now states that where its export reports entries
> absent it says why, that in this store retention is the only cause there is — because `REQ-TRACE-405`
> makes writing the record a condition of the state-changing action completing — and that it may not
> carry absence as a single undifferentiated figure nor in a shape shared with the export of a store
> whose absences have more than one cause (`REQ-LIBRARY-176`). The guard exists because one shared export
> mechanism emitting one "dropped" field would be true of neither store.
>
> **The figure the measurement produced was deliberately kept out of the requirement.** The condition is
> stated qualitatively instead. The measured first-attempt failure rate is a floor from one loopback
> harness with one client and one server on the same computer, no latency, no packet loss, an
> unestablished cause and uncontrolled anti-malware; a normative document should not carry it as though
> it were a rate. What an implementer needs — do not condition on contention, do not drop the ladder — is
> stated in full.


> ## Amendment, 2026-09-11 — `REQ-TRACE-515` states what the board says when its source does not parse
>
> *Raised by the first execution of the requirements board against a real model, recorded in
> `../../architecture/codebase.md`'s live-run section as the eighty-first defect and in
> `../../architecture/first-executions.md`.*
>
> **The defect.** A workspace whose requirement documents the store had **rejected** — every one of them, for
> identifiers `REQ-TRACE-022` does not admit — was drawn by the board as an empty store: it printed the
> sentence that says the source holds no requirement documents yet, and named nothing. The engine had the
> right words for each rejection and the board's own projection was already carrying them; the surface read
> the card count alone and never looked. A reader was told their requirements did not exist when what had
> happened was that none of them could be read.
>
> **The amendment.** A configured source whose documents were rejected SHALL be stated as a source that does
> not parse, SHALL be distinguished from the empty state of `REQ-TRACE-231`, and SHALL name **each** rejection
> in the engine's own words — the document and what was rejected in it — rather than a count alone, because
> the correction is made in the document named.
>
> **The clause that stops the wrong build.** The obligation does not end where a board exists. `REQ-TRACE-026`
> makes a rejected document contribute *nothing*, so a store that parses only in **part** yields a board that
> is silently short of a requirement and identical, to a reader, to a board carrying every one. The board is
> therefore drawn from what parsed **and** states how many documents were rejected, with those same errors.
> An implementation that states the condition only when the board is empty satisfies the sentence and not the
> requirement, which is precisely the shape this defect took: the no-source branch already rendered the
> errors, and the branch beside it did not.
>
> **Why it was minted rather than amended in place, and what it does not do.** No existing requirement was
> wrong. `REQ-TRACE-231` governs a workspace with *no source*, `REQ-TRACE-503`'s three empty findings bind the
> check of `REQ-TRACE-508`, and `REQ-TRACE-380` says only that the mapping is pure. The board's obligation
> here had been inferred from a field the projection carried and stated nowhere — which is why a build could
> satisfy it in one branch, miss it in another, and pass every review. `REQ-TRACE-515` is **not** a second
> check: it states what the surface a person is looking at owes them, and `REQ-TRACE-508` remains the whole
> report. **No prior disposition is reversed and nothing is withdrawn.**
