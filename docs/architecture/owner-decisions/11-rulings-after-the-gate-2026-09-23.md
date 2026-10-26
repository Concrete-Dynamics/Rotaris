# Product-owner decisions on the architecture record — Rulings after the gate — 2026-09-23

Part 11 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Rulings after the gate — 2026-09-23

### OQ-63 — the application log's threshold, ruled

**Ruled 2026-09-23 (R-048).** The owner accepted the proposal put to them for the open defect note
`the-application-log-keeps-every-level-because-nothing-reads-one.md`: the application log records `info`
and above by default, carries each line's level as a field, and restores `debug` only through the
environment variable `ROTARIS_APP_LOG_LEVEL`. No configuration key or settings control governs it, and
`session_log_level` keeps governing the per-session log alone (REQ-CONFIG-121, REQ-MONITOR-238).

The disposition is **`PD-MONITOR-002`**. It is a directive rather than an amendment round because the
specification is silent about this log's level and the owner is deciding new behaviour, which
`docs/product/README.md` routes to a `PD`. The answers to OQ-63's three questions: a threshold, yes; its
own switch, not `session_log_level`'s key; and an environment switch that restores `debug`, which is the
shape the question named.

**What this ruling does not do.** It builds nothing. Until the directive is built the log keeps every level,
and the directive owes its first execution into `first-executions.md` when it is.

**Built 2026-09-27 (R-055).** The first execution is reported under `PD-MONITOR-002` in `docs/product/directives.md`
and has its row in `first-executions.md`.

### OQ-21 — per-token prices are decimal strings, ruled; OQ-62's configured-rate branch with it

**Ruled 2026-09-23 (R-049).** The owner approved the design recorded on
`docs/defects/fixed/configured-per-token-prices-take-no-effect.md`. Three records carry it:

- **OQ-21, answered as it recommended, by amendment.** `REQ-PROVIDER-072` and the snapshot formats typed
  prices as floats while `REQ-PROVIDER-121` forbids float money, so the corpus disagreed with itself and is
  corrected in place: `REQ-CONFIG-088` (decimal ≥ 0, a YAML number taken as the decimal its text states),
  `REQ-PROVIDER-072`, and the two `pricing` format blocks in domains 04 and 15. Each carries an inline
  amendment mark, and each domain's resolution record carries the amendment note.
- **ADR-0031, accepted in narrowed form.** The Decimal is `money.ts`'s scaled `bigint` with no scale fixed in
  advance. Pricing adds exact multiplication by a whole token count, which needs no library and no spike. The
  lint rule banning arithmetic on the branded type is built with it. The library question stays open only for
  the balance division of `REQ-PROVIDER-130`.
- **`PD-MONITOR-001` revision 2.** A request the provider did not price is priced from configured rates, and
  all four of `REQ-MONITOR-166`'s qualifiers get a producer and a fixed label. A revision rather than a new
  directive, because one requirement carries one narrowing directive.

**Deferred:** OQ-62's discovery-pricing branch. **Prerequisite for building:** the repair of
`docs/defects/fixed/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`.

**What this ruling does not do.** It builds nothing. Every configured run still reads `"0"` under `unknown`
until the revision is built, and its first execution reports into `first-executions.md`, ADR-0031 and the
directive.
