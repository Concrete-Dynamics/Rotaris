# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Seventh execution — 2026-09-11 (Part C″), the draft a load can beat

Part 8 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Seventh execution — 2026-09-11 (Part C″), the draft a load can beat

**Found — C2-1: a stored draft can be discarded by a load that beats it.** Returning to the Workspace view
remounts the composer, which reads the workspace's stored draft over a command round trip, while a prompt loaded
from the Library arrives two animation frames after the view switch (`loadIntoComposer` waits for the composer to
register). `REQ-CHAT-015` adopts a draft only into an EMPTY composer, so whichever arrives second loses: draft
first and the load appends after one blank line (`REQ-CHAT-044`); load first and the draft is dropped without a
word. Measured in `library-proof`'s `use` launch: **appended in three runs of four on one build and one schedule,
replaced in the fourth.** The proof now pins what holds in both branches and records which happened
(`results.use.draftRace`).

**Not repaired, and the reason is scope rather than difficulty.** The fix has to decide the ORDER rather than the
winner: the smallest shape is for the composer to remember that its current text arrived from an external load
rather than from typing and, when the draft then lands, to compose the two (draft first, one blank line) instead of
discarding it. That is a change to `packages/ui/src/WorkspaceView.tsx`'s draft adoption, which lane C's wave-3 row
does not own. Recorded here by the manager at merge 3, from Part C″'s handoff section 8, because the Part that
found it may not edit this record.

**Repaired — 2026-09-11, in the shape this note prescribed.** The paragraph above stands unaltered: its reason was
scope rather than difficulty, which is why it could be taken up unchanged by a pass that owned the file. The rule is
now a pure function, `adoptDraft(current, loaded, draft)`, exported from `packages/ui/src/WorkspaceView.tsx` beside
the `composeWithStashed` helper it reuses — the file's own precedent for a rule that must be checkable without a DOM,
and the right shape here because what failed was **an order**, which a renderer test pins badly and a pure function
pins exactly. The composer records, when an external load lands, whether it landed in an EMPTY composer; if it did,
a draft arriving afterwards is composed **before** it on `REQ-CHAT-044`'s one-blank-line terms instead of being
discarded. Text the user typed is still never composed over — that half of `REQ-CHAT-015` is unchanged and is what
the third case of the pure function states.

**What makes the repair checkable is that the two orders now produce the same string.** Draft first, the load
appends and the text reads `draft` + blank line + `loaded`; load first, the draft composes in and the text reads
the same. So `library-proof`'s two-branch reading — which this note asked for as a temporary measure, pinning what
held in both branches and recording which happened — **collapses to a single expected string**, and that assertion
fails if either half regresses: drop the draft and it reads the load alone, drop the append and it reads the load
alone too. The superseded two-branch comment is kept in the proof beside what replaced it.

**One reading of mine was corrected by the linter rather than by a test, and it is worth recording because it was a
design mistake and not a typo.** The marker was first written as a `useRef`, which `react-hooks/refs` refused: the
adoption runs **during render** — deliberately, as this component's "adjust state when a prop changes" pattern, so a
draft is adopted on the render that receives it rather than a paint later — and a ref read during render is exactly
what that rule exists to stop. It is `useState` now. The value is written from an event callback and read during
render, which is what state is for; the extra render batches with the text update in the same event.
