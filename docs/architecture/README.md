# Rotaris-crw — system architecture

> **The system as built, in three views:** [`views/`](views/README.md) — component, process, runtime. Consulted before a code change, maintained in the same commit as one (`CLAUDE.md`).

- **Status:** **ACCEPTED. The Architecture Gate CLOSED on 2026-09-03** and **implementation is authorised**
  — bounded, for the mechanism, subject to IC-1 to IC-6 in [`implementation-conditions.md`](implementation-conditions.md).
  The verdict, the five decisions and the record of decision are in
  [`../clean-room/architecture-gate.md`](../clean-room/architecture-gate.md). **The design language in
  [`../design/`](../design/) is adopted and authoritative; its information architecture is not — structure
  comes from `docs/spec/`, and `REQ-SHELL-023` is canonical.** *This bullet read "no screen may be built
  before IC-2's design reference exists"; the reference exists and has since 2026-09-01. IC-2 now bounds
  only `REQ-SHELL-128`'s three-theme obligation.* **No Linux or macOS artifact before IC-3's hosts do.**
  *Corrected 2026-10-13: "IC-1 to IC-6" was the register as the gate left it; it now holds **IC-1 to IC-8** (IC-7
  adopted 2026-09-06, IC-8 raised 2026-09-15). IC-2 was discharged on 2026-09-04, so it bounds nothing but the owner's
  different-scale multi-monitor drag. On 2026-10-06 the owner counted the work as finished without the release
  pipeline, CI, the Linux and macOS builds and the owner's hardware checks ([R-071](../product/requests.md#r-071)), and
  since 2026-10-07 the orchestrator's consortium rules open questions under the owner's delegation
  ([R-072](../product/requests.md#r-072)).*
- **Behavioural target:** `ROTARIS-CRW-001` (see [`../clean-room/reference-record.md`](../clean-room/reference-record.md))
- **Evidence base:** [`constraints.md`](constraints.md) — what the specification forces, with requirement identifiers — read together with [`../spec/resolutions/`](../spec/resolutions/), the twenty-one records disposing of every open question each domain draft raised. A resolution sometimes narrows what a requirement appears to license; `constraints.md` says where and why.
- **Measurements:** [`spikes/`](spikes/) — **ten reports covering nine live spikes and one withdrawn one**, two dated 2026-08-31, two dated 2026-09-01 and six dated 2026-09-02 *(this read "four dated 2026-09-01"; two of those four are 2026-08-31)*, and **the only real evidence this record has**. Several of them overturn something it asserted, and the 2026-09-02 group overturned more than the first four did: **three platform facts this record had asserted were disproved, one ADR's own stated gate trigger fired, and one mechanism this record had decided and never run was found not to work at all.** They are named inline wherever a claim rests on one, and the ADRs that depend on them carry an `Evidence:` header field. **Where a measurement disproved a *reason* but not a *conclusion*, both records say so in as many words** — the conclusion, that the original reason was tested and found false, and the reason that actually holds. That sentence is what stops a later reader "simplifying" the decision back into the defect. **Where a measurement disproved a *mechanism*, which has now happened four times, the record carries the failure in place beside the corrected step** — see the finding in section 6, which is now
**four for four**: the fourth mechanism was the harness built to measure the third.
- **Live-run readings:** [`live-runs/`](live-runs/README.md) — the autopsies of `pnpm live-run` packs the record cites, kept in the repository since 2026-10-13; the packs themselves stay on the host that ran them.
- **Dependency-alert readings:** [`dependency-alerts/`](dependency-alerts/README.md) — Dependabot's alerts taken to the copy the lockfile resolves, the paths that reach it and whether the installer carries it, one dated pass per file, since 2026-10-22 (R-081); a reading records and assigns, and never dismisses an alert.
- **Decisions:** [`adr/`](adr/) — 58 records, numbered in dependency order. **Every requirement identifier cited anywhere in `adr/` — 1,214 of them, drawn from a corpus of 4,397 — resolves to a requirement the specification defines. Zero dangling citations.** Re-checked mechanically on 2026-09-02 after the last of the three rounds of that date, which minted `REQ-EVENTS-179`, `REQ-MONITOR-306`, `REQ-SHELL-169` and `REQ-SESSION-202` and edited nine ADRs between them; what it does *not* establish is that every citation still says what the ADR claims it says, which is a different sweep and is reported in section 6.
- **Unresolved:** [`open-questions.md`](open-questions.md) — **thirty-one escalations: twenty-nine ruled, two closed by the specification itself, NONE open**; forty-seven specification questions (**nine** closed with their reasons, **thirty-eight** open, OQ-31 closed 2026-09-02 by GD-1); **one** design-reference dependency, OQ-30, which is IC-2 rather than a gate condition and is now **partly satisfied** — the default palette and the whole token set exist in [`../design/`](../design/), and what is missing is the `nocturne` and `high-contrast` palettes plus the per-theme metadata *(corrected 2026-10-13: OQ-30 **closed 2026-09-04** with IC-2's discharge — all three palettes and their metadata exist in `packages/contracts/src/theme/themes.ts` and passed `pnpm theme-proof`, [`spikes/theme-proof.md`](spikes/theme-proof.md))*; twenty-two numbered spikes of which one is withdrawn, **eight discharged** and one discharged for Windows only — **twelve outstanding**, plus four sub-cases owed inside spikes that passed
- **Binding at build time:** [`implementation-conditions.md`](implementation-conditions.md) — obligations that are **not** gate conditions but **are** conditions on building the thing they name. Created 2026-09-02 by ruling GD-3, which checked rather than assumed that such a register existed and found it did not. **Six entries** after the Architecture Gate: **IC-1**, the corrected restore re-measured (**discharged**); **IC-2**, now bounding only `REQ-SHELL-128`'s three built-in themes, since the design language exists and is adopted and its original wording — *no screen is built before the approved visual design reference is available* — was **written on a false premise and corrected on 2026-09-03**; **IC-3**, the deferred Linux and macOS build hosts; and **IC-4 to IC-6**, added by the gate for the three defect closures that rest on argument rather than on measurement. An entry here binds the work it names and is removed only by the authority that set it. *Corrected 2026-10-13: the register holds **eight entries** now, and "six" was its count after the gate. IC-1, IC-2, IC-5 and IC-6 are discharged (IC-2 on 2026-09-04, leaving only the owner's multi-monitor drag); IC-7, adopted 2026-09-06, was discharged on 2026-09-27 with the pipeline's evidence owed; IC-4's rename half and IC-3 wait on the owner's hardware, and IC-8, raised 2026-09-15, has held on Linux and waits on a macOS host — each deferred under [R-071](../product/requests.md#r-071).*
- **Ruled on:** [`owner-decisions.md`](owner-decisions.md) — ESC-1 to ESC-22, ESC-24 and ESC-26 to ESC-31, and nine structural rulings, SR-1 to SR-9. ESC-19, ESC-20 and ESC-21 were ruled on 2026-09-01 by **comparison with seven other coding harnesses** rather than from first principles — that comparison, with its sources, is in `owner-decisions.md` and is evidence, not illustration. **ESC-26 was ruled on 2026-09-01 and has landed in the specification**: `REQ-SESSION-197` gains one narrow exception, bound by five conditions, available only inside `REQ-SESSION-201`'s restore. ESC-23 and ESC-25 needed no ruling in the end: the amendment answered both, and answered ESC-25 *against* what this record had argued. ***No escalation is open.*** The seven that were — ESC-22, ESC-24 and ESC-27 to ESC-31 — were **ruled together on 2026-09-02** and all seven have landed in requirements. Read SR-4's own correction block before citing SR-4: an earlier version of that ruling claimed the store dissolves OQ-41 and it does not (ESC-14) — **cite the corrected form, never the withdrawn one**. Two rulings carried a *reason* a measurement disproved — **ESC-15**'s stated mechanism and **SR-7**'s statement of how the artifact is identified. **Both were corrected in place on 2026-09-02 by ruling GD-2, with the conclusions unchanged**, and each now carries a dated correction block giving what was measured against what was claimed; cite the corrected form. The four decisions the Architecture Gate verdict left with the owner were **all ruled on 2026-09-02 as GD-1 to GD-4**, and nothing in this record now waits on a person. **The gate itself closed on 2026-09-03**, and its five rulings are **GD-6 to GD-10**.

This document describes the system one Electron desktop application makes: what its parts are, which
process each runs in, how they talk, where state lives, and what happens end to end when a user starts a
run. It is written to be the thing an implementer reads first. Every claim in it is a decision recorded
in `adr/` and traceable to requirements in `constraints.md`, to a ruling in `owner-decisions.md`, or to a
measurement in `spikes/`.

The product is a single graphical application. There is no command-line entry point, no terminal user
interface, and no embedding or programmatic surface through which code the user did not launch can start
or drive a run (`REQ-STARTUP-002`, `REQ-STARTUP-015`, `REQ-EVENTS-178`). It does run programs on the
user's behalf, and a great deal of the architecture exists to make that accountable.

---

## Parts

Since 2026-10-26 the rest of this document is in [`README/`](README/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](README/01-1-the-shape-of-the-system.md) | 1. The shape of the system |
| [02](README/02-2-what-travels-between-them.md) | 2. What travels between them; What the measurement changed here |
| [03](README/03-3-where-state-lives.md) | 3. Where state lives; The store is machine-local, and it is found by an identifier rather than by a path; The cost of that location is now owned, by two requirements and one action; The table; What a user can still read for themselves |
| [04](README/04-the-document-primitive-three-write-shapes-and.md) | The document primitive: three write shapes, and one ladder; Two things the measurement corrected here, and they matter for the reason; One store per workspace is one corruption domain, and it now has a backup |
| [05](README/05-4-how-a-run-flows-end-to-end.md) | 4. How a run flows, end to end — §10.7 |
| [06](README/06-4-how-a-run-flows-end-to-end-2.md) | 4. How a run flows, end to end *(continued, from "The restore stops the store for both holding processes while the application keeps running")* |
| [07](README/07-5-the-disciplines-that-hold-it-together.md) | 5. The disciplines that hold it together |
| [08](README/08-6-what-this-record-does-not-settle-and-the.md) | 6. What this record does not settle, and the Architecture Gate verdict; The escalations: twenty-nine ruled, two answered by amendment, NONE open; THE GATE VERDICT |
| [09](README/09-a-defects-things-that-are-wrong-now-that-no.md) | A. DEFECTS — things that are wrong now, that no measurement will fix, and that a builder would inherit |
| [10](README/10-b-measurements-still-owed-and-whether-any-of.md) | B. MEASUREMENTS STILL OWED — and whether any of them is a gate condition; C. BUILD-HOST OBLIGATIONS — which nobody closes by reasoning; D. OWNER DECISIONS OUTSTANDING — ALL FOUR RULED 2026-09-02; THE FOUR-FOR-FOUR FINDING — stated in the verdict rather than in a footnote |
| [11](README/11-the-verdict.md) | The verdict; The open questions |
| [12](README/12-the-measurements.md) | The measurements |
| [13](README/13-7-index-of-decisions.md) | 7. Index of decisions |
