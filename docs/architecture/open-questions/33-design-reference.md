# Open questions — Design-reference dependencies

Part 33 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds no live entry; OQ-30, OQ-31 archived in [the archive](../../archive/architecture/open-questions/33-design-reference.md).

## Design-reference dependencies

The approved visual design reference was **not available** to the architects who produced the slice
proposals. Every proposal is therefore about *mechanism* — where state lives, what crosses a process
boundary, what paints a row, what a preference is written to. No mechanism above depends on the
reference, but **no screen can be built without it.**

> **Disposition, 2026-09-02 (owner ruling GD-1).** Both halves of that sentence are acted on rather than
> only the convenient one. The reference is **not a condition of the Architecture Gate**, because the gate
> is about mechanism and the independence stated above was established by the architects rather than
> assumed. It **is** a condition on building any screen, and that is recorded as IC-2 in
> `implementation-conditions.md` so it binds something rather than lapsing into nobody's. OQ-30 and the
> three items below it stay open and stay the reference's. OQ-31 was removed from this list and ruled
> without the reference; see its entry.

*Priced by Part T″, 2026-09-11 (`pnpm terminal-stream-proof`, the `obligation2` ladder).* At the licensed
rate of 50 frames/s per stream, with the delivered rate capped at `REQ-MONITOR-306`'s 1,000/s by merging: **twenty
background sessions alone offer exactly 1,000 deliveries a second, the whole aggregate**, before one of
`REQ-MONITOR-285`'s twenty agent streams is counted; the shipped ~40 offer 2,000/s and merge 2,960 frames over
three seconds; 400 streams offer 20,000/s, 1,000 streams 50,000/s, 3,000 streams 150,000/s. **Nothing is dropped at
any count** — the cap merges, as `REQ-SHELL-103` requires — so what the count buys is staleness, and the
staleness has a law: while `streams × windows ≤ 1,000` it is bounded by the drain's own one-second period (at
most 1,000 ms, about 500 ms in the median, whatever the count), and above that it is
`streams × windows ÷ 1,000` seconds (three thousand streams measured 3,000 ms worst and 1,500 ms median).
**So a stated maximum M would let the worst-case surface staleness be computed rather than absorbed:
`(agents + M) × windows ÷ 1,000` seconds.** That is what ADR-0021's "Revisit if" says a ceiling would buy.
The owner's call; recorded, not resolved.

- OQ-30 — Theme palettes and token values. CLOSED 2026-09-04 by the IC-2 implementation and rendered-pixel proof; closed 2026-09-04; [archived](../../archive/architecture/open-questions/33-design-reference.md#oq-30)
- OQ-31 — Which Markdown dialect is rendered. CLOSED 2026-09-02 by owner ruling GD-1, and closed without the design reference; closed 2026-09-02; [archived](../../archive/architecture/open-questions/33-design-reference.md#oq-31)
