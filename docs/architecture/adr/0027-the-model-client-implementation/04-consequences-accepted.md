# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Consequences accepted

Part 4 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Consequences accepted

1. A dependency whose major versions rename core types, at a demonstrated cadence of roughly two
   majors a year. Mitigated by the port, which is mandated anyway; the blast radius is one adapter file,
   and **the version is pinned** so an upgrade is a deliberate act with the usage-field mapping
   re-checked each time.
2. **A spike is required before the gate:** responses-dialect requests against a non-vendor base URL
   with custom headers. If it does not work, the fallback is a hand-written responses-dialect
   implementation behind the same port — a contained loss, not a redesign.
3. We accept that the SDK gives little leverage overall. It is chosen for one step, on the merits of
   that step, not as a framework.
4. The custom `fetch` becomes a security-relevant chokepoint: it carries the bearer and it is where
   `REQ-PROVIDER-131`'s redaction applies before anything is logged.
