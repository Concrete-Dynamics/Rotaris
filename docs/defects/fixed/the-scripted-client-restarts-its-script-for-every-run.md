## The scripted model client restarts its script for every run

The scripted client keeps its per-agent step counters in the client instance, and each run builds a new client. So a
child resumed by a continue (PD-ORCH-005) takes its script from the first step again, not from where it stood. A driven
proof cannot script "the resumed agent carries on with its next step" in one list. The phase 7 rehearsal's writer asked
for its first `write` again after the continue. A relaunch resets the counters in any case.

Noticed 2026-09-27 by PD-ORCH-005's phase 7 rehearsal.

## Specs

None. The scripted client is verification only. What the product sends a resumed agent is the agent's own record,
which this does not touch.

## Relevant files

- `apps/desktop/src/run-host/scripted-client.ts` — `calls`, keyed by agent and task line, per client instance.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The counters still live in the client, one per run, and are no longer the only place
the client learns where an agent stands. The first call an agent makes in a client — the orchestrator, or a child by its
TASK line — places its counter from the request itself: the steps its own record already holds, one assistant message
per step that answered (`resumedAt` in `scripted-client.ts`). A step that answers with no message (`fail`, `fail:*`,
`hang`, a `wait:` prefix) counts as taken wherever it falls before the last step the record shows. A fresh agent's
record holds no assistant message, so it starts from the first step exactly as before, and every later call in the
client counts on as it always did. The record lives in the store, so a relaunch no longer resets anything: the resumed
agent's first request carries it. No counter was hoisted into the run host and nothing was persisted beside the proof.

The repair has two limits, both stated in the code. A root resumed in a later iteration of its run counts only that
iteration's steps, where an unbroken run's counter counted every iteration's. A record the compressing pass rewrote
counts only the steps it still holds.

Pinned by:
- `apps/desktop/src/run-host/scripted-client.test.ts`: a resumed child and a resumed root take their next step, a wait
  prefix and a failed call are skipped, a record longer than the script answers, and a fresh agent is unchanged. Four
  of its six cases fail on the old client.
- `part-j-proof`'s steer-at-rest scenario (3b): the resumed root's record holds the script's three reads exactly. On the
  old client the proof failed there, as root under Xvfb: "it holds 5 reads where the script names 3". With the repair
  it passes all eight of its results.

The neighbours whose launches continue or reopen a session, run against the same build as root under Xvfb:
`checkpoint-proof`, `mission-proof`, `part-h-proof`, `questions-proof`, `resilience-proof` (no failure listed),
`transcript-proof` and `plan-gate-proof` pass. `chat-controls-proof` stops at its first launch, on the open
[`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](../chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md).
It stops at the same assertion on the old client too, before any continue.
