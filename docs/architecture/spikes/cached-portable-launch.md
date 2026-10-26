# Spike — the cached launch of the Windows `onefile` portable

- **Date:** 2026-09-02
- **Question:** SR-7 ruled that the single-file Windows portable **prepares itself once into a cache and
  launches from that cache afterwards**, keeping `REQ-STARTUP-013`'s single-executable observable and
  `REQ-STARTUP-031`'s closed artifact set unchanged and giving `REQ-STARTUP-155` a first-run-of-a-version
  exemption (`REQ-STARTUP-165`). SR-7 makes a measurement of that cached launch a **gate condition** and
  records that the only evidence the target is reachable is spike 17's **0.7 s file-copy baseline — which
  is a baseline and not a result.** This spike measures the mechanism.
- **Scope:** measurement only. No product code was written and none is authorised. Everything built here
  lives in the session scratchpad; nothing was added to this repository except this document.
- **Verdict, in one line:** **the warm-cache launch meets the 5,000 ms bound with a wide margin — 575.5
  to 723.1 ms over 12 launches at spike 17's anchor bundle weight, and 897.3 to 1,414.6 ms with the
  operating-system file cache dropped** — the exempted preparing run also lands inside the bound at
  1,634.7 to 2,091.3 ms, the version check on the fast path costs **0.13 to 0.49 ms**, and SR-7's ruling
  is sound. Two defects were found in the mechanism as ADR-0054 currently describes it, both fixable and
  both stated in §8 and §15.

---

## Parts

Since 2026-10-26 the rest of this document is in [`cached-portable-launch/`](cached-portable-launch/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](cached-portable-launch/01-1-environment.md) | 1. Environment |
| [02](cached-portable-launch/02-2-what-the-requirements-say-as-they-now-stand.md) | 2. What the requirements say as they now stand, and what that forced the method to measure |
| [03](cached-portable-launch/03-3-method.md) | 3. Method; 3.1 The payload is spike 17's anchor, rebuilt; 3.2 The application under test; 3.3 The artifact; 3.4 Cold cache; 3.5 Repetitions |
| [04](cached-portable-launch/04-4-results-the-number-that-decides-the-ruling.md) | 4. Results — the number that decides the ruling; 4.1 The cost of the launcher, isolated |
| [05](cached-portable-launch/05-5-where-the-time-goes.md) | 5. Where the time goes; 5.1 How much of the first run depends on having 16 cores — §565.7 |
| [06](cached-portable-launch/06-6-the-version-check-on-the-fast-path-and-the.md) | 6. The version check on the fast path, and the alternatives |
| [07](cached-portable-launch/07-7-what-cached-means-here-the-preparation-is.md) | 7. What "cached" means here — the preparation is genuinely reused |
| [08](cached-portable-launch/08-8-an-incomplete-or-corrupt-preparation.md) | 8. An incomplete or corrupt preparation; 8.1 A second defect — the redo must displace, not just rename onto; 8.2 Reclamation |
| [09](cached-portable-launch/09-9-identity-and-whether-self-update-still-works.md) | 9. Identity, and whether self-update still works; 9.1 The update replacement, measured |
| [10](cached-portable-launch/10-10-the-other-observables-req-startup-165-fixes.md) | 10. The other observables `REQ-STARTUP-165` fixes; 10.1 Clause (a) — nothing is written beside the artifact; 10.2 Clause (a) — read-only medium; 10.3 Clause (b) — a different artifact prepares afresh; 10.4 Clause (d) — nothing fetched, nothing elevated; 10.5 Two launches racing to prepare |
| [11](cached-portable-launch/11-11-an-anomaly-that-is-not-about-the-launch.md) | 11. An anomaly that is not about the launch mechanism, and is decision-relevant |
| [12](cached-portable-launch/12-12-threats-to-validity.md) | 12. Threats to validity |
| [13](cached-portable-launch/13-13-what-this-harness-does-not-model.md) | 13. What this harness does **not** model |
| [14](cached-portable-launch/14-14-verdicts.md) | 14. Verdicts |
| [15](cached-portable-launch/15-15-adr-impact.md) | 15. ADR impact |
| [16](cached-portable-launch/16-16-reproducing-this.md) | 16. Reproducing this |
