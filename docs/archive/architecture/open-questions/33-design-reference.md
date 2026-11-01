# Archived open questions — Design-reference dependencies

The ruled, closed, resolved and withdrawn entries of [part 33](../../../architecture/open-questions/33-design-reference.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-30"></a>

**OQ-30 — Theme palettes and token values. CLOSED 2026-09-04 by the IC-2 implementation and rendered-pixel
proof.** *(ADR-0050; `spikes/theme-proof.md`.)* `REQ-SHELL-129` fixes the default theme's shell
metrics and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey,
**but the palettes themselves are not specified anywhere in `docs/spec/`**. They come from the design
reference. ADR-0050's mechanism — themes as data, corrections computed, contrast asserted from rendered
pixels — is independent of the values. Nocturne now lowers every ground stop in the adopted hue system;
High Contrast uses near-black grounds, near-white text and strengthened boundaries. Those authored values
remain owner-replaceable through the same mechanism. All six acceptance items passed from built-app pixels in
three themes at five scale factors, and the two named counterfactuals failed at their asserted item.

<a id="oq-31"></a>

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
