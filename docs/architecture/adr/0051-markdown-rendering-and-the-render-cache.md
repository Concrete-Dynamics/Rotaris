# ADR-0051 — Markdown rendering and the bounded render cache

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-14)
- **Depends on:** ADR-0044, ADR-0045, ADR-0046

## Context

`REQ-CHAT-056`, `REQ-CHAT-075` and `REQ-CHAT-076`: rendering must be **synchronous**, must issue **no
network request**, and must render mid-stream incomplete Markdown without error and without altering
neighbouring rows. Text selection must select exactly the characters the pointer covers **in every row
category, including rendered-Markdown bodies**. Bare URLs — not only Markdown links — are activatable,
with trailing punctuation excluded. `REQ-CHAT-056` enumerates the treatments: fenced code in a monospace
face on its own shaded background, bold heavier, italic slanted, inline code monospace, links in a
distinct colour.

`REQ-CHAT-058`: a rendering is reused **only while identity, content, laid-out width and expansion state
are all unchanged**; live rows — a running tool, verifier or group, streaming reasoning — are redrawn
every repaint and never reused; a theme switch redraws every row and preserves every expansion state.

`REQ-UIBENCH-063` and `REQ-UIBENCH-086`: the rendered-body cache has an **observable capacity** — 256
entries and two million characters, where characters count the **source** text an item was rendered
from, with hits and misses as running totals over the life of the process.
`docs/spec/resolutions/21-ui-performance-benchmark.md` row 24 records both deliberately: the source-text
count is what makes occupancy comparable with its maximum "whatever the rendered form costs", and the
totals are neither per-phase nor per-iteration figures — a consumer wanting a per-phase delta subtracts.

`REQ-NOTIFY-243`: streaming Markdown renders partial input as readable text and **resolves to the
correct final rendering** once the remainder arrives.

`REQ-UIBENCH-083`: the structural counters must be byte-identical across iterations in fresh processes.

## Alternatives considered

**A — A Markdown-to-markup library plus direct injection, sanitised.**

*For:* fast, simple, one dependency, and the document model gives native text selection.
*Against:* it hands **model-authored text to a markup parser**. Sanitising is a mitigation, not a
guarantee, and the same content is also rendered in the persona window and copied to the clipboard. It
also makes the cache key awkward: a markup string can be cached, but reuse must still be gated on the
laid-out width because the rendering the specification talks about is *measured*, and a markup string is
not.

**B — Parse to an abstract syntax tree and render the tree to elements, caching the parsed tree.** No
markup string is ever produced and nothing is injected. Chosen.

*For:* **no injection surface at all**; the renderer emits only the element types we allow, which is
also how `REQ-CHAT-056`'s enumerated treatments become a closed list rather than a sanitiser's
allow-list. Selection stays native because the output is document elements. The cache holds parsed trees
keyed by source text, and the character count is naturally the count of **source** characters the
capacity requirement specifies. Parsing is synchronous and does no I/O.
*Against:* a tree-to-elements renderer is ours to write and to keep in step with whatever subset of
Markdown we support; a parser that produces a tree is slightly slower than one that streams straight to
a string.

**C — Pre-render bodies outside the renderer and ship rendered output over IPC.**

*For:* the renderer never parses; the cache is shared across windows.
*Against:* fails the reuse rule outright — reuse is gated on the **laid-out width**, which only the
renderer knows — and would put rendering on the far side of the boundary from the 200 ms budget. It also
moves the injection surface rather than removing it.

## Decision

**Alternative B.**

- **Two caches, not one, matching the two kinds the specification names.** A *parse* cache keyed by
  source text — this is the one the benchmark reports, with occupancy in entries and in source
  characters, bounded at 256 and two million, least-recently-used — and a *measurement* cache keyed by
  the full four-part key (identity, content, laid-out width, expansion state) holding the row's measured
  height. "Retained row renderings" maps to the parse cache plus element reuse; "retained row
  measurements" maps to the measurement cache. **Keying the parse cache on source text alone is what
  makes the reported character figure meaningful and comparable to its stated maximum.**
- **What a live row bypasses is *reuse*, not the parse cache.** `REQ-CHAT-058`'s rule is that a live row
  is redrawn on every repaint rather than reused, so a live row neither reads nor writes the
  **measurement** cache: it is measured afresh each repaint, which is what lets its elapsed time keep
  advancing. It still parses, and every parse goes through the **parse** cache. The distinction is not a
  nicety: a cache bypassed outright records neither a hit nor a miss, so a design in which live rows
  bypassed *both* caches would leave `hits` and `misses` flat for the whole of `streaming_updates`, and
  could not also be offered as the explanation for their growth there. They do grow, and the reason is in
  the phase's own definition rather than in the live row: `REQ-UIBENCH-057` re-applies **all previously
  completed events** at every streaming step alongside the truncated current one, so each step presents a
  wall of settled bodies whose source text is unchanged — hits — and one body whose source text is new —
  a miss. `REQ-UIBENCH-063` requires only that the totals never decrease, so the shape of that growth is
  ours to state honestly rather than to assert.
- **A live row reads the parse cache but does not insert into it**; its final text is inserted once the
  row settles, which is where `REQ-NOTIFY-243`'s "resolves to the correct final rendering" lands. Without
  that rule one streamed 100 kB message pushes some 400 distinct 256-character prefixes
  (`REQ-UIBENCH-057`) through a 256-entry cache and evicts every settled body in it, and `entries` and
  `chars` would then report churn rather than a working set. With it, `REQ-UIBENCH-086`'s bound holds for
  a reason rather than by eviction, and `misses` still climbs through the streaming phase.
- **Partial input is a first-class case, not an error path.** An unterminated fence, an unclosed emphasis
  run or a half-written link must render as readable text and must resolve to the correct final
  rendering when the remainder arrives. The parser must therefore be **tolerant by construction rather
  than by a catch**, and the benchmark's streaming phase exercises exactly this.
- **Links are elements that request an external open through the command channel**, never navigable
  anchors — the renderer is sandboxed and must not navigate. Bare URLs are linkified with trailing
  punctuation excluded, as a **post-parse text transform applied to text nodes only**, so it can never
  turn part of a code span into a link.
- **Determinism.** The parser and the linkifier must not depend on locale, on pattern-matching behaviour
  that varies with Unicode data versions we cannot pin, or on the iteration order of an object. The
  benchmark's forced locale will expose a locale dependency rather than hide it.
- **Copy uses the row's source text, not the rendered output**, and a group's copy yields the summary
  form, never raw tool input or output.

## Consequences accepted

1. **We own a Markdown subset and its renderer.** The supported subset must be written down, because
   `REQ-CHAT-056` enumerates treatments but not a grammar.
2. **The parse cache is a reported figure**, so changing its keying — or its insertion policy, which the
   live-row rule above fixes — changes a benchmark output and must be treated as a behavioural change
   rather than an internal one.
3. Element counts inside a rendered body vary with content; ADR-0045 accounts that variance to the
   informational counter, and this decision must not undo that by allocating structural elements
   per body. **That accounting is itself blocked on OQ-28**: if the counting rule turns out to be the
   framework-neutral one the domain-21 resolution record states, the variance this renderer produces
   enters `widgets` and ADR-0045 does not survive. Nothing in *this* record changes under either
   reading — the parser, the caches and the linkifier are the same — but the element list it emits stops
   being free of consequence for the benchmark's invariant.

## Open question

**No requirement fixes which Markdown dialect is rendered.** `REQ-CHAT-056` names five treatments and
requires links to be activatable; nothing says whether tables, task lists, block quotes, headings or
images are supported. This needs answering — probably by the design reference, since it is as much a
visual question as a functional one — before the renderer's element list is fixed. **Images in
particular interact with the no-network-request rule.** See OQ-31.

**Closed by the specification, 2026-09-07 (Part Y).** `REQ-CHAT-056` now says "The dialect is fixed, and is
fixed here" and enumerates it: beyond the five treatments, headings, block quotes, ordered and unordered
lists, task lists, tables, thematic breaks and strikethrough; a bare URL is a link on the same terms as an
authored one; **raw HTML is shown as the text it is** and never rendered as markup; and **no image is ever
loaded** — an image reference renders as its alternative text carrying an activatable reference, whether it
names a remote location or one on this machine. The question is answered as written, and the renderer's
element list is fixed to it. It also answers itself in this record's favour: a subset that must never render
markup is what alternative B gives for nothing, because no node type in the tree can carry any.

## First execution (Part Y, 2026-09-07) — `packages/ui/src/markdown/`

Built as decided. `parse.ts` produces a tree, `Markdown.tsx` renders that tree to elements, `cache.ts` holds
the parse cache keyed on source text at 256 entries and two million source characters with running hit and
miss totals. No markup string is produced anywhere, and no code path could produce one. The first consumer is
the artifact inspector's Preview tab (`REQ-LIBRARY-132`, re-rendered on every keystroke); the transcript
consumes the same module later, and nothing in the product renders Markdown a second way.

**What the execution found: no defect in this record's decision.** Parsing to a tree, rendering the tree to
elements, and keying the parse cache on source text alone all held under the first real consumer. Four things
are recorded beside that:

1. **The dialect question closed itself** (above). This record's first consequence — "the supported subset
   must be written down" — is discharged by `parse.ts`'s node types, where the six heading levels are spelled
   out one by one rather than computed into a tag name, so the element list is a closed literal set.
2. **Tolerance by construction rather than by a catch is a property of the inline parser's shape**: every
   delimiter that does not match falls through to a text node, so an unterminated fence, an unclosed emphasis
   run and a half-written link each render as readable text with no error path at all. Measured over the
   streaming cases in `markdown.test.ts`.
3. **The measurement cache is deliberately not built here.** It is keyed on the four-part key (identity,
   content, laid-out width, expansion state) and holds a row's measured height, which only the transcript
   has. This record's live-row rule — a live row reads the parse cache but does not insert into it — is
   implemented as `peek()` beside `parse()`, both counting, so the transcript applies the rule by choosing
   the call rather than by remembering it.
4. **Links are elements that request an external open through the command channel — and there is no such
   command yet.** `REQ-CHAT-076` fixes the opening, its acknowledgement and its failure report, which is the
   transcript part's to build. Until then the renderer takes an `onOpenLink` the caller may omit, and a link
   with no opener renders with its target as its title, inert rather than navigable. **Recorded as owed.**

## Revisit if

Parse cost at the 200 ms budget with many streaming rows proves too high, in which case the answer is
incremental parsing of the changed tail rather than moving the work.
