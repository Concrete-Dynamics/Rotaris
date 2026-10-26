[Product directives](../directives.md) › PD-ORCH-001

<a id="pd-orch-001"></a>

### PD-ORCH-001 — loop supervision does not fire while a run is held at the plan gate

**The rule.** While `REQ-ORCH-153`'s plan gate holds a run, loop supervision SHALL NOT be active for
that run's entry agent: no trigger is evaluated, no classification call is made, and no corrective
message is placed in the conversation. Supervision SHALL resume for the segment that follows the
decision — approval or revision — with its counters at zero, exactly as `REQ-ORCH-105` leaves them
after an activation.

The suppression is a property of **the hold**, not of the turn's contents or of the entry role: it
begins when the gate is settled and ends when the gate resolves. A run that never reaches the gate is
supervised as before, and every agent of a released segment is supervised as before.

**Why.** Observed live 2026-09-16, run `a26918e8` (logged as [R-026](../requests.md#r-026)). A held run
has every tool that writes a file or runs a command withheld from it, so the only work it can do is
read, search and fetch. A plan for a codebase it has not seen is written by doing exactly that, many
times, over the same region — which is `REQ-ORCH-101`'s first trigger, "the same action observed four
times in a row", firing on the one behaviour the gate leaves available. The supervisor then did what it
is built to do: it placed, as a `role: 'user'` message carrying no marker, *"Pause and reassess the
`grep` call around `<path>`…"*. The run read it as an instruction from the person who had asked for a
plan, said so in its own words — "The user asks me to pause and reassess the grep call" — and spent
**three minutes and twelve seconds** reconciling it with what it remembered being asked. No user had
said anything. The run was held, waiting for one.

So the mechanism fires on the gate's own side effect and answers it in the voice of the person the gate
is waiting for. Neither half is wrong on its own; together, at the gate, they produce an instruction
nobody gave.

**Why a directive and not a repair.** Settled in writing before the code, because the classification
turns on it. Supervision as specified is **session-scoped and agent-scoped, not child-scoped**:
`REQ-NOTIFY-102` speaks of "a run with supervision enabled", `REQ-NOTIFY-103` of "the session's own
context" and "the agent", `REQ-NOTIFY-107` of state belonging to one session. `REQ-ORCH-101`'s "each
observed child event" is the event of a supervised agent — the entry agent has an execution record
like any other — and **no requirement exempts the entry agent, and none exempts a held segment**. The
product therefore does what the corpus says when it supervises the plan-gate turn. Suppressing it is a
change to specified behaviour, which is a directive.

**Why not the wider rule.** The impersonation itself — a product-authored message written to read as a
user's — is *required*: `REQ-ORCH-099` demands corrective messages that "read as natural user
instructions that never mention monitoring, detection, or injection", and `REQ-ORCH-103` demands a
"natural user voice". A directive making every product-authored message name itself would supersede
that clause and would have to name `REQ-HOOKS-074` as well, which mandates the user role for hook
feedback. It was drafted and **declined for now**, recorded in [R-026](../requests.md#r-026) as
`PD-ORCH-002` so the decline is visible. This directive is the narrow half: it removes the one place
the product speaks as the user to a run that is *waiting for the user*.

**What it costs.** A genuine loop during a plan cycle is no longer caught. That is a real loss and it
is accepted for a stated reason: the held segment is **one turn of one agent** (`REQ-ORCH-153`), its
tools cannot change the workspace, and the user is already at the surface deciding — so the loop's
usual cost, unbounded work on the wrong thing, is bounded here by the gate itself. The escalation path
is unchanged for every other segment. `REQ-ORCH-099`'s invisibility is preserved in the strongest
possible way: by the supervisor not firing at all.

> **Narrows:** REQ-ORCH-099, REQ-ORCH-101

*Raised by the owner, 2026-09-16; logged as [R-026](../requests.md#r-026).*

> **First execution, 2026-09-16, the day it was raised:** the risk was the classification, not the code.
> The draft allowed that `REQ-ORCH-099`..`105` might be child-scoped — `REQ-ORCH-101` opens "on each observed
> child event" and the gate holds the **root** — in which case supervising a held root was never required and
> this was covered work rather than a directive. Read against `REQ-NOTIFY-102`..`109`, it settles the other way,
> and the reasoning is above under "Why a directive and not a repair". The code is one condition at the
> supervisor's attachment site, checked against its own negation: with the condition removed the new test fails
> and the corrective fires while the hold stands. Supervisors are memoized per conversation, so the suppression
> is "no supervisor attached for this turn" rather than an instance discarded — and because nothing is observed
> while held, the released segment begins from an untouched record without anything having to reset it.
> The account is in `docs/architecture/first-executions.md`.
