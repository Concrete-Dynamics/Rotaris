# Open questions — Design-reference dependencies

Part 33 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-30, OQ-31.

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

**OQ-30 — Theme palettes and token values. CLOSED 2026-09-04 by the IC-2 implementation and rendered-pixel
proof.** *(ADR-0050; `spikes/theme-proof.md`.)* `REQ-SHELL-129` fixes the default theme's shell
metrics and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey,
**but the palettes themselves are not specified anywhere in `docs/spec/`**. They come from the design
reference. ADR-0050's mechanism — themes as data, corrections computed, contrast asserted from rendered
pixels — is independent of the values. Nocturne now lowers every ground stop in the adopted hue system;
High Contrast uses near-black grounds, near-white text and strengthened boundaries. Those authored values
remain owner-replaceable through the same mechanism. All six acceptance items passed from built-app pixels in
three themes at five scale factors, and the two named counterfactuals failed at their asserted item.

**OQ-31 — Which Markdown dialect is rendered. CLOSED 2026-09-02 by owner ruling GD-1, and closed without
the design reference.** *(ADR-0051.)* `REQ-CHAT-056` named five treatments and required links to be
activatable; nothing said whether tables, task lists, block quotes, headings or images were supported. The
entry recorded this as "as much a visual question as a functional one" and therefore blocked on the
reference. **That framing was wrong, and the reason it was wrong is worth keeping**: the supported element
list fixes what the transcript renderer accepts from model output, which makes it a question about the
renderer's surface rather than about appearance, and the entry's own last sentence — that images interact
with the no-network-request rule — was the evidence for that sitting in plain sight.

Ruled: **GitHub Flavored Markdown, less raw HTML, less image loading.** Headings, block quotes, ordered and
unordered lists, task lists, tables, thematic breaks and strikethrough render, alongside the five
treatments already fixed, and bare URLs are linkified on `REQ-CHAT-076`'s terms. Raw HTML in Markdown
source is shown as text and never rendered as markup. **No image is ever loaded from a Markdown image
reference** — it renders as its alternative text carrying an activatable reference — and this holds for a
local path exactly as for a remote URL, because a transcript that reads locations named by model output
discloses whatever those locations hold, and because the same clause that forbids the network request also
requires rendering to complete synchronously. `REQ-CHAT-056` now carries all of it. Images the user
attaches and image bodies the product holds are untouched: the ruling governs what Markdown *syntax* may
cause to be loaded.

**Also needed from the reference, and not otherwise blocked:**

- The information architecture inside each of the seven primary views. The record fixes that all seven
  are constructed at window creation and that only one is visible (ADR-0048), and that every list surface
  with unbounded content uses the recycler (ADR-0045); it fixes nothing about what is in them.
- The visual form of the benchmark card and the diagnostics view, both of which have specified content
  and specified budgets but no specified layout.
- The glyph vocabulary that `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

---
