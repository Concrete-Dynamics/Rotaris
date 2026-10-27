# Resolution Record — Domain 09, User-Defined Lifecycle Hook Commands — Graphical-only sweep

Part 1 of 2 of [domain 09's resolutions](../09-lifecycle-hooks.md), which indexes every part.

## Graphical-only sweep

The product has no command-line interface and no terminal user interface, so a requirement reachable
only from a shell is withdrawn and its capability re-sited on the desktop.

| Withdrawn | Why its only surface was a shell | Capability now carried by |
| --- | --- | --- |
| **REQ-HOOKS-016** — a configuration file named by a `--config <path>` override carries no scope tag, resolves as scope `default`, and is therefore trusted | The override existed only as a command-line flag; without an argv there is no way to name such a file, and no other reading of the requirement survives | The capability is *deliberate user consent to a configuration source's hooks, as opposed to hooks that arrived with a checkout*. It is carried by the review dialog of REQ-HOOKS-104 to REQ-HOOKS-108 — where the user reads the commands and allows or refuses them — and by **REQ-HOOKS-136** (new), which lets the user revisit, change, or clear that decision at any time from the hooks settings tab. REQ-HOOKS-090's citation of REQ-HOOKS-016 is removed; REQ-HOOKS-014 already fixes that an untagged entry resolves as scope `default`. |

Three further requirements named a shell venue beside a desktop one. Each keeps its substance and
loses only the shell half, so nothing is withdrawn and no capability moves:

- **REQ-HOOKS-083** — "on every host alike — desktop, headless, and programmatic embedding" becomes
  "the desktop application and any programmatic embedding of its engine". A programmatic embedding
  is not a user entry point; it is the engine layer the desktop application itself drives.
- **REQ-HOOKS-086** — the sentence requiring headless runs to print the withheld-hooks notice to the
  console is removed. The capability it served — telling hooks withheld on purpose apart from hooks
  that are broken — is restated over the surfaces that do exist: the desktop notice channel
  (REQ-NOTIFY-224), the `blocked — not reviewed` row status of REQ-HOOKS-103, and the `hook_failure`
  issues of REQ-HOOKS-120, which record the broken ones separately.
- **REQ-HOOKS-089** — "Desktop and headless runs SHALL share one execution lifecycle" becomes a run
  started from the desktop interface and a run started by a programmatic embedding of the engine.
  The invariant is the point of the requirement and is preserved intact.

> **Corrected 2026-09-01, in the ruling-application round.** The substitution above put a run path
> into two requirements that this product does not have. REQ-EVENTS-178 states that the product is one
> desktop application offering no embedding surface and no programmatic entry point — no library,
> package, plugin host or endpoint through which code the user did not launch may start or drive a run
> — so a comparison against "a run started by a programmatic embedding of the engine" is vacuous, and
> the same defect was corrected in REQ-EVENTS-081 in the same round. REQ-HOOKS-083 and REQ-HOOKS-089
> now state the guarantee against **REQ-SESSION-080's closed set** of ways a run can be started, citing
> that owner rather than maintaining a second list that can go stale the same way. **The invariant is
> not narrowed by the correction**, and both requirements say so: the trust gate is a property of the
> run and never of the surface that began it, and a way of starting a run added later is inside the
> guarantee from the moment it exists rather than on being named. REQ-HOOKS-089's testable consequence
> — the approved and unapproved `iteration_end` cases and the "not been reviewed" notice — is
> untouched.

**REQ-HOOKS-102** listed "console output" among the surfaces a withheld hook's name and command must
never reach. Since there is no console venue, the list now names the desktop interface itself and the
application log, which widens the guarantee rather than narrowing it.
