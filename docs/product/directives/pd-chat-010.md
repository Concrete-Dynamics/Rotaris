[Product directives](../directives.md) › PD-CHAT-010

<a id="pd-chat-010"></a>

### PD-CHAT-010 — the transcript's tool-rendering verbosity is one slider with five ordered stops

Settings › Display › Transcript SHALL hold one slider, **Timeline detail**, with five evenly spaced ordered stops. Only
its two ends carry a word of their own — **Compact** and **Expanded**; the selected stop's name is stated as the
slider's value, so the three interior stops are readable as they are chosen. The stops govern what the transcript draws
of **tool calls only**: prompt and answer messages are drawn at every stop, and REQ-CHAT-167's reasoning control is
independent of the slider and keeps its own preference.

The stops, in order, MUST be:

1. **Compact** — grouping on, and every tool row drawn as a row collapsed to its name and chevron with **no `⤷` preview
   on any unopened row**, the most recent pair included. The activity line's in-flight statement (REQ-CHAT-065) is
   untouched.
2. **Brief** — exactly REQ-CHAT-067 and [`PD-CHAT-004`](pd-chat-004.md#pd-chat-004) as they read before this directive:
   grouping on, and all but the most recent tool-call/result pair collapsed to name and chevron, the most recent pair
   keeping REQ-CHAT-061's preview.
3. **Standard**, the default — grouping on and auto-collapse off: today's default pair, so nothing on screen changes.
4. **Detailed** — grouping off: no run folds into an activity line and every tool row is drawn as its own row, collapsed
   with its `⤷` preview.
5. **Expanded** — grouping off, and every tool row that has something to reveal is drawn already open, exactly as a row
   the reader opened is drawn by REQ-CHAT-061; what the open card contains is governed by REQ-CHAT-061 and
   REQ-CHAT-166 as it already is.

A move MUST take effect immediately on the rows already on screen and MUST NOT move the reader's position
(REQ-CHAT-071). A row the user has expanded or collapsed by hand keeps the state the user gave it, overriding the stop
for that row until its expansion state is reset (REQ-CHAT-059).

The stop is a desktop preference, stored under the registered key `display/toolVerbosity` as an integer from **1**
(Compact) to **5** (Expanded), defaulting to **3** (Standard). It is written user-wide the moment it moves like every
desktop preference (REQ-CONFIG-405), needs no Save, and Discard does not undo it; restoring it into the control emits
no change (REQ-CONFIG-419). The slider **replaces** `display/autoCollapseTools` and `display/groupToolCalls`, which are
retired from the store's key set and never written again. Where the new key is absent and either retired key is present,
the stop is read from the pair once and nothing is written back: grouping off → **Detailed**; grouping on with
auto-collapse on → **Brief**; grouping on with auto-collapse off → **Standard**. The retired keys are never rewritten or
removed, and a `display/toolVerbosity` value that is absent, unreadable or not an integer from 1 to 5 reads as
**Standard**.

**Why, and what it costs.** Two independent booleans described the mechanisms and not what a reader wants: "how much of
a tool call do I want to see" is one axis, and its ends — nothing but the call's name, everything open — were not
reachable by any setting of the pair. The five stops order the existing two mechanisms and add those two ends, with the
middle stop left as the product's default so that a reader who never touches the slider sees no change. What it costs:
one combination of the retired pair, grouping off with auto-collapse on, has no stop and lands **Detailed** — the rows
stay individual and regain the previews auto-collapse had removed. It is the only combination the slider cannot
reproduce, and it is the direction that shows more rather than less. The four REQ-CHAT-166 content controls stay a
separate workspace setting, so **Expanded** says what is open and not how many lines an open card draws.

**Recorded, not built.** On 2026-10-19 the surface still draws the two switches; nothing in this entry describes the
built product. The change owes its first execution, and this entry's own readings are owed with it.

*Revision 2, 2026-10-24 ([R-085](../requests.md#r-085)): stops 1 and 2 say a tool row is "collapsed to its name and
chevron". `REQ-CHAT-175` – `REQ-CHAT-177` make the row's header the call's derived description at every stop, so read
"name" there as that description — the tool's own name only where the build derives none. The stop still governs
grouping, the `⤷` preview and openness; on a tool row it draws it never hides, shortens or replaces the description,
and Compact is the stop this reading matters most at, since it is the one that draws the least. A run the stop folds
into an activity line draws no tool row; its members' descriptions are drawn when the run is opened.*

> **Narrows:** REQ-CHAT-061, REQ-CHAT-067, REQ-CONFIG-403, REQ-CONFIG-405, REQ-SHELL-006
> **Extends:** REQ-CHAT-061

*Raised by the owner, 2026-10-19; logged as [R-076](../requests.md#r-076).*
