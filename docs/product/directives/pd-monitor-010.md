[Product directives](../directives.md) › PD-MONITOR-010

<a id="pd-monitor-010"></a>

### PD-MONITOR-010 — the Overview's figures stand in one ruled band, and its regions are sections on the ground

1. **The figures.** The Overview's four figures — Tokens, Tool calls, Repository, Agents (REQ-MONITOR-166 to REQ-MONITOR-169) — stand side by side in one band bounded by a hairline above and below, each divided from the next by a hairline. Each keeps its heading, its figure, its captions and every string those requirements give it. Below a window width of 1080 px the band is two figures wide and two deep.
2. **The regions.** Every other region of the view — Agent activity, Sessions, the delegation graph, Cloud credit, Subscription limits, Improvement proposals — is a section: a hairline above it, its heading, its content, drawn on the view's ground with no fill, no border around it and no rounded corner. The two columns, their order, the divider between them and its bounds stand as REQ-MONITOR-165 and [`PD-MONITOR-009`](pd-monitor-009.md#pd-monitor-009) state them.
3. **The sessions section stays.** The Overview keeps its sessions section with everything REQ-MONITOR-171 and REQ-MONITOR-172 give a row. The sidebar's sessions list ([`PD-SHELL-016`](pd-shell-016.md#pd-shell-016) clause 3) switches; this section accounts: it is where a session's branch, tokens, duration and detail are read, and where "Continue run" stands.
4. **The agent table's give-way.** In the one-line form the Activity column takes the width the other columns leave and elides; the three-line form of `PD-MONITOR-009` clause 3 begins where that directive put it.

**Why, and what it costs.** On the built application at `2fb19824` the Overview at 1440×900 drew nine filled, bordered, rounded boxes of three sizes, and its four figures were four of them: the box said "these are four things" about four numbers that are read as one line. A box is this language's sign that a thing floats or takes input, and nothing on this view does either. What a user gains: the figures read as one row and the regions as a page, with the rules carrying the structure the boxes repeated. What it costs: a figure no longer has its own surface to carry a state colour as a fill, which none did; and the wording "card" in REQ-MONITOR-165 to REQ-MONITOR-173 now names a region that is not drawn as one.

> **Narrows:** REQ-MONITOR-165, REQ-MONITOR-173

Its case on both is the presentation of a region as a "card" or "tile", and is disjoint from [`PD-MONITOR-009`](pd-monitor-009.md#pd-monitor-009)'s case on REQ-MONITOR-173, which is the tiles' order and the delegation graph's place.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's request [R-101](../requests.md#r-101) of 2026-11-14 and the standing delegation [R-098](../requests.md#r-098). The owner authorised that the model decides and did not word this directive.*
