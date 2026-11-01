# ADR-0055 — history

The passages of [ADR-0055](../../../architecture/adr/0055-startup-sequencing.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-08-31"></a>

**The revision of 2026-08-31**, from [0055-startup-sequencing.md](../../../architecture/adr/0055-startup-sequencing.md), the header:

Startup gains a phase in front of everything it previously
began with: a launch first establishes whether it is the instance at all.

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0055-startup-sequencing.md](../../../architecture/adr/0055-startup-sequencing.md), the header:

Startup gains **another** phase
in front of that one, on one artifact only: a `onefile` portable launch may have to prepare itself
before an application process exists at all (`REQ-STARTUP-165`). The budget arithmetic is restated per
flavour on measured figures rather than assumed, and the "Revisit if" clause that turned on that
measurement is discharged.

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0055-startup-sequencing.md](../../../architecture/adr/0055-startup-sequencing.md), the header:

Three things land. Phase −1 gains an
**outcome that is not silent** — `REQ-STARTUP-165` (c) now specifies a notice for a preparation that
cannot be made at all, and this record owns where in the post-show order it sits. The workspace store
is named in that order, because ADR-0058 puts its opening there and a **native binding that will not
load** must fail loudly on `REQ-SESSION-089`'s terms rather than be swallowed. And `REQ-STARTUP-121`'s
update restart is a **hand-over of the instance record**, which the platform primitive alternative II
chose has no operation for — a gap this record had not noticed and now closes.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0055-startup-sequencing.md](../../../architecture/adr/0055-startup-sequencing.md), the header:

**This record's own verification obligation was measured and it
fired.** Observation 2 does not hold on Windows: against a primary that was running but not pumping
messages, `app.requestSingleInstanceLock()` **blocked the launching process for 20.0 seconds**, returned
`false`, performed no reclaim and no retry, and the hand-over **never reached the primary — not even in
the 25 seconds after it recovered.** The second launch ended **with no window on screen**, which
`REQ-STARTUP-164` forbids in terms. By this record's own stated rule, **the claim moves to alternative
I — our own record file — on every platform**, and the platform primitive is dropped rather than wrapped
in a timeout. The paint sequence is unaffected and alternative B stands. The portable's steady-state
budget is also now measured rather than asserted, and the "Revisit if" clause that turned on it is
discharged.
