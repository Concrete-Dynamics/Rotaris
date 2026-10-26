[Product directives](../directives.md) › PD-LIBRARY-001

<a id="pd-library-001"></a>

### PD-LIBRARY-001 — a child report states the commands the child ran, and which of them failed

An artifact record whose `kind` is `child_report` SHALL carry the commands the child ran, as a list
named `commands`, each member carrying the command as the child submitted it and the exit status the
terminal reported for it, the status being absent where the observation carried none. The list SHALL
be derived from the child's own transcript and SHALL NOT be written by a summarising pass, on the
terms REQ-ORCH-108's schema already fixes for the report this record materialises. Where the child
ran no command the record SHALL carry an empty list, and the document SHALL show no section for it.

The Markdown document of REQ-LIBRARY-090 SHALL render the list as a **Commands** section placed
immediately before **Edited Files**, and the section filters of REQ-LIBRARY-099 and REQ-TOOLS-148
SHALL offer it under the section name `commands`. Each entry SHALL render the command in a code span
and SHALL state its exit status in words rather than as a bare number, so that a reader who has never seen a shell exit code
can tell a command that failed from one that did not: a zero status renders as the command alone, a
non-zero status names the code, and an absent status says so. Ordering SHALL be the order the child
ran them and SHALL NOT be sorted, grouped or de-duplicated — a command run twice with two outcomes is
two entries, and which came first is the fact a reader is reading for.

**Why, and what it costs.** The specification already requires the child report to carry its commands
(REQ-ORCH-108's schema: "commands (command, exit code, summary)"), and on 2026-09-12 that field was
found hardcoded empty at every construction site and nothing anywhere rendered it. Deriving it fixed
the record; it did not make it readable, and a field no surface shows is indistinguishable to a user
from the defect that was just repaired. The place chosen is the one where the reader already asks this
question: the child report artifact is what a person opens to find out what a child did, it already
carries **Edited Files** from the same schema sentence, and the two facets were separated only by the
accident of one being rendered and the other not. The run that prompted this is the argument — seven
of nineteen terminal calls failed across four children and nothing but the raw store could say so.

The cost is threefold and none of it is hypothetical. **REQ-LIBRARY-088's field inventory is closed**
— "a reader may rely on no other key being present, and adding one is a change to that requirement" —
so this directive is that change, and a consumer written against the old inventory sees a key it did
not expect; the shape is additive and no existing key moves or changes meaning. **REQ-LIBRARY-090's
section order is fixed**, so a reader diffing two documents across this change sees a section appear
between Snippets and Edited Files. And the derivation inherits a bound it cannot remove: context
compression replaces a conversation (REQ-MONITOR-084), so a child compressed mid-task no longer holds
its earliest calls, and the list is of what survived in the transcript the report was built from. That
bound is stated in the record rather than hidden, and closing it needs the durable tool-call evidence
of REQ-SESSION-136, which this directive does not require and does not forbid.

> **Narrows:** REQ-LIBRARY-088, REQ-LIBRARY-090, REQ-LIBRARY-099, REQ-TOOLS-148

*Corrected 2026-10-13 under [OQ-237](../../architecture/open-questions.md) (GV1, [R-072](../requests.md#r-072)): REQ-LIBRARY-099
and REQ-TOOLS-148 move from Extends to Narrows. Each closes its section filter over a set, and `commands` joins that set
(a section name outside it is still refused), a change to an exact enumeration and so a narrowing (acceptance finding F15).
Their case is disjoint from `PD-LIBRARY-004`'s, which consumer a read marks. The disposition read until then, and no longer
governs:* "> **Extends:** REQ-LIBRARY-088, REQ-LIBRARY-090, REQ-LIBRARY-099, REQ-TOOLS-148"

*Corrected again 2026-10-13 on the same test (GV1, [R-072](../requests.md#r-072)), outside the ruling's bounded re-read:
REQ-LIBRARY-088 and REQ-LIBRARY-090 move from Extends to Narrows. REQ-LIBRARY-088's field inventory is closed and gains
`commands[]` on a `child_report` record; REQ-LIBRARY-090 fixes its sections "in this order" and gains **Commands** before
Edited Files. Each is a change to an exact enumeration, so a narrowing (acceptance finding F15); no other directive reaches
either. No behaviour moves and no revision is taken. The disposition read until then, and no longer governs:*
"> **Narrows:** REQ-LIBRARY-099, REQ-TOOLS-148" *beside* "> **Extends:** REQ-LIBRARY-088, REQ-LIBRARY-090"

*Raised by the owner, 2026-09-12; logged as [R-006](../requests.md#r-006).*

> **First execution, 2026-09-14:** the built-app proof (`pnpm artifacts-proof`'s sixth launch) ran a child
> through three ordered terminal calls — success, exit 7, and one the permission gate denies — and read the
> report back through `artifact_read` with `sections: ['commands']`. Closeout planning had found the tool path
> still filtering through a private section list that predated the directive: the store's own filter was correct
> and its test green, but every model-facing filtered read returned the full document. Repaired against contracts'
> `ARTIFACT_SECTIONS`; the ledger itself behaved exactly as this record fixes it — order preserved, statuses
> in words, the denied command carrying no exit status. The full account is in
> `docs/architecture/first-executions.md` and a defect note (removed once repaired).
