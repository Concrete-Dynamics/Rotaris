---
reference: ROTARIS-CRW-001
domain: conversation-composer-transcript
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 03, Conversation, Composer, and Transcript

> ## Amendment, 2026-09-27 — invoking a skill loads it for the session, and a taken name is suffixed (ESC-37, ESC-39)
>
> - **`REQ-CHAT-034`, delivery (ESC-37).** Invoking a skill command loads the skill for the current session as
>   `REQ-WORKSPACE-073` fixes, delivered as `REQ-WORKSPACE-062`'s force-loaded block. The earlier text attached
>   it to the next prompt alone. The notice text is unchanged.
> - **`REQ-CHAT-162`, the listing and the payload (ESC-37).** The listing drops its "whether it is already in
>   context" column, and "attaching a skill MUST mark it as in context" is replaced: what an agent receives is
>   read from the load mode, as `REQ-WORKSPACE-067` fixes. The three identifying facts and the verbatim body
>   still govern, now as the content of the force-loaded block.
> - **`REQ-CHAT-034`, a taken name (ESC-39).** A skill whose command name is taken is offered under
>   `REQ-SHELL-056`'s first free `-2`, `-3`, … name, with its description naming the skill. The earlier text
>   skipped its registration. The command takes `REQ-SHELL-056`'s catalogue normal form; the skill's identity
>   stays `REQ-WORKSPACE-054`'s normalized name. The two forms are two on purpose: one names a typed command,
>   the other names the skill in the policy maps, the catalog block and the Skills table.
>
> **Why these are amendments.** In each case two live requirements stated different mechanisms for one
> gesture. Domain 13 owns portable skills, and `REQ-WORKSPACE-067` and `REQ-WORKSPACE-072` state their
> readings with reasons; this domain's texts were the ones left behind when those were amended. The owner
> ruled ESC-37 and ESC-39 as they recommended ([R-052](../../product/requests.md#r-052));
> `owner-decisions.md` holds the rulings.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - The **REQ-CHAT-140** row and the two paragraphs about `<session_dir>/state/transcript_archive.jsonl`
>   name a file that no longer exists. The capability is unchanged: rows past the resident bound are
>   released in whole pages of 50, retained unaltered, and paged back with their indexes preserved
>   (REQ-SESSION-131, REQ-SESSION-192). Only the vocabulary moves — "archive"/"eviction" become
>   "retained released pages"/"release" — and REQ-CHAT-165 has been re-pointed accordingly.
> - **OQ 16** and the **REQ-CHAT-111 / REQ-CHAT-112** rows settle the serialization of
>   `<workspace>/.rotaris/rotaris-prompts.json` — two-space indentation, key order `history` then `stash`,
>   both keys always emitted. That file is withdrawn under **SR-4**: saved prompts are held in the durable
>   store the application keeps for the workspace (REQ-LIBRARY-138), and REQ-CHAT-045 now fixes no path and
>   no document format. The **per-workspace scoping**, the 200/100 caps, blank-dropping on load, the
>   unreadable-reads-as-empty rule and the "Could not save prompt history" notice all stand.
> - The **REQ-CHAT-173** row places image attachments "under the session directory". Attachment and image
>   **bodies** are still files on disk, referenced from the record; the closed set they belong to is
>   REQ-SESSION-002's and they are held with the store rather than inside the workspace (REQ-SESSION-198).


> ## Amendment, 2026-09-02 — REQ-CHAT-055's measurement point is fixed
>
> The architecture pass that read the amended specification closely enough to implement it reported that
> **REQ-CHAT-055 gives opposite verdicts on the same build under its two available readings**, and that
> the difference is forced rather than incidental. "Appending a row MUST cost no more than it does on an
> empty transcript" is met exactly on the to-paint reading — apply-to-paint p50 **13.8–13.9 ms at every
> total-row count from 0 to 10,000**, in both scroll variants, across 2,520 measurements whose worst
> single observation was 34.2 ms — and fails on the strict synchronous reading, **1.4 ms on an empty
> transcript against 2.7 ms at 10,000 rows**. The 1.3 ms difference is **0.65 % of the 200 ms budget**,
> does not appear in the to-paint figure at all, and is the `O(n)` scan a **whole-transcript assignment**
> forces at the view boundary — which REQ-UIBENCH-055, REQ-UIBENCH-057 and REQ-UIBENCH-058 all mandate by
> handing the interface the entire transcript on every update. See ADR-0045 consequence 6, ADR-0046, and
> `architecture/spikes/renderer-invariance-and-benchmark-cadence.md` §5.
>
> **REQ-CHAT-055 is amended in place to say which reading governs: the to-paint one.** Cost is measured
> from the moment an update is applied to the moment the interface has finished showing its effect — the
> instant REQ-UIBENCH-051 and REQ-UIBENCH-119 already close a phase's timing on, and the instant
> REQ-CHAT-157's budget is measured to. Every clause of the requirement is read at that one point,
> including the append comparison. Work inside an update that scales with the total row count is not
> forbidden in itself and is forbidden to the extent that it moves that figure; a residue that never
> reaches it is not a violation, and a figure that grows with total rows fails however small its steps
> are argued to be. **The synchronous reading is not merely deprecated — a conformance test written
> against it is testing something the requirement does not state.**
>
> **Why this reading and not the other.** The requirement's own subject is what a person waits for: its
> budget clause defers to REQ-CHAT-157, which states the budget as output appearing *on screen*. The
> synchronous call boundary is an internal seam a user cannot observe and that no other requirement in
> this domain measures anything against. Choosing it would also make the requirement unsatisfiable by any
> implementation the benchmark domain's own phases permit, which is the same defect SR-8 identified in
> REQ-ORCH-155 and resolved the same way: a reading no admissible build can meet is not a requirement.
>
> **REQ-CHAT-154 is amended to cite REQ-CHAT-055 rather than restate the rule**, since it carried the
> same "cost proportional to what changed, not to the transcript's length" sentence with the same
> ambiguity and would otherwise have preserved the reading this amendment closes.
>
> **Left for domain 21, and not decided here.** Nothing in `REQ-UIBENCH-*` measures an append on an empty
> transcript against an append at a thousand-plus rows, so the comparison this requirement now fixes has
> no phase that produces it; and REQ-UIBENCH-055, -057 and -058's whole-transcript assignment is what
> forces the residue this amendment declines to charge against a build. Both are that domain's to settle.


This record disposes of every open question raised in the draft of
[`../03-conversation-composer-transcript.md`](../03-conversation-composer-transcript.md)
(requirement prefix `REQ-CHAT`). The body of that specification has been amended so that each
decision below is stated normatively in place; the original open-question numbering is preserved
here so the draft and the resolved specification can be read against one another.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, surface, exit codes, or event vocabulary. Where a case is
   under-determined this record chooses; awkward or arbitrary behavior is never preserved for
   compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement is dropped merely because it
   describes intent rather than something known to work.
4. **The product is one Electron desktop application, with no command-line interface and no
   terminal user interface.** Not deferred — removed. Domains 17 and 18 are retired and the
   `REQ-TUI` and `REQ-CLI` identifiers are withdrawn. See the graphical-only sweep below, which is
   the larger half of the work in this domain: nine of the draft's twenty-eight sections described
   a text-mode frontend. Running external programs — an agent's own terminal commands, lifecycle
   hooks, tool servers on the stdio transport, version-control invocations — remains fully in
   scope; what was removed is any way for a *user* to drive the product from a shell or a
   full-screen text-mode interface.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable format). Open questions
   asking about exact phrasing, punctuation, separators, or grammatical inflection of a
   *human-readable* message are resolved by stating what the message must convey and leaving the
   wording to the implementation.

Cross-domain vocabulary is cited rather than reinvented: `02-run-monitoring-steering.md` (steering
surface, tool-row status vocabulary, live clock ticks, per-agent elapsed time),
`13-workspace-context-onboarding.md` (skill discovery, `SKILL.md` frontmatter, invocation modes,
manual skill loading), `15-settings-configuration.md` (the `display` section of `agents.yaml`, the
desktop preference store, default write scope), `12-desktop-shell-windows.md` (theme token
contrast guarantees, persona windows), and `14-library-artifacts-improvements.md` (the stash
controls and the artifact library).

Of the 35 open questions raised in the draft: **25 resolved**, **1 omitted**, and **9 moot** (they
existed only because of the terminal frontend). The one question escalated by this pass — OQ 2,
image attachments in the composer — was answered by the product owner on 2026-08-30 and the answer
is recorded in `docs/clean-room/specification-gate.md` *(removed 2026-10-26)*;
it is carried below as resolved. No question raised against this document remains open.

## Parts

Since 2026-10-26 the rest of this document is in [`03-conversation-composer-transcript/`](03-conversation-composer-transcript/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](03-conversation-composer-transcript/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](03-conversation-composer-transcript/02-dispositions.md) | Dispositions |
| [03](03-conversation-composer-transcript/03-new-requirements-added.md) | New requirements added |
