## The coverage report drops a tight continuation followed by a unit word

`tools/requirement-coverage/coverage.mjs` reads a bare number after a citation as a quantity, not a continuation, when a unit
word follows it (`QUANTITY`), so `REQ-X-001, 200 ms` credits no REQ-X-200. The lookahead applies after every separator,
including the tight ones that only ever join identifiers (`..`, `–`, `/`), so `REQ-X-031..033 calls` credits REQ-X-031 alone
(not 032 and 033), and `REQ-X-007/008 files` credits REQ-X-007 alone. The unit words are also matched case-sensitively, so
`REQ-X-001, 200 MS` is read as a continuation. The report is report-only, so these are false negatives (and one false
positive) in a count, never a failed gate. Noted by fin43's reviewer of `fin43-optional-findings`.

## Specs

None: the report is a development tool (whats-next item N90) and no requirement governs it.

## Relevant files

- `tools/requirement-coverage/coverage.mjs` — `QUANTITY`, `CONTINUATION`, `RUN`.
- `tools/requirement-coverage/coverage.test.ts` — the citation forms.
