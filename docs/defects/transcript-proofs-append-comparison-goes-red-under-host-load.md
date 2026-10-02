## transcript-proof's append comparison goes red under host load, and records no load to tell it by

`pnpm transcript-proof`'s append stage compares the shown-update time of appends at 1,200 rows with an empty transcript
(REQ-CHAT-055's append clause). Each side is two launches, alternating empty and loaded (`APPEND_LAUNCHES = 2`), and the
verdict is that the loaded side's median is at most the empty side's median plus one measured frame (about 17 ms). With so
few launches, one launch that lands in a burst of other work on the host moves its side's median by two frames or more, and
the comparison goes red on the host rather than on the product.

The verifiers of fin4 recorded reds of 164.1 against 130.0 ms (load average 14.7), 110.1 against 90.9 ms (5 to 7) and 175.9
against 135.6 ms (5.9 to 6.6), all on 4 CPUs with the other plan's proofs running. In the second, the loaded launches had no
changed delivery, so they ran none of the code fin4's hold added
([the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md](fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md)).
An earlier whole run went red at 103.45 against 53.8 ms (load 5 to 6), and the next run, taken at once, passed.

The stage records no host load, so a red cannot be told apart from a regression by its own evidence: `append.json` holds
the samples, the frame cadence and the verdict, and nothing about what else the host was doing. `terminal-proof` has
recorded `os.loadavg()` and the CPU count beside its echo reading since fin4, and the host's rule is that a red above the
CPU count is re-run alone (`.agents/skills/orchestrated-build/references/environment.md`, "Load").

Seen by the verifiers of plan fin4 (2026-10-02) and triaged in the fourth triage of open notes as an observation with no
note; recorded here before any repair.

## Specs

- REQ-CHAT-055: "appending a row MUST cost no more than it does on an empty transcript". The product is not shown to break
  it; the proof that is its evidence goes red on host load and cannot say so.
- REQ-CHAT-157: the budgets are "measured on the machine under test". Whether the clause holds on a host whose CPUs other
  processes oversubscribe is the same question OQ-176 asks of REQ-SHELL-166's echo; this note does not rule it.

## Relevant files

- `apps/desktop/scripts/transcript-proof.mjs`: `APPEND_LAUNCHES`, `appendRun` (no load recorded), the alternating launches
  and the verdict (loaded median at most empty median plus one measured frame), and where the verdict is enforced.
- `docs/architecture/adr/0045-what-paints-the-transcript.md`: the measurement point under a burst and its later rounds.
