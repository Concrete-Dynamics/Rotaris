# Open questions — Spikes, and the questions raised since (36 of 36)

Part 69 of 69 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-460, OQ-461.

<a id="oq-460"></a>

**OQ-460 — May clause (4)'s second hand-over wait an interval of its own?** *(REQ-STARTUP-164, ADR-0055. Raised 2026-10-31 by the review of the instance's stand-down.)*

**What is open.** REQ-STARTUP-164 (3) allows "no waiting beyond that one interval", and (4) requires the launch to "attempt the hand-over once more". Where (2)'s hand-over already waited the full 5 s and the holder (4) reaches does not answer either, a bound on (4)'s attempt decides how long the launch runs, and the requirement states none of its own. ADR-0055 says "one interval" too.

**What the build proceeds under.** (4)'s hand-over is bounded by the same 5 s as (2)'s (`claimInstance`, `packages/platform/src/instance.ts`), so the resolution can take two intervals. The bound is still finite and no claim is added.

**What decides it.** A ruling on whether "that one interval" limits (2) and (3)'s wait alone, or the launch's whole resolution; under the second, (4) has only what remains of it, and a launch that used it all gets no real second attempt.

<a id="oq-461"></a>

**OQ-461 — What does a launch end as when the holder is live and never answers?** *(REQ-STARTUP-161, REQ-STARTUP-164, ADR-0055 consequence 14. Raised 2026-10-31 by the review of the instance's stand-down; [the note](../../defects/a-launch-whose-two-hand-overs-go-unanswered-ends-with-no-window.md).)*

**What is open.** Where the record has come to name another live claim that does not answer, the requirement pulls three ways. (4): the launch ends "having in either case started no rival". The sentence after it: "Every path therefore ends with exactly one instance running and a window on screen". Its first sentence: a record naming a process that cannot be reached "SHALL never leave the application unlaunchable". REQ-STARTUP-161 closes the outcomes at two, and `refused` is neither. (3) also lists "a process that is running does not answer" among the reasons to reclaim, without saying whether that holds for a record that came to name a different process during the interval.

**What the build proceeds under.** (3) leaves a record naming another live claim, on REQ-STARTUP-161's ground; the retry loses; (4) hands over once more; unanswered, `claimInstance` returns `refused` and main ends with exit code 2. One process runs, and no window is surfaced for this launch.

**What decides it.** A ruling on which sentence governs this path: refuse with no window as built, reclaim as (3)'s list reads and accept the brief second process, or some surface that tells the person what happened.
