[Product directives](../directives.md) › PD-CHAT-006

<a id="pd-chat-006"></a>

### PD-CHAT-006 — a row still being written draws no animated indicator of its own

A transcript row that is still being written SHALL NOT draw an animated indicator of its own. The
pulsing `…` an agent-message row — and every other row of a category that is neither a tool call nor
streamed reasoning — drew while live SHALL be removed, and SHALL NOT be replaced by another animated
or blinking mark. The row's own growth is what says it is being written.

**What is untouched, and why each survives.** This directive removes a mark that states nothing its
row does not already show. It does not remove a mark that carries a fact:

- REQ-CHAT-164's **stalled indicator** stands exactly as that requirement states it — at ten seconds
  with no provider output the live row states that the model is not producing output and shows the
  elapsed seconds, and reverts as soon as any further output arrives. What changes is only that it now
  appears where nothing was drawn rather than replacing an animation. A stall is not visible in the
  row's growth, which is precisely why it is drawn.
- A tool row's `◉ running…` (REQ-CHAT-060), a reasoning row's `◉ reasoning… <N>s · ~<T> tok`
  (REQ-CHAT-062) and the activity line's in-flight activity word (PD-CHAT-004) are **untouched,
  animation included**. Each names which call, which phase, or how long — facts that appear nowhere
  else on those rows, and on rows whose text does not grow as the answer arrives. Removing them was
  considered and refused for that reason; a later directive may take them, and would say so here.
- REQ-CHAT-063's refresh cadence is untouched. Live rows still repaint so their elapsed times advance;
  what a repaint draws is what this directive fixes.

**Why, and what it costs.** The owner read the built transcript and reported the mark as noise: it is
on screen for the whole of every answer, it blinks the entire time, and it restates what the arriving
text already shows. The specification is not wrong — an indicator that a row is live is a reasonable
thing to have drawn, and REQ-CHAT-164 needs a name for the form it replaces — but the owner wants the
transcript quieter. The cost is real and is at the start of an answer: a live message row that has
produced no text yet, and has not yet been streaming for ten seconds, now draws nothing at all. For up
to that long, a row exists with nothing in it, and a reader cannot tell a slow first token from an
empty row. That window is exactly the one REQ-CHAT-164's threshold was chosen to bound, so it closes
itself; it is stated here rather than discovered later.

> **Narrows:** REQ-CHAT-164

*Raised by the owner, 2026-09-15; logged as [R-028](../requests.md#r-028). Minted as `PD-CHAT-005`, which reached `main` first under another directive; renumbered under the rule the `R-016` collision settled, with not one word of what was asked changed.*
