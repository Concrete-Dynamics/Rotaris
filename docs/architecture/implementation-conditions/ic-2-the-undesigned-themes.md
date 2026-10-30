# IC-2 — the two undesigned themes, and what a screen may not be drawn without

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

> **DISCHARGED 2026-09-04.** `spikes/theme-proof.md` records the built token data, the live preference and
> native-theme path, and fifteen rendered-pixel runs: all three themes at scale factors 1, 1.25, 1.5, 1.75
> and 2. Every run passed contrast, native-surface mapping, inset focus indication, vector-icon scaling,
> the 9 px “Requirements” label fit and theme completeness across a switch. Both counterfactuals exited
> non-zero at their named item. One active display was attached, so the different-scale multi-monitor drag
> remains the owner measurement; macOS and Linux remain IC-3. **The condition is met and this entry remains
> as evidence of both its original false breadth and its narrow discharged remainder.**

> **CORRECTED AND LARGELY DISCHARGED 2026-09-03.** This entry was written as *"no screen is built before
> the approved visual design reference is available"*, on the belief that the reference did not exist.
> **It does exist, it is in this repository, and it has since 2026-09-01** — `docs/design/`, imported as
> commit `1ad8fee`, carrying the tokens, the type ramp, spacing, radii, elevation, motion, iconography,
> the motif, the copy voice, **27 components** each with a `.jsx`, a `.d.ts` and a `.prompt.md`, twenty
> specimen cards, the self-hosted fonts and the mark, plus a visual mockup. The gate was decided while
> this entry said the opposite. **The error was the manager's and it was corrected the day the owner
> pointed at it.** What was actually missing is much narrower and is stated below.

**Set by:** GD-1, 2026-09-02. **Corrected:** 2026-09-03. **Binds:** the theme mechanism's built-in theme
set, and the drawing of any view. **Discharged by:** the two remaining palettes and the theme metadata
existing, and OQ-30 closing against them.

**What is available and adopted, so nothing waits on it.** `docs/design/README.md` section 2 states the
adoption rule and it is not this file's to restate: **the design language is adopted and authoritative;
the information architecture is not.** Tokens, colour, typography, spacing, radii, elevation, motion, the
component inventory and each component's visual specification, the iconography rules, the motif and the
copy voice are all present, all approved, and all citable by name. **Token names are normative — a screen
cites the token, never a literal colour or pixel value.**

**What a screen's structure comes from, which is not the design.** `docs/spec/` governs which screens
exist, what is on them, how they are grouped, what they are called, what order they appear in and which
tabs they carry — `REQ-SHELL-023` is the single definition of the seven primary views. The design
material's own screen structure was derived outside the clean-room process that produced the
specification, so it is read for craft and never for structure. **Where they disagree the specification
governs, without exception.** Consequently the per-view gaps listed in `docs/design/README.md` §3.2 —
Mission, the Overview body, the Git structure, ten of thirteen Settings categories, the Library tab set,
the auxiliary windows, the shell chrome, the modal surfaces — are **drawing work against an adopted
language and a settled structure**, not material anybody is waiting on. They are a backlog, and a backlog
is not a condition.

**What actually remains, and it is values only the design can supply.**

1. **Two of the three built-in themes have no palette.** `REQ-SHELL-128` fixes the set and the order —
   `rotaris-dim` (default), `nocturne`, `high-contrast` — and the imported language is **one palette**.
   `nocturne` and `high-contrast` are undesigned.
2. **The token set carries no theme metadata.** `REQ-SHELL-129` requires a light/dark flag and seven token
   groups per theme; `REQ-SHELL-133` requires a display label and a one-line description per theme. None
   of the three is declared.
3. **There is no native-surface mapping.** `REQ-SHELL-130` and `REQ-SHELL-160(b)` require native dialogs,
   menus, the text caret and disabled text to follow the theme on every supported platform, and the token
   set says nothing about them.

**What is explicitly not blocked, and this is most of it.** ADR-0050's theme mechanism — themes as data,
corrections computed, contrast asserted from rendered pixels — is independent of which values are present
and was always buildable. So is every component, against the tokens that exist. So is the shell, the rail,
the seven views' structure and each view's contents, all of which the specification fixes. **A view may be
built now against `rotaris-dim` and the adopted language; what it may not do is claim `REQ-SHELL-128`'s
three-theme obligation is met.**

**What must be shown to discharge the remainder.** The two palettes and the metadata exist as token data,
and the six acceptance items in `docs/design/README.md` §5 pass **from rendered pixels on a real display**
rather than from token arithmetic — contrast, native surfaces, focus indication, icon scaling across five
OS scale factors, the rail label fit for "Requirements" at 9 px in every theme, and theme completeness
across a switch. OQ-30 closes against that.

**What this correction cost, and why it is written here rather than fixed silently.** For one day this
register told every reader that no screen could be built and that the material was missing. It was the
broadest block in the record and it was false. It is kept, with its original wording quoted, under the
same rule as every other correction in this record: **a claim that was load-bearing and wrong is more
useful visible than deleted.** It is also the first defect found in this record by the owner rather than
by a measurement.
