[Product directives](../directives.md) › PD-CONFIG-004

<a id="pd-config-004"></a>

### PD-CONFIG-004 — the Display category's Transcript heading holds the tool-verbosity slider and the reasoning switch

*Revision 2 (2026-10-19, [R-076](../requests.md#r-076)) — **the tool-verbosity slider replaces the two
REQ-CONFIG-403 switches**, in the first paragraph below; revision 1's clause quoted beside it.*

Settings › Display › Transcript SHALL hold two controls. The first is [`PD-CHAT-010`](pd-chat-010.md#pd-chat-010)'s
five-stop **Timeline detail** slider, in place of the two switches revision 1 placed here. The second is REQ-CHAT-167's
**Show reasoning bodies** (`display/showReasoning`, default off), whose hint says that reasoning rows open to show their
text, that off each shows only its summary line, and that a row the user opened or closed keeps that choice
(REQ-CHAT-059). It is wired to the stored preference and to the live re-render notification, and commits like the
slider: it is written user-wide the moment it moves (REQ-CONFIG-405), needs no Save, and Discard does not undo it. The
heading's sentence states that policy for both. REQ-CONFIG-472's four tool-row controls and their Save policy are
unchanged.

**Why, and what it costs.** REQ-CHAT-167 requires the reasoning switch to be reachable from the settings surface and names
no category; Display is where its namespace (`display/`), its commit policy and the rows it governs already are. The
slider's own reason and cost are [`PD-CHAT-010`](pd-chat-010.md#pd-chat-010)'s. Revision 2 costs revision 1's independent
pair: grouping and auto-collapse were two switches a reader could set apart, and they are now one position on one
slider; the one combination that does not survive is named in that directive.

> **Revision 1 said, and no longer governs:** "Settings › Display › Transcript SHALL hold three switches. The first two
> are REQ-CONFIG-403's, in its order: **Auto-collapse older tool outputs**, then **Group consecutive tool calls**." The
> rest of revision 1's paragraph — the reasoning switch's key, hint, wiring and commit policy, and REQ-CONFIG-472's
> unchanged controls — still governs, with the switch now the second control rather than the third.

**As built.** `packages/ui/src/settings/DisplaySettings.tsx` (the `show-reasoning` Toggle, third under the Transcript heading
at the time, whose sentence reads "These three are yours, not this workspace's"); `packages/ui/src/commands/search-and-reasoning.test.ts`;
`pnpm settings-proof`. Built 2026-10-13 by fin41 (N71) before the ruling, under the reading OQ-264 recorded; the ruling
confirmed it, so no code changed with this directive. **On 2026-10-19 the slider of revision 2 and
[`PD-CHAT-010`](pd-chat-010.md#pd-chat-010) is recorded and not built**: the surface still draws the two switches and the
heading's three-control sentence. The change that builds it owes this paragraph the surface as it then is.

> **The live re-render notification across windows, 2026-10-14 (fin43), reported here in place:** "wired … to the live
> re-render notification" held for the window that moved the switch only; a persona window already open kept the value it
> booted with ([`an-open-persona-window-keeps-the-display-preferences-it-booted-with`](../../defects/fixed/an-open-persona-window-keeps-the-display-preferences-it-booted-with.md)).
> Main now announces each of the three switches' preferences it stores to every live window on channel 14,
> `display:changed`, and every window folds it into its display store. `palette-proof`'s stage 7
> (`persona-follows-display`) read a persona window's reasoning row `aria-expanded="false"` before the main window's
> "Toggle reasoning bodies" and `"true"` after it; against a build without the announcement it stayed `"false"`. The two
> REQ-CONFIG-403 switches ride the same path and are unit-tested only (`apps/desktop/src/main/commands/shell.test.ts`).

> **Extends:** REQ-CONFIG-403, REQ-CHAT-167

*Raised 2026-10-13 by the ruling of [OQ-264](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-264) under the owner's delegation
([R-072](../requests.md#r-072)).*
