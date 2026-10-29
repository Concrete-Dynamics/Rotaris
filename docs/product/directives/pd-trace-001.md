[Product directives](../directives.md) › PD-TRACE-001

<a id="pd-trace-001"></a>

### PD-TRACE-001 — an adoption assistant, separate from the toolchain, detects a project's requirement layout and records what it found

**The case, stated exhaustively.** REQ-TRACE-155 says the toolchain SHALL provide "no project-structure detection and
no configuration-scaffolding operation". On the requirements board, and nowhere else, the product SHALL offer the
**adoption assistant** of domain 22 ([`../../spec/22-requirements-adoption.md`](../../spec/22-requirements-adoption.md)),
which:

1. detects, by script and read-only, the requirement stores, identifier family, implementation and test roots and
   annotation vocabulary of the open workspace, and names what it could not decide (REQ-ADOPT-005 to REQ-ADOPT-010);
2. composes an adapter from that result and one model interpretation, validates every field the model supplied with
   the toolchain's own layout rules before anything is written or executed, and refuses on any failure
   (REQ-ADOPT-011 to REQ-ADOPT-015);
3. runs **only when the user presses its button** — an initial run, or a re-run — and writes the adoption record to
   the workspace scope directory, and the layout file of REQ-TRACE-040 only on the user's choice and never over an
   existing one (REQ-ADOPT-016 to REQ-ADOPT-021);
4. on every opening of the board, compares the store as it now stands against the record and names the requirements
   that are **new**, **changed** and **removed** since, by identifier, new first — and **writes nothing and consults
   no model by doing so** (REQ-ADOPT-022 to REQ-ADOPT-025, REQ-TRACE-341).

**What is unchanged.** The assistant is not a toolchain operation: the four operations of REQ-TRACE-508 to
REQ-TRACE-511 stay the whole of what the toolchain offers to be invoked, REQ-TRACE-152's write set is the toolchain's
and is not widened, and adding, renumbering or migrating a requirement stays outside the product (REQ-TRACE-155's first
sentence governs in full). The assistant never alters a requirement document, the generated artifact, a baseline, the
retired-identifier log or the delivery store (REQ-ADOPT-029). Outside the assistant, REQ-TRACE-155's detection and
scaffolding sentence governs in full.

**Why, and what it costs.** The owner: Rotaris' specification-driven development "does not recognise arbitrary
requirements structures in an arbitrary codebase. There is no agentic adapter that inspects a foreign project's actual
requirement layout and brings it into the format Rotaris can read." Domain 08 withdrew detection (resolution row 11)
because a detector proposing a layout would be "a second, rival definition of the repository's shape"; the assistant
answers that by producing the toolchain's own layout file, validated by the toolchain's own rules, written by choice,
and by keeping its own findings in the scope directory rather than in the user's project. What it costs: a model now
reads a summary of the project's layout (the detection result and its sample lines, never whole documents); a
project whose store declares identifiers outside an identifier block is recorded and compared but is still not drawn
on the board, which reads only the identifier blocks of REQ-TRACE-008; and the product departs from an implementation
built from the specification alone, which offers no detection at all.

> **Narrows:** REQ-TRACE-155

*Raised by the owner, 2026-10-29; logged as [R-087](../requests.md#r-087). Mints REQ-ADOPT-001 to REQ-ADOPT-030 at
the owner's ask (domain 22, decided, not derived).*

> **First execution, 2026-10-29, built under [R-087](../requests.md#r-087):** the directive held as written. The
> detection pass found the store, family, numbering, roots and annotation vocabulary of a scratch Python project by script;
> a scripted interpretation was composed into an adapter, every field passing `parseLayout` (REQ-TRACE-043, REQ-TRACE-073)
> before execution; the record was written to `.rotaris/requirements-adoption.json`; and after a requirement was added the
> next opening named it as new while writing nothing. Thirteen malformed or hostile answers (prose, an unknown key such as
> `write_to`, an invented candidate, an absolute or `..` root, a two-group pattern, a convention that does not compile) were
> each refused by field with the workspace unchanged, and so was a store directory that is a symbolic link out of it.
> **Found:** the strip's first read, made at mount, landed in the board's paint window and `requirements-proof` measured
> 263 ms against REQ-TRACE-239's 100 ms; the read now waits for the board's arrival (13 ms after). **Not measured:** no real
> model answered an interpretation — every test and the demonstration scripted it — so how the `requirements-engineer`
> role's model performs the interpretation is the first live run's. The row is in
> [`../../architecture/first-executions.md`](../../architecture/first-executions.md).
