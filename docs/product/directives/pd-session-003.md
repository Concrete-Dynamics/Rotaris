[Product directives](../directives.md) › PD-SESSION-003

<a id="pd-session-003"></a>

### PD-SESSION-003 — an error-path tool record's arguments keep their shape, and what is never cut stays whole past 2,000 characters

When a tool call ends in error, its record's arguments are cut (REQ-SESSION-136) under these clauses:

- **(a)** The 2,000 characters are counted over the arguments' JSON text. Arguments that fit are stored unchanged.
- **(b)** Arguments that do not fit keep their shape: every key and every array element stays.
- **(c)** Only free-text string values are cut, longest first, in key order on a tie. Each cut value ends with
  REQ-SESSION-194's `...`, counted inside its own length, and cutting stops when the text fits.
- **(d)** A value is a path, an identifier or a timestamp when its key's last word, in snake or camel case, is one of:
  `path(s)`, `file(s)`, `filename`, `dir`, `directory`, `cwd`, `url`, `uri`, `id(s)`, `slug`, `ref(s)`, `hash`, `name(s)`,
  `at`, `timestamp`, `time`, `date`, `since`, `until`. The same holds when the key is one of `persona`, `supersedes`,
  `depends_on`, `continuation_of`, `write_scope`, `inherited_context` or `attach_artifacts`. Such a value, and everything
  beneath it, is never cut. Numbers, booleans and null are never cut.
- **(e)** When the values kept whole pass 2,000 on their own, every free-text value is cut to the marker alone and the
  stored arguments go over 2,000 characters.
- **(f)** The result stays one text: its head is kept and the marker is appended.

Every other clause of REQ-SESSION-136 and REQ-SESSION-194 still governs; a call that succeeded keeps its arguments and result
whole, as before.

**As built.** `cutArguments`, `argumentKeptWhole`, `WHOLE_WORDS` and `WHOLE_KEYS` (`packages/engine/src/run/cut.ts`), called
by `SessionWriter.settleToolCall` (`packages/engine/src/session-writer.ts`) for an error-path record; the result through
`cut`. The live run counts arguments over 2,000 characters as a NOTE (`overCapArgs`, `apps/desktop/scripts/lib/error-record-cuts.mjs`).

**Why, and what it costs.** REQ-SESSION-136 caps error-path arguments at 2,000 characters without saying what is counted,
and REQ-SESSION-194, which names that cut among those its marker governs, ends "Counts, identifiers, paths and timestamps
are never truncated" (OQ-209). A path or an identifier cut short gives a false account to the person reading the record
after a failure, and nothing in the product relies on 2,000 as a bound: a call that succeeded keeps its arguments whole,
with no cap. Measuring the JSON text keeps one bound in the common case; measuring each value would bound nothing. The key
name is the only test that reaches an MCP tool, whose schema has no kind for a path or an identifier. What it costs: 2,000
characters is not an invariant for error-path arguments, so no reader may size for it; and the key test is a heuristic for
MCP tools — a `file` or `name` key holding content is kept whole, and an identifier under an unusual key (`target`,
`selector`) can be cut.

> **Narrows:** REQ-SESSION-136, REQ-SESSION-194

*Raised by fin23, 2026-10-06, as OQ-209; ruled 2026-10-07 under the owner's delegation, logged as [R-072](../requests.md#r-072).
The ruling names it PD-SESSION-002; it is PD-SESSION-003 by the number the orchestrator assigned, since OQ-207's directive
takes PD-SESSION-002.*

> **As ruled, 2026-10-07 (fin28):** the reading was built before the ruling (fin23, 2026-10-06) and confirmed by it, so this
> is no first execution, and no row is owed in [`../architecture/first-executions.md`](../../architecture/first-executions.md)
> (the ruling, following advocate B and `PD-SESSION-001`'s precedent). One gap was repaired with it: `delegate`'s
> `inherited_context` and `attach_artifacts` joined clause (d)'s keys
> ([`a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md`](../../defects/fixed/a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md)),
> and `cut.test.ts` classifies every argument key of every built-in tool.
