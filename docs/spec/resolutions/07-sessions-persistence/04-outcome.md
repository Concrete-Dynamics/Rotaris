# Open-Question Resolutions — Session Persistence, Resume, and Background Sessions — Outcome

Part 4 of 4 of [domain 07's resolutions](../07-sessions-persistence.md), which indexes every part.

## Outcome

25 open questions: 22 resolved, 1 omitted (OQ 9 — the legacy on-disk fallback is withdrawn rather
than specified), 1 moot (OQ 15 — both requirements were command-line surfaces), and among the
resolved, OQ 18 and OQ 23 each carried a component that ceased to exist with the command line. Two
requirements were withdrawn for legacy-compatibility reasons and fourteen for shell-surface reasons,
with every capability rescued as recorded above. Nothing was escalated and nothing remains
outstanding for the product owner in this domain.


> ## Amendment, 2026-09-02 — ESC-31's follow-through, the export destination, and the machine-local citation
>
> Five changes, four of them consequences of amendments landed in other domains and one of them a
> resolution of this domain's own ambiguity.
>
> **1. `REQ-SESSION-137` stated the permission audit's record shapes a second time, and the second
> statement had gone wrong.** ESC-31 ruled that a decision entry's identifier is a **field of the entry**
> and `REQ-TOOLS-079` now says so. `REQ-SESSION-137` stated the decision entry as a closed literal object
> that named no identifier, and stated the mode-change entry as a shorter object than `REQ-TOOLS-082`
> requires — it omitted `timestamp` and `session_id`. Read as closed, the first contradicted the ruling
> and a build following it would export an audit whose locators do not resolve on a machine carrying none
> of this product's code, which is the exact failure ESC-31 was ruled to prevent and one that nothing
> errors on. **Both enumerations are withdrawn in place and replaced by citations.** Each was checked
> field by field against its owner first: `REQ-TOOLS-079` holds every field the first named and adds the
> identifier; `REQ-TOOLS-082` holds every field the second named and two it omitted.
>
> What this domain keeps is what is genuinely its own: that the audit is part of the session's durable
> record, the automatic issue and timeline entries a deny and an approval file, that mode changes are
> counted separately in metrics, the append-only property a reader may rely on, and that both properties
> must be evident in the export.
>
> **2. `REQ-SESSION-199`'s locator clause said "for every entry it emits".** Under the ruling that reads
> as an obligation to put an identifier into `REQ-TOOLS-082`'s closed shape. It now reads on every entry
> **that has one**, with the two consequences stated rather than inferred: an entry whose own requirement
> gives it no identifier is not reached, and a kind holding entries of more than one shape is nameable
> while its unidentified entries are not, which `REQ-EVENTS-056` states. The "beside the entry" branch is
> kept for a shape closed against additions and gains the requirement that the identifier be locatable as
> the identifier there — a value carried under no known field resolves nothing.
>
> **3. The export destination gained the atomicity and the ladder it never had.** `REQ-SESSION-189` and
> `REQ-SESSION-199` write to a file the user chooses through a save dialog. That is the one class of
> write in this product whose target the product does not pick, and it reaches removable media, storage
> shared with another machine, a synchronising client's folder, and a directory in which another
> application holds the previous export open. Neither requirement said the write must land in one step,
> and neither said what happens when replacing an existing file fails transiently. Both now **cite**
> `REQ-EVENTS-145` for what an export write owes its destination and `REQ-TRACE-061` for the bounded
> retry ladder. Neither obligation is restated here and this domain states no ladder of its own for that
> destination. `REQ-EVENTS-145` gained the reciprocal sentence saying its one-step obligation is the
> product's single statement of the property and is not confined to the exports its own document names,
> so the citation cannot later be orphaned by a tidying pass reading "this document" as a scope.
>
> **4. `REQ-SESSION-033`'s attempt count was ambiguous and is resolved.** "Retried up to 5 times with
> exponential backoff starting at 0.05 s (0.05, 0.1, 0.2, 0.4, 0.8 s)" reads as either five attempts or
> six, and the architecture record carries **both** readings in two different places. Two conformant
> builds would therefore absorb different amounts of a transient failure. It is fixed at **six attempts
> in total — the first and at most five retries, the last beginning no more than 1.55 s after the
> first** — because that is the reading under which every delay the requirement itself lists is used.
> **Nothing is narrowed by the resolution**: the alternative reading retries strictly less. The
> requirement also now says that the export destinations are not this domain's to ladder and cite
> `REQ-TRACE-061`, whose figures are that domain's own and are not these.
>
> **5. `REQ-SESSION-198` cites `REQ-STARTUP-145` for machine-local rather than stating it.** The property
> was stated four times in the corpus and defined nowhere; it is now defined once. The requirement keeps
> everything that is its own — that the rule holds always and is never made conditional on detecting
> shared storage, the four observable consequences, that the per-session files are held with the store,
> and that a store which cannot be opened is not worked around.


> ## Amendment, 2026-09-02 (second)
>
> **Owner ruling GD-4 adds two clauses to `REQ-SESSION-201`.** Both answer questions that became askable
> only once the backup and restore were measured end to end. No prior disposition is reversed, and neither
> clause is a new identifier: both govern the action this requirement already owns.
>
> **GD-4a — a restore under way is visible, and that is separate from how long it takes.** The requirement
> already recorded, deliberately, that nothing bounds a restore's duration: the backup carries timing
> obligations because it runs while sessions are live, and the restore carries none because by its own
> refusal clause nothing is live for its duration. That reasoning is sound and stands. **What it does not
> answer is what a waiting user is shown**, and the two were being treated as one thing. A silence about
> not disturbing runs is not a licence to leave a person looking at a product that appears to have stopped.
>
> Added: the request is acknowledged within the gesture budget the shell carries for anything else
> (`REQ-SHELL-150`), and while the restore runs the product conveys that a restore is under way and that the
> workspace's sessions are unavailable until it finishes.
>
> **What is required is acknowledgement, not progress reporting**, and the requirement says so rather than
> leaving the ceiling to an implementer's judgement. No proportion completed, no stage list, no estimate.
> The reason is structural rather than aesthetic: a restore that reported stages would have to report from
> inside a sequence whose entire value is that it is indivisible, and a requirement asking for stage
> reporting creates standing pressure to subdivide that sequence so that it has something to report. The
> clause names that and forbids reading it as licence.
>
> **Why the obligation exists at all**, given that a small store restores in 64 ms: the interval scales with
> what the store holds, and nothing in this product bounds that — no requirement caps how many sessions a
> workspace keeps or discards them with age. The measured window ran from 64 ms to 1.45 s over the sizes
> tested, with the whole action at 2.67 s at the top of that range, and those are a floor rather than a
> ceiling. A workspace silent for several seconds is a state this requirement permits, so it must not be a
> state that looks like a failure.
>
> **GD-4b — a backup in progress may be abandoned, and abandoning it costs nothing.** Nothing in the corpus
> said what happens if a user stops a backup. The requirement fixed what a backup covers, that it may run
> while sessions are live, that it must not disturb them, and where it is written — and left the residue
> undefined.
>
> Added: the user may abandon a backup in progress; abandoning it discards the partial artifact, leaves the
> store exactly as it was, and never leaves a partial, truncated or otherwise unreadable file at the
> destination the user chose. Abandoning is not failing, and a backup the user stopped is not reported as a
> fault.
>
> **Why this is nearly free, and why the omission was not.** The mechanism already has the property: a
> backup writes a staging snapshot and never mutates the store, so most of the clause records something
> already true, which is the cheapest kind of obligation to meet and the easiest to test. The clause about
> the destination is the part that is not free, and it is the part that matters — a file that exists at the
> user's chosen path and cannot be restored is worse than no file, because its owner believes they have a
> backup. Against that, leaving the case unspecified is the same shape that produced `REQ-SESSION-043`'s
> defect earlier the same day: a requirement that answers by enumerating cases is only as good as its list.
> That shape has now cost this domain twice, and it was invisible to review of the words both times. The
> user will meet the question, because a backup of a large store measured 4.2 s and runs while their work
> continues.

> ## Amendment, 2026-09-02 (requirement-shape sweep)
>
> A corpus-wide sweep looked for two *shapes* rather than for defects: an obligation whose evaluation moment
> is not fixed, and an answer given by enumerating cases with the residue left undefined. Both shapes had
> produced a defect earlier the same day, and both had been invisible to review of the words.
>
> **`REQ-SESSION-164` — the refusal is now durative, and this is the requirement `REQ-SESSION-201` cited as
> its precedent.** When `REQ-SESSION-201`'s refusal was corrected to hold for the whole of the restore, the
> sentence justifying it read "for the same reason `REQ-SESSION-164` refuses a checkpoint restore on a
> session that claims to be running". The model was never checked and had the identical defect: the refusal
> attached to the decision to begin, nothing re-checked, and nothing forbade proceeding once begun.
>
> **It is the worse of the two, and the requirement now says why.** A checkpoint restore replaces the user's
> own working tree rather than a record this product keeps. A run admitted during it has the files it is
> reading and writing changed beneath it, and unlike a store the product owns, nothing about the working
> tree is this product's to put back. Added: the refusal holds from the moment the question is answered
> until the restore completes or is abandoned; a restore already begun is undone to the state it started
> from; the restore may not stop, cancel, interrupt or require a live run to give up the working tree, the
> remedy being refusal; and the two restores are one rule with neither an exception to the other. Which end
> of the window is closed is left to the implementation, as in `REQ-SESSION-201`.
>
> **`REQ-SESSION-048` — the third case a lock can present.** The requirement declares itself the single
> statement of what a creation-time lock refusal must convey, then distinguishes exactly two cases, both
> keyed on what the lock's `host` says. **A lock that is present and cannot be read has no `host` to name.**
> That case is not obscure: `REQ-SESSION-056` makes it live by construction and `REQ-SESSION-183` names it
> as one of the two conditions its explicit release exists for. The single statement had nothing to say
> about a condition its own neighbours describe. It now covers it, requires the report to say that a lock is
> present and could not be read, and forbids naming a machine or a pid the product does not have — the
> honest report being that the product cannot tell which of the other two cases it is.
>
> **The general lesson, and it is the second time this domain has supplied it.** A requirement that answers
> by listing cases is only as good as its list, and a list keyed on the *content* of a record has no answer
> for a record with no readable content. `REQ-SESSION-043` produced this lesson by being run; this one was
> found by looking for the shape.
