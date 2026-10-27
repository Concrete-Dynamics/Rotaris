# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — Consequences accepted

Part 4 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## Consequences accepted

1. A view model distinct from the session record, with the drift risk that implies. The sequence number
   makes drift detectable at the next publication; it does not prevent it.
2. **A decline path that must be tested deliberately**, since in normal operation it never fires — and
   it now has two entrances, the sequence gap and the inapplicable increment, which must **both** be
   exercised. A fixture that replays a deliberately dropped publication is the only way the step 0
   branch is ever executed, and without one the product's single loss-detection mechanism ships
   unexercised.
3. A rule that **no transformation with an environment-dependent result may live between the incoming
   state and the presented rows** — which extends ADR-0006's no-bare-clocks rule into the renderer for
   this one stage. Step 0 inherits it: the recovery episode's counter contribution must not depend on
   how long the whole read took or on how many publications arrived meanwhile.
4. **Every part of step 4 must be expressible incrementally, from the first line of code.** A folding
   rule that can only be evaluated by a forward scan of the whole displayed array, or a search index that
   can only be rebuilt whole, is not admissible however clear it reads — not because it would be slow,
   but because `REQ-MONITOR-223`'s comparison against an empty session forbids it. This is the cost of
   the choice and it is paid up front.
5. **The subscription handler is now part of the determinism surface**, because it decides which
   publications reach this stage. It was previously a transport detail. Its one rule — drop for this
   session while reconciling, deliver otherwise — must be stated in the code as a rule and covered by
   the fixture in consequence 2.
