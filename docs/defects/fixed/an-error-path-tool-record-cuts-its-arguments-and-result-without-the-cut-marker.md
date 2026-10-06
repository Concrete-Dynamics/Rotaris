## An error-path tool record cuts its arguments and result without the cut marker

When a tool call settles with an error, the session writer cuts the record's arguments and result to 2,000 characters
(REQ-SESSION-136) with a bare `s.slice(0, 2000)` and appends nothing. A reader of the record cannot tell a cut value from a
whole one: a cut result ends mid-word, and cut arguments become a 2,000-character string where whole ones are an object,
with no sign that the string is the head of a longer JSON text. `run/cut.ts`, the domain's one marked cut, declares this cut
"not this one" in its comment, though REQ-SESSION-194 names it.

Live-run finding: M3 (the final default live run at `c2a9444`, 2026-10-06).

## Specs

- `REQ-SESSION-194`: every character cap in the domain marks a cut by appending `...`, counted inside the cap, and the rule
  names "the truncated arguments and results of an error-path tool record (REQ-SESSION-136)"; the domain's resolution 21
  repeats it.
- `REQ-SESSION-136`: "On error, recorded args/result are truncated to 2000 characters." The cap is kept; the marker is
  missing.

## Evidence

Pack `.live-run/runs/2026-10-06T17-41-48-175Z/` (the live-run worktree; git-ignored), `workspace.db`, table `tool_calls`,
session `63f26919` (`requirements`). Of the pack's 12 error-path records, 3 were cut and none carries `...`:

- ordinal 62 (`write_file`, refused): `args` is a 2,000-character string ending `twoDone, 1);`;
- ordinal 66 (`write_file`, refused): `args` is a 2,000-character string ending ` id: 1, titl`, mid-word;
- ordinal 70 (`terminal`, failed): `result` is 2,000 characters ending ` title: 'y', do`; the call's own output was cut away.

## Relevant files

- `packages/engine/src/session-writer.ts` — `settleToolCall`, the `cut` it defines and the `args` it builds from it.
- `packages/engine/src/run/cut.ts` — REQ-SESSION-194's cut, and the comment that places the error-path cut outside it.

## Repaired — 2026-10-06 (fin23)

`SessionWriter.settleToolCall` (`packages/engine/src/session-writer.ts`) cuts an error-path record's arguments and result
with `run/cut.ts`, REQ-SESSION-194's one marked cut: at most 2,000 characters, the last three `...`, never between the two
halves of a surrogate pair. Arguments that fit stay the object they were; arguments that do not keep their shape too
(`cutArguments`): an object with every key, only its free-text values cut, longest first, each ending with the marker, and a
path, an identifier, a count or a timestamp never cut, as REQ-SESSION-194's last sentence requires. A result that fits, and
every record of a call that succeeded, is stored whole as before.

FALSIFIED, kept beside its replacement (the fin23 verifier's finding, 2026-10-06): the first repair stored arguments that do
not fit as "the head of their JSON text, marked, so a reader sees an object's text that does not close and ends with the
marker". A head keeps whatever the model serialised first, so `{content: <1,990 characters>, path: '/ws/src/x.ts'}` lost its
path whole, and a path that began near character 1,997 was cut through, against "Counts, identifiers, paths and timestamps
are never truncated". Where a path or an identifier is itself longer than the cap, REQ-SESSION-136's cap and that sentence
cannot both hold: [OQ-209](../../architecture/open-questions.md) records the question and the reading the build proceeds
under (the value kept whole, the free text cut to the marker alone, the record over 2,000 characters). `run/cut.ts`'s comment no longer places this
cut outside REQ-SESSION-194; its old reading is kept there beside the new one. The runtime view's store table says so.

**Pinned by** `packages/engine/src/session-writer.test.ts`, "SessionWriter — an error-path tool record marks the cut it
makes": long arguments come back an object of at most 2,000 characters of JSON text, the free text ending `...` and the
path and the operation whole, and a long result 2,000 characters ending `...` (red before the repair: the bare
2,000-character heads; red on the first repair: a string); a path serialised after a long `content`, and identifiers, counts
and timestamps anywhere in the arguments, come back whole, and a path longer than the cap comes back whole with the free
text cut to the marker, OQ-209's reading (all four red on the first repair's JSON head); arguments and a result that fit, an exactly 2,000-character result included, come back whole;
a call that succeeded is never cut; and a cut never splits a surrogate pair (red before the repair: the bare 2,000-character head, unmarked).
`packages/engine/src/run/cut.test.ts`, "cutArguments": the longest value is cut first, an escaped character counts at its
JSON length, nothing under a path, identifier or timestamp key is cut, and the key is read by its last word.

**Not shown:** no proof drives an error-path tool record through the built app; a live run should show each error-path
record whose result passed 2,000 characters ending with `...`, its length 2,000, and each whose arguments passed 2,000
characters of JSON text still an object of at most 2,000, its long free text ending `...` and its `path` whole. The live-run harness's
create-shaped test that reads such arguments (`createShaped`, live-run finding M2) is outside this repair; since cut
arguments now stay an object, it reads them as it reads whole ones.
