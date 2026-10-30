# `live-run` — The classifier's refusals

Part 1 of 12 of [the live-run record](../live-run.md), which indexes every part.

## The classifier's refusals

`AGENTS.md` states the rule an agent obeys when the harness refuses a launch; this is the record behind it.

An owner's yes is not always enough in an agent session. On the Linux agent host, the harness's automatic permission
classifier has refused some `live-run.mjs --confirm` launches as a real-world transaction even where the owner authorised
the run (R-066, R-067; [`docs/defects/fixed/no-live-run-has-executed-on-merged-main.md`](../../defects/fixed/no-live-run-has-executed-on-merged-main.md)).
On 2026-09-30 it refused the launch over the default scenarios and the long `duress` launch, while it admitted targeted
`--only=ask` and `--only=ask,edit` runs on repair branches the same day. Which launches it admits is not established, so
an agent does not predict it. An agent that meets that refusal stops, and it does not reach the run by another route,
such as splitting the refused launch into admitted `--only=` pieces. It records the refusal where its task lives and
says so in its report. Only the owner can close the gap: by allowing `node apps/desktop/scripts/live-run.mjs --confirm`
for agent sessions in the harness's permission rules, or by running the command by hand.

On 2026-10-01 both refused launches ran on merged `main` `71ad8e8` and printed `live-run PASSED`. The orchestrating
session launched them after the owner authorised live runs in its conversation. Since 03:23 that day, the owner's
allow rule for the `--confirm --skip-build` launch forms has stood in the host's git-ignored
`.claude/settings.local.json`. `.agents/skills/orchestrated-build/references/live-runs.md` lists those forms. A
session that does not hold that rule, or a launch in any other form, can still meet the refusal, and the paragraph
above still governs it. `main` has moved past `71ad8e8` since, so a live run of the head that would be released is
still owed, and it is asked for like any other.
