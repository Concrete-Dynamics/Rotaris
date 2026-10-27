# ADR-0054 — Packaging, the four artifacts, and self-update — Discharged — the cached-launch clause, retired 2026-09-02

Part 8 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Discharged — the cached-launch clause, retired 2026-09-02

This record carried a "Revisit if" written for a bad number, on the grounds that the number did not yet
exist. **It exists. SR-7's gate condition is met and the clause is retired**, bullet by bullet, so that
what was discharged and what was not is legible rather than assumed.

- *"The figure lands over 5,000 ms."* **Did not happen.** 575.5–624.2 ms warm, 897.3–1,242.5 ms cold,
  worst observation anywhere 1,414.6 ms. The clause named two remedies it would have reached for — moving
  where the preparation sits, and making the stub hand off rather than stay in the launch chain — and
  neither is needed. The second was measured anyway: the stub already hands off, exiting about 19 ms after
  its own first instruction on the fast path, and that is what makes `REQ-STARTUP-125` work at all.
- *"The figure is fine but the fast-path check is a material share of it."* **Did not happen, and the
  escape hatch the clause reserved is now closed rather than merely unused.** The check as this record
  specified it was 0.14–0.49 ms of a ~600 ms launch — 0.01 % of the budget. The clause's remedy was to
  carry the token in the directory name and stop reading the marker; under this revision the marker also
  carries the manifest that closes Defect B and the preparation-failure outcome the notice depends on, so
  **that remedy would now reintroduce a launch that produces no window.** It is withdrawn as an option,
  not left available.
- *"Cache invalidation across an update does not work — the one outcome that would make the design wrong
  rather than slow."* **Did not happen.** Two artifacts differing by one line in one licence file
  produced different tokens; v1.0.1 prepared afresh (1,961.3 ms), v1.0.0's own preparation stayed intact
  and was still used afterwards (591.3 ms, cache hit), and two token-named directories coexisted, each
  with its own marker naming its own token. A same-payload artifact rebuilt at a different chunk size
  also produced a different token and also prepared afresh. **The residue is the launcher-bytes case
  recorded under version identity above**, which the marker's format field covers and which is the reason
  that field is now called load-bearing.
- *"The unwritable-root case behaves differently from the design above. Spike 20 should exercise it."*
  **Not discharged. The spike did not exercise it**, and it is now consequence 14.
