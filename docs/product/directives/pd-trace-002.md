[Product directives](../directives.md) › PD-TRACE-002

<a id="pd-trace-002"></a>

### PD-TRACE-002 — a surveyed repository's requirements are drawn as cards in the shape an agent proposed, and its documents are written where they have a place for it

*Revision 2, 2026-11-21, on [R-116](../requests.md#r-116): what building it found. Clauses 3, 5, 10 and 12 changed.*

**The case, stated exhaustively.** Under [`PD-TRACE-001`](pd-trace-001.md#pd-trace-001) a project whose requirements
sit outside an identifier block is recorded and compared and is not drawn on the board, a family whose prefix holds a
hyphen or whose numbers are dotted or zero-padded is not adopted at all, and no requirement document is ever altered.
On the requirements board, for a workspace whose requirements the built-in layout does not read, the product SHALL
instead do the following.

1. **The shape is the repository's own, proposed by an agent.** A repository's **shape** — where its requirement
   documents are, how an identifier is written, where a requirement's title, text, status and acceptance criteria
   stand, and how code and tests cite an identifier — is defined per repository and is not confined to
   REQ-TRACE-022's `<PREFIX>-<digits>`. A namespaced prefix, a zero-padded or dotted number, several families and
   several stores are each a shape, not a refusal. The shape is carried in one validated format, and nothing of it is
   believed until the product's validators have passed every field.
2. **Offer, preview, confirm.** Opening the board on a workspace with no accepted shape runs the detection pass of
   REQ-ADOPT-005, which is free and reads only, and offers one act: survey this repository. Nothing starts a survey
   but the user pressing that control (REQ-ADOPT-003 stands). The survey ends in a **preview** — the stores, the
   identifier form, the count of requirements extracted, samples of them, and what could not be read — and nothing is
   recorded until the user accepts it. The user may answer the preview in words, and the survey continues from that
   answer.
3. **The surveyor is a bounded, read-only agent with a repair loop** — revision 2. The product first derives a
   **draft** shape from the detection pass by script, with no model, and executes it. The agent is opened on that
   draft and what it measured, and improves it: it answers one step at a time with one action that lists, reads or
   searches inside the workspace, or proposes; there is no action that writes, and every action is carried out by
   the workspace service. The product executes a proposal and returns what it measured — the identifiers extracted,
   the duplicates, the identifiers mentioned and not defined, the documents that yielded nothing — and the agent
   repairs it, for at most three rounds, inside twelve reading actions before a proposal is owed, forty steps and
   eight minutes. Its proposal is untrusted input on the terms of REQ-ADOPT-013 to REQ-ADOPT-015. Where the agent
   gives nothing better, the preview is the draft's and says so; a survey that ends with neither a proposal nor a
   draft is a refusal that names why and leaves the board as it was.
   > Revision 1 said, and no longer governs: "The survey is a run with tools that list, read and search inside the
   > workspace and with no tool that writes. It proposes a shape; […] and the agent repairs its proposal, for at most
   > three rounds and inside a fixed bound of time and tokens. […] A survey that ends without a valid shape is a
   > refusal that names why and leaves the board as it was." Measured on the first execution: asked to compose a shape
   > from nothing, the model spent its whole output on reasoning and answered no content, four times in six; opened on
   > a draft to improve, it proposed a shape in every run. The bound is of steps and time, which the product can
   > count; it counts no tokens.
4. **Every extracted requirement is a card.** A requirement read through an accepted shape is drawn as a card and
   opens a detail view with its title, its text, and the file and line it was read from. Delivery states, release,
   runs started from the board, review and blockers work for it as for any requirement. The evidence indicator is
   drawn from the citations the shape's annotation vocabulary finds in code and tests.
5. **The document is the source of truth where it has a place** — revision 2. Where the shape names a status
   place for a requirement — a field, a table cell, a word — the board reads the requirement's status from it; where
   it names acceptance criteria written as check boxes, the board reads them and shows them in the detail view and
   on the review. A requirement **resting** in backlog, needs-update or done whose document declares another of
   those three is recorded there by the pass, and one declared done is recorded with the text it was declared done
   against; a requirement released, running, under review or blocked is the pipeline's and is left as it is. A
   status word is taken once and not again until it changes. Where a document has no such place, that state stays in
   the delivery store, as it does today.
   > Revision 1 said, and no longer governs: "the board reads the requirement's status from it; where it names
   > acceptance criteria written as check boxes, the board reads them and shows them on the card and in the detail
   > view." Found by building: a state the pipeline reaches only through a run (running, review) cannot be declared
   > into without one (REQ-TRACE-392), so those words are shown and not taken; and a word taken on every pass undid an
   > acceptance written in a run's worktree, whose branch the workspace's own copy had not yet merged. The criteria
   > are not drawn on the card: the card's seven facts are REQ-TRACE-242's.
6. **Write-back is surgical and limited to two things.** The board writes into a surveyed document only (a) the
   status word of the project's own vocabulary that a delivery change maps to, and (b) the tick of one acceptance
   criterion. A write changes that token on that line and nothing else, keeps the file's line endings and every other
   byte, and is made only when the file still has the content the board last read; a file changed underneath is
   refused with the reason and is never merged. The board does not edit a surveyed requirement's title or prose and
   does not create one: for those it opens the file at the line.
7. **The agent proposes, the review confirms.** A run started from the board is given the requirement's acceptance
   criteria as what it is to meet, and reports for each whether it is met and on what evidence; it ticks nothing. The
   review surface shows those claims, and accepting writes the ticks and the status word. Accepting with a criterion
   reported unmet asks once. A user may tick or untick a criterion on the card at any time.
8. **A write-back travels with the work.** For a run started from the board the ticks and the status word are written
   in that run's worktree and committed there as one commit citing the requirement's identifier, so that they merge
   with the code that earned them. A tick or status change made outside a run is written to the working tree and left
   uncommitted. The product makes no commit on the user's checked-out branch that the user did not ask for.
9. **The shape is local, and can be exported.** The accepted shape and the per-clone record are kept in the workspace
   scope directory. One secondary control, **Export to repository**, writes the shape to a file at the repository
   root meant to be committed; a workspace that holds such a file reads its shape from it, validated on every read,
   and needs no survey.
10. **The board stays current by itself** — revision 2. A watcher on the store directories and on the shape's files
    re-reads the board, debounced, when a document changes by any hand; the board also re-reads when the window
    regains focus and when a run started from the board ends. Each re-read is model-free.
    > Revision 1 said, and no longer governs: "the board also re-reads when the window regains focus, when a run ends
    > and after a version-control operation made in the product. Each re-read is model-free and writes nothing." No
    > hook was built on the Git view's operations: a checkout or a pull changes the documents, and the watcher sees
    > that. A re-read writes no file of the user's; it may record a state a document declares (clause 5), in the
    > delivery store. A watcher that has stopped is stated on the board, and the re-evaluation control stays the guaranteed
    route (REQ-TRACE-342, REQ-TRACE-507).
11. **Drift keeps the board and offers a survey.** Where the documents no longer fit the accepted shape — lines that
    look like an identifier and are not matched, documents that yield nothing, duplicates — the board keeps every
    card it can still read and states the drift once, with its counts and files and the control that surveys again.
    No survey starts by itself and no token is spent unasked. A requirement that is no longer extracted keeps its
    delivery history and is shown as removed.
12. **Evidence is shown and nothing is owed by default** — revision 2. A surveyed requirement's lifecycle is read
    from its status place where the shape maps one, and is otherwise `approved` with both obligations `optional`:
    citations found are shown as evidence, and no card's health turns on a missing one. A survey never sets the
    obligations; `obligations: required` in the shape, set by hand, makes a trace and a covering test owed for the
    repository. A verification is never owed for a surveyed requirement, since no check of the toolchain verifies
    one.
    > Revision 1 said, and no longer governs: "One setting of the shape makes the obligations `required` for the
    > repository." On the first execution the model chose `required` for this repository unasked, and every card
    > would have opened on a missing verification that nothing can supply. *Assumed, not ruled: the owner did not answer this question on 2026-11-21 and
    asked that unanswered gaps be filled; it is the owner's to change.*

**What is unchanged.** A repository the built-in layout reads keeps domain 08 in full, its editor and its creation
form included. The toolchain's four operations stay the whole of what the toolchain offers (REQ-TRACE-155), and the
survey is not one of them. Opening the board consults no model (REQ-TRACE-341). The renderer names no path and sends
no actor (REQ-ADOPT-028). Two surveys in one workspace do not overlap (REQ-ADOPT-030).

**What replaces what in PD-TRACE-001.** Its clause 2's "one model interpretation" is replaced by clause 3 here; its
cost paragraph's "is still not drawn on the board" by clause 4; its "never alters a requirement document" by clauses
6 to 8, for the two writes those clauses name and for no other. Its clauses 1, 3 and 4 stand.

**Why, and what it costs.** The owner: "i want that the requirements / spec tab works absolutely robust", and, of
the shape: "the shape should be defined per repo dynamically by an agent. the agent surveys the repo and proposes the
shape in some validated format"; and, of the documents: "iff they have some aceptance criteria or check boxes or place
to write the status, that this is respected and used. meaning we touch the specs and requirements if they are meant to
be. this also allows us to commit and do version control." Measured on the day it was asked: this repository's own
specification (`REQ-TRACE-001`, a namespaced prefix and a zero-padded number) is refused by REQ-ADOPT-008, so the
product opened on itself draws an empty board. What it costs: a model now reads the user's documents, inside the
workspace and through read-only tools, where PD-TRACE-001 let it see only a summary; the product writes into
documents it did not create, in a format it learned rather than one it owns, so the writer's refusal on a changed
file is what stands between a wrong shape and a damaged document; and a second identifier form exists beside
REQ-TRACE-022's, so every consumer of an identifier has to take it as an opaque string.

**Minted by the build.** REQ-ADOPT-031 to REQ-ADOPT-052 (domain 22) are this directive's requirements, with the
shape's format in that domain's Part 02; the words **shape**, **survey**, **preview** and **criterion** entered the
Requirements glossary with them. The watcher of clause 10 repaired the defect note
[`the-requirements-board-hears-of-no-change-made-outside-its-own-commands-and-nothing-watches-the-repository`](../../archive/defects/the-requirements-board-hears-of-no-change-made-outside-its-own-commands-and-nothing-watches-the-repository.md).

> **Narrows:** REQ-TRACE-022, REQ-TRACE-258, REQ-TRACE-289, REQ-TRACE-382, REQ-TRACE-399, REQ-ADOPT-008, REQ-ADOPT-012, REQ-ADOPT-017, REQ-ADOPT-018, REQ-ADOPT-027, REQ-ADOPT-029

*Raised by the owner, 2026-11-21; logged as [R-116](../requests.md#r-116). Decided in a questioning session of that
day: eleven questions, ten answered by the owner, one (clause 12) assumed.*

> **First execution, 2026-11-21, built under [R-116](../requests.md#r-116):** the directive held, with the four
> changes revision 2 records. **Measured.** A live survey of this repository on the owner's self-hosted model
> (`ds41`, the loop of `packages/workspace/src/adoption/survey.ts` driven against the endpoint directly, 225 s, one
> repair round) proposed two stores: `docs/spec`, extracting 4,459 `REQ` identifiers — the number `pnpm symbols`
> reports for the same tree — with `Withdrawn` and `Superseded` read as deprecated, and `docs/architecture/adr`, 67
> records with their status. The extraction of that shape took 75 ms and its citation scan 173 ms (14,486 sites). On
> the built application (`pnpm app:drive`, the scripted model, a three-story fixture): the strip offered the survey,
> the preview recorded nothing, accepting drew three cards, a story whose document said `Done` stood in done, an
> edit of the document from outside moved its card with nothing pressed, a tick in the detail view changed one mark
> in the file, a resume wrote the status word, the export wrote the repository's file and the board then read from
> it, and a document in a form the shape does not read was stated as drift with the cards kept.
> `apps/desktop/src/workspace-service/surveyed-board.test.ts` holds the acceptance in a run's worktree: one commit
> naming the identifier, the workspace's copy unchanged, the card still done on the next pass. **Found:** the two
> reasons revision 2 keeps beside clauses 3 and 12; a draft pattern that tripped the product's own pattern guard; and
> REQ-ADOPT-017's 2,000-character line, at which 106 lines of this repository's specification were passed over
> (a shape reads lines of 16,000). **Not measured:** a survey through the built application's own model path
> (`survey.step` over main and the run host) against a real model; an acceptance whose run reported criteria, driven
> on the application; a board of 4,459 cards drawn; Windows and macOS. The row is in
> [`../../architecture/first-executions.md`](../../architecture/first-executions.md).
