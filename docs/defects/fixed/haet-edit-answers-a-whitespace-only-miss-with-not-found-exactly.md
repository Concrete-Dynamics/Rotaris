## `haet_edit` answers a whitespace-only miss with "not found exactly"

When `haet_edit` (or its alias `haet`) holds a current `content_hash` and its `old_string` misses at REQ-TOOLS-136 level 1
but matches one window at level 2 (trailing whitespace or a carriage return) or level 3 (a uniform indentation shift), the
build has the answer in hand and throws it away: `matchEdit` runs every level, and the miss branch reads only
`if (!m || m.level !== 1)`, replying "old_string was not found exactly in <path>. Read it again with haet_read." A re-read
shows the caller the same text it misjudged — a trailing space, a tab or a `\r` is as hard to see the second time — so the
model reaches for a shell to see the whitespace, then retries.

Live-run finding: D5 of the final duress live run at `a68f121` (2026-10-07, pack `2026-10-07T07-09-30-708Z` of the live
worktree, session `e6747bd0`, the self-hosted endpoint).

- wave3 (`wave3-verify-all`, tester) failed 6 of its 14 `haet_edit` calls with "not found exactly" (#290, #292, #297, #304,
  #315, #321) and followed each near miss with `sed -n … | cat -A` (#293, #298, #305, #322); wave3b
  (`wave3b-finish-verification`) did the same after #382 (#380, #385, #386 `awk … indent=`). About 14 extra steps and 63 s,
  all inside the two children the 1200 s ceiling cut off; seven `tool_error` issues (issues 7 to 12 and 18).
- **Replayed through `matchEdit` (2026-10-07, fin32):** `docs/verification.md` rebuilt from the pack's store — wave3's
  `write_file` #289, then every successful `haet_edit` and code-intelligence `replace_content` in order, each `haet_edit`'s
  `content_hash` equal to the rebuilt bytes' SHA-256. #292 (3 lines), #297 (4), #304 (6), #315 (3), #321 (4) and wave3b's #382
  (2) each match one window at **level 3**: the file's lines carried one space more or less than `old_string`'s. #290 matches
  at level 4 only (similarity 0.908; its first line named citations the file did not hold). So 6 of the 7 "not found
  exactly" misses were a level-3 near miss.

## Specs

- REQ-TOOLS-189 as written at `a68f121`: "a failure to match reports the path and directs the caller to read the file
  again" — the build is faithful to it; the defect is the cost the requirement fixes. Ruled 2026-10-07 under R-072 as
  OQ-231 and narrowed by `PD-TOOLS-014`: a single level-2 or level-3 window names its level, says what differs, states the
  hash is current and quotes the window as one JSON string; the edit is still refused and nothing is written.
- REQ-TOOLS-136 (the levels, unchanged).

## Relevant files

- `packages/agent-tools/src/tools/files.ts:314` (at `a68f121`) — `matchEdit`, the four levels (shared with `write_file`'s edit).
- `packages/agent-tools/src/tools/files.ts:715-716` (at `a68f121`) — `haetEditTool`'s miss branch.
- `packages/agent-tools/src/tools/tools.test.ts` — the `haet_read / haet_edit` cases.

## Repaired — 2026-10-07 (fin32, under PD-TOOLS-014)

`matchEdit` now returns an `EditMatch` whose level-3 result carries each window's `shifts` (the prefix, and whether the file
carries it in addition to `old_string`'s); `haetEditTool`'s miss branch answers a level-2 or level-3 match through
`nearMissMessage`: the lines, the level, what differs (each line's trailing whitespace in the file and in `old_string`, or the
JSON-quoted prefix with its length), that the hash is still current and nothing was written, a request that `new_string`
carry the file's indentation and line endings, and — for one window up to 30,000 characters as JSON — the window's text as one
JSON string that matches at level 1 when sent back. Several windows name their starting lines and quote nothing. A level-4
match, no match, `replace_all` and the stale hash read as before. Pinned by five cases under "PD-TOOLS-014" in
`packages/agent-tools/src/tools/tools.test.ts`, red on the code before, and a sixth guarding the unchanged replies. Replayed
over the pack: #292, #297, #304, #315, #321 and #382 now name their lines at match level 3, and each quote applied on the same
hash; #290 keeps the plain reply. `live-run.mjs` counts near misses and the terminal probes after them
(`apps/desktop/scripts/lib/near-miss-edits.mjs`); the next live runs are the measurement. Noticed while repairing and raised,
not repaired: `write_file`'s level-3 apply writes `new_string` unshifted
([OQ-233](../../architecture/open-questions.md)).
