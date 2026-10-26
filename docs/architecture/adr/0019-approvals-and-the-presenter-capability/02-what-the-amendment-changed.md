# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — What the amendment changed

Part 2 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## What the amendment changed

**This is the load-bearing change in this pass and it must not be read past.** The two requirements that
define attendedness were rewritten, and they no longer define it by registration.

- `REQ-TOOLS-053` now reads: "A session counts as interactive exactly when **an approval prompt for that
  session can be put in front of a person.** A session that cannot prompt anyone is not interactive and
  never borrows another session's ability to prompt."
- `REQ-TOOLS-069` now reads: "A run is attended exactly when its session **can put an approval prompt in
  front of a person** (`REQ-TOOLS-053`), and unattended otherwise." Absent or torn-down registration
  appears in the next sentence as a case that "cannot prompt anyone and **therefore** meets condition (a)
  of `REQ-TOOLS-067`" — a sufficient condition, not the definition.

The test is therefore a **capability** test, and a wedged main satisfies it no better than a crashed one:
a dialog that never appears has not been put in front of anybody. The consequence for this record is
direct. The channel-level liveness signal below was introduced as the architecture's answer to a gap
between two requirements, and this record carried a header saying so. Under the amended text it is
instead **the implementation of `REQ-TOOLS-053`'s own test** — the only way one process can decide
whether another can actually show a dialog is to ask it and see whether it answers. Nothing about the
mechanism changes. What changes is that it no longer needs defending as an addition, and
`REQ-TOOLS-064`'s "never a hang" holds at `runtime.approval_timeout_seconds: 0` without any requirement
being read against its own words. **A ruling did not cause this; a rewritten requirement did.**

**The residual tension, stated rather than smoothed away.** `REQ-SANDBOX-101` still says "Only the
presence of the channel is tested, **not whether it later answers**", and asserts that its condition is
"exactly the one fixed by `REQ-TOOLS-053` and `REQ-TOOLS-069`". Read literally beside the amended
`REQ-TOOLS-053`, those are no longer the same test. The reading this record takes — and it is a reading
— is that `REQ-SANDBOX-101`'s clause is about **the person**, not the channel: its own sentence
continues "an unanswered prompt is settled instead by `runtime.approval_timeout_seconds` and
`runtime.headless_approval_policy`", which is a disposal for a prompt that *was shown* and not answered.
A wedged presenter is a prompt that was never shown, and `REQ-SANDBOX-101` does not dispose of it. On
that reading the two agree; on a literal one they do not, and the assertion that they fix the same
condition is what makes the disagreement invisible to a reader of either. **Reported as a defect in the
amended specification and not repaired here.**

**One narrowing this record must respect.** `REQ-SANDBOX-101` fixes attendedness "**at the moment its
mode is resolved**", for the purpose of `REQ-TOOLS-067`'s downgrade. Attendedness for the downgrade is
therefore a value taken once at run start. The liveness revocation below governs **where a later `ask`
is routed**, not whether a mode resolution already made is revisited. A lapse mid-run does not
retroactively downgrade a run's permission mode and must not be implemented as though it did.

**SR-1 makes the per-window registration reading well defined.** The recommendation below reads
"unattended" as a property of *the application* — whether any live presenter is attached — rather than
of the focused session. Before SR-1 that phrase had a soft edge: it was not settled whether a presenter
held by some other instance of the product counted. `REQ-STARTUP-161` now fixes at most one instance per
user account per machine and says in terms that "several workspaces and several windows are not a second
instance", so **"the application" is one process tree and "any live presenter" is a single global
predicate.** Two further things follow. The multi-window case the recommendation assumes is now the
ordinary case rather than an edge (`REQ-STARTUP-163`), which strengthens it. And this record's statement
that "one channel carries every registration main holds, so a lapse makes the whole application
unattended at once" becomes literally true rather than a design intention, because there is exactly one
main. **OQ-4 is narrowed, not answered:** it asked per window or per session, and SR-1 removes an
alternative from the field without deciding between those two. *(Ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): per application window, as built.)*
