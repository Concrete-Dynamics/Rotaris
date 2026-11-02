## `haet_edit` quotes an empty window for a blank `old_string`, and promises it will match

PD-TOOLS-014's near-miss reply, as first built (fin32, 2026-10-07), took every level-2 or level-3 result of `matchEdit` as a
near miss. `matchEdit` skips level 1 for an empty `old_string` and then finds it at level 2 on any blank line — the file's
last, after its final newline, among them — and finds a whitespace-only `old_string` (`"  "`, `"\t\n"`) there too. On
`alpha\nbeta\n` an empty `old_string` was answered "It matches line 3 at match level 2 (trailing whitespace). They differ
only in trailing whitespace or carriage returns: . … the file's text over line 3 matches exactly, as this JSON string: \"\"":
a list of differences with nothing in it, and a quote that, sent back as the reply asks, is the same empty `old_string` and
gets the same reply — a retry loop with no exit, where REQ-TOOLS-189's plain reply sent the caller to read the file.

Found by the independent review of fin32's bundle (2026-10-07), before the bundle landed; no live run met it.

## Specs

- `PD-TOOLS-014`, clause 5: the quote is "the file's lines over that range joined by `\n`, so that sent back as `old_string`
  with the same hash it matches at level 1" — an empty quote never matches at level 1 (`matchEdit` tries level 1 only for a
  non-empty `old_string`), and a blank one names no text the caller meant. Clause 2 ("say in words what differs") had
  nothing to say.
- REQ-TOOLS-189's failure-to-match clause, which governs every miss outside the directive's case.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `haetEditTool`'s miss branch, which hands a level-2 or level-3 match to
  `nearMissMessage`; `matchEdit`, whose levels 2 to 4 treat an empty `old_string` as one blank line.
- `packages/agent-tools/src/tools/tools.test.ts` — the "PD-TOOLS-014" cases.

## Repaired — 2026-10-07 (review of fin32)

The miss branch answers through `nearMissMessage` only when `old_string` holds a visible character (`/\S/`); an empty or
whitespace-only `old_string` keeps REQ-TOOLS-189's "old_string was not found exactly in <path>. Read it again with
haet_read.", as before PD-TOOLS-014. With a visible character in `old_string`, every window that matches it at level 2 or 3
holds that character, so its quote is non-empty text of the file and matches at level 1 when sent back. `matchEdit` and
`write_file` are unchanged. Pinned by "an empty or whitespace-only old_string is no near miss …" under "PD-TOOLS-014" in
`packages/agent-tools/src/tools/tools.test.ts` (`""`, `"  "` and `"\t\n"` on `alpha\nbeta\n`: the plain reply, the bytes
unchanged, no undo entry), red on the code before. Reported in place in PD-TOOLS-014's first execution.
