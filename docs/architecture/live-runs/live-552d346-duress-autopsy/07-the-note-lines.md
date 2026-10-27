# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — The NOTE lines

Part 7 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

## The NOTE lines

| NOTE | verdict |
|---|---|
| sign-in: discovery did not run | Correct. |
| the long run's per-agent timeout, 2,700 s | Correct; see D2. |
| what the long run commissioned | Correct as counted. It does not say that e1/e2 and f1/f2 are hand-offs, nor that the hand-offs were cut (V1). |
| the long run never compressed its context | Correct: 88,720 (34 %) against 157,286. |
| how long the long run was | Correct: 3,273 s from launch, 303 calls, 8 children, 0 compressions. |
| no ceiling was imposed | Correct: 6,107,483 = the store. |
| no `write_file` left out its operation | Correct (0 inferred creates). |
| write scopes to a non-writer: 1 (#92) | Correct; V2. |
| no `haet_edit` miss at level 2 or 3 | Correct; PD-TOOLS-014 not reached. |

No check reads a child's payload for a truncation marker (V1), and none counts renderer console errors (D8's owed NOTE).
