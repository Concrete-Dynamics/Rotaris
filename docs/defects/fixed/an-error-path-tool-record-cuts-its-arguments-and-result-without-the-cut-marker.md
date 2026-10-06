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
halves of a surrogate pair. Arguments that fit stay the object they were; arguments that do not are stored as the head of
their JSON text, marked, so a reader sees an object's text that does not close and ends with the marker. A result that
fits, and every record of a call that succeeded, is stored whole as before. `run/cut.ts`'s comment no longer places this
cut outside REQ-SESSION-194; its old reading is kept there beside the new one. The runtime view's store table says so.

**Pinned by** `packages/engine/src/session-writer.test.ts`, "SessionWriter — an error-path tool record marks the cut it
makes": long arguments and a long result come back 2,000 characters ending `...` (red before the repair: the bare
2,000-character heads); arguments and a result that fit, an exactly 2,000-character result included, come back whole;
a call that succeeded is never cut; and a cut never splits a surrogate pair (red before the repair: the bare 2,000-character head, unmarked).

**Not shown:** no proof drives an error-path tool record through the built app; a live run should show each error-path
record whose arguments or result passed 2,000 characters ending with `...`, its length 2,000. The live-run harness's
create-shaped test that reads such arguments (`createShaped`, live-run finding M2) is outside this repair.
