[Product directives](../directives.md) › PD-STARTUP-009

<a id="pd-startup-009"></a>

### PD-STARTUP-009 — each hand-over has its own interval, and a holder that is live and never answers is reclaimed

**The directive.** In REQ-STARTUP-164's resolution of the instance record, each hand-over SHALL have its own 5-second
interval: the one clause (2) attempts, and the one clause (4) attempts once more. "No waiting beyond that one interval"
bounds clause (3)'s wait for clause (2)'s hand-over, not the resolution as a whole. And clause (4) SHALL NOT end the launch
with no window: where its second hand-over is not acknowledged within its interval — the record has come to name a process
that is live on this machine and does not answer, or a record that cannot name one (another machine, a malformed record) —
the launch SHALL reclaim the record and attempt the exclusive claim a final time. A claim that succeeds makes this process
the instance, and startup continues at REQ-STARTUP-040. A claim that fails ends the launch as clause (4) says, having
started no rival. The resolution is therefore bounded by three claim attempts, two reclaims and three intervals, and it
still cannot spin.

What is unchanged: an instance that answers is not an instance that does not answer, and no interval runs against it;
a refusal under REQ-SHELL-169 is an answer and the launch waits instead; the probe has no effect on the probed process;
the launch writes nothing but the record while resolving it. REQ-STARTUP-161's two outcomes still close the set, and a
launch that becomes the instance beside a live holder that never answered is the brief second process REQ-STARTUP-164
already admits ("the one path by which two processes of the application can briefly exist"), protected by the session
locks it names.

**Why, and what it costs.** [OQ-460](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-460) and
[OQ-461](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-461), raised by the review of the
instance's stand-down on 2026-10-31. A second hand-over attempt with no interval of its own is not an attempt, and a
launch that used the first interval would make clause (4) a formality. As built on that date, a holder that is live and
never answers ended the launch `refused`, exit code 2, with no window of its own and none surfaced: the person who
started the application saw nothing, which is the outcome REQ-STARTUP-164's first sentence exists to forbid ("SHALL never
leave the application unlaunchable"), and clause (3) already lists "a process that is running does not answer" among the
reasons to reclaim. The owner chose the reclaim over a surface that explains the silence. What it costs: a worst case of
fifteen seconds before a window where ten stood, only on a holder that is wedged; and the brief second process the
requirement already admits, now reachable from clause (4) as well as clause (3). What it displaces: clause (4)'s "SHALL
then end" in the unanswered case, and "one interval" read as the whole resolution's bound.

**As built.** 2026-11-01, the same day: `claimInstance` (`packages/platform/src/instance.ts`) follows clause (4)'s unanswered
hand-over with a final reclaim that takes the record whatever it holds — the live holder that never answered, another
machine's record, a malformed one, a dead process's — and a third exclusive claim; success returns `instance` with
`reclaimedFrom` naming what the record held, which main logs at `warn` (`instance claimed after the final reclaim …`), and
a third lost claim returns `refused`, exit code 2, as before. As built the launch waits two hand-over intervals, not three:
the final claim is attempted without a further hand-over, which the bound above admits and the register's row of
2026-11-01 reports ([first executions](../../architecture/first-executions/34-the-register-33.md)). The note moved to
`docs/defects/fixed/a-launch-whose-two-hand-overs-go-unanswered-ends-with-no-window.md`.

> **Narrows:** REQ-STARTUP-164

*Raised by the owner, 2026-11-01; logged as [R-090](../requests.md#r-090), the ruling of OQ-460 and OQ-461.*
