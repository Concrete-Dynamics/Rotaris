# The requirements area needs more than the supported minimum width on Windows

**Found:** 2026-08-18, by CI on PR #81 · **Severity:** Medium · **Platform:** Windows only
**Status:** Fixed 2026-08-18 — see [Resolution](#resolution-2026-08-18-the-cause-was-the-filter-bar-not-the-board)

## What happens

`apps/rotaris/AGENTS.md` documents a supported minimum window size of `1000×680`
"without clipping, overlap, or inaccessible actions". On `windows-latest` the
requirements area's own minimum size hint is **1052px** wide — 52px over that
budget — so at the supported minimum the area either clips or forces the window
wider than its stated minimum.

Measured by `controller.surface.minimumSizeHint().width()` with a
`RequirementsView` attached:

| Platform | Area minimum | Header row minimum |
| --- | --- | --- |
| Linux (`ubuntu-latest`, local) | 826px | 367–515px |
| Windows (`windows-latest`) | **1052px** | not measured |

The header row is not the cause: it needs 367–515px on Linux, and the area's
minimum does not move at all as the header's contents change. The width comes
from `RequirementsView` — the board itself.

> **That last sentence was wrong.** It is the *filter bar*, a different widget
> from the header row measured above. Corrected in the resolution below.

## Why it is not a regression

Surfaced by a test added in PR #81, which asserted the *area's* minimum against
1000px. That assertion was the wrong shape and has been narrowed to the header
row, which is what that test is actually about. The underlying width is
untouched by that PR: it adds no widget to `RequirementsView`, and the state
that failed is one where its single new control is hidden — and a hidden widget
is excluded from Qt layout sizing.

## Where to look

- `apps/rotaris/src/rotaris/views/requirements.py` — the board's own header
  carries six controls (Show filters, Search, Clear filters, Queue, Verify,
  Re-evaluate) plus the column area. `test_the_board_is_usable_at_the_supported_minimum_window_size`
  (`apps/rotaris/tests/test_requirements_board.py`) checks the view against the
  width it is *allocated*, which is why this never failed: at 1000×680 Qt gives
  the view whatever the enforced minimum turns out to be.
- The equivalent Windows measurement is not available locally — this needs
  either a Windows runner or a CI job that prints the numbers per platform.

## Suggested first step

Print `minimumSizeHint()` for `RequirementsView` and each of its header controls
on both platforms in CI, then decide whether the fix is eliding a control's
label, moving one into an overflow menu, or lowering the documented minimum.
Do not widen the assertion in `test_requirements_a11y.py` — it measures the
header row on purpose.

---

## Resolution (2026-08-18): the cause was the filter bar, not the board

**The board contributes nothing.** Its columns live in a `QScrollArea`, which is
what scroll areas are for — measured, `columns_scroll.minimumSizeHint()` is 68px
while the holder inside it wants 1992px.

The width came from the **filter bar** (`Requirement filters`) — eight controls
in one non-wrapping `QHBoxLayout`, whose minimum is therefore the *sum* of them:

| Control | Linux minimum |
| --- | --- |
| Search field | 150 |
| Sort / Group combos | 114 each |
| Filters · Clear · Queue · Verify · Re-evaluate | 80 each |

790px of bar, and the area's 826px followed from it. On Windows every one of
those five buttons carries a word, and Segoe UI pushes each past the 80px floor
Qt gives a button — which is the whole of the 1052px. Nothing about the board,
the cards or the columns is involved.

### Why a Linux-only suite could not see it

The suite asserted the view against the width it was *allocated*, so at 1000×680
Qt handed it whatever the enforced minimum turned out to be and the assertion
passed. Raising the font reproduces the same pressure on any platform: the old
bar wanted 790px at 9pt and 1088px at 28pt, so the defect was always reachable
locally — nobody had looked.

### The fix

`widgets/flow.py` adds a `FlowLayout`, and the bar uses it. A flowing bar's
minimum is its **widest single control** rather than the sum, so it wraps onto a
second line instead of pushing the window past the size the product supports.

| Font | Bar minimum, before | after |
| --- | --- | --- |
| 9pt | 790 | **150** |
| 20pt | 911 | **170** |
| 28pt | 1088 | **230** |

The requirements area's minimum falls from **826px to 487px** on Linux, which
leaves the Windows figure far inside the 1000px budget rather than 52px over it.
At normal window widths the bar renders exactly as before — one line, with the
search field still taking the leftover room.

Regression cover is three tests:

- `test_the_requirements_area_fits_the_supported_window_on_this_platform` — the
  claim itself, asserted at whatever font the runner actually uses. This is the
  one that fails on Windows when the defect is present, and the only number here
  that means the same thing on every platform.
- `test_the_filter_bar_wraps_rather_than_widening_the_window_in_a_wider_font` —
  a font ladder, asserting on the **bar**. A wider font is the same pressure as a
  wider platform font, so the defect became reproducible on any runner.
- `test_the_filter_bar_asks_for_its_widest_control_not_the_sum_of_them` — the
  structural property, stated against the sum rather than a recorded width.

All three were shown failing against three deliberate breaks: restoring the
`QHBoxLayout`, summing in `minimumSize`, and a layout that reports a small
minimum but then lays its controls out on one line anyway. That third one is
worth naming — it would replace an honestly-too-wide window with silent
clipping, which is worse — and the first version of these tests did not catch it.

### The first version of the guard was wrong, and Windows said so

It asserted the *area* against 1000 at every rung of the font ladder, and CI on
PR #84 failed it: **1031px at 14pt on Windows**. That is not this defect. The bar
assertion passed at every rung — the fix works — while the area failed because
the cards, columns and detail pane are text-sized and grow with the font whatever
the bar does.

Worth recording twice over. The measurement is the first real per-platform number
this report has had rather than one inferred from the Linux ratio; and a guard
that fails for a reason its own fix is not about is a guard that will be widened
or deleted by whoever meets it next. The area is now checked at the platform's
own font, which is the width the 1000×680 claim is actually about.

### What this does not fix

The area's minimum still grows with the font — 1007px at 24pt on Linux, 1031px at
14pt on Windows. The cards, columns and detail pane are all text-sized. That is a
different constraint from the one reported here, it is not platform-specific, and
no supported configuration reaches it. Recorded rather than fixed.
