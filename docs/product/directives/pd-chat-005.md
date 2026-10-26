[Product directives](../directives.md) › PD-CHAT-005

<a id="pd-chat-005"></a>

### PD-CHAT-005 — a row names its agent by colour, and a delegated agent's rows sit one step in

**The colour.** A transcript row's **role label** SHALL be drawn in its persona's assigned colour —
the same colour REQ-CHAT-057's continuation bar and PD-CHAT-004's expanded rail already take, so one
agent reads as one colour everywhere it appears. A row that names no persona — the reader's own row, a
system notice — SHALL keep the surface's accent and take no persona colour.

The assigned colours SHALL be taken from the **categorical set the adopted design language already
declares** for data whose values are names rather than magnitudes, in that set's own order, assigned by
a stable function of the persona's name. No persona colour SHALL be a **state** colour: a colour the
product uses to say `ok`, `running`, `waiting` or `failed` may not also say *who*, because the two would
then be indistinguishable on a row that carries both.

**The place.** A row belonging to an agent at depth *N* in the run's delegation tree
(REQ-MONITOR-036/037) SHALL be drawn indented *N* steps, one step being the design language's base
spacing step, with the run's own entry persona at depth 0. The indent SHALL move the row's columns and
SHALL NOT resize them: REQ-CHAT-057's 52 px timestamp column and 112 px role column are untouched, as
are its margins and its minimum height. That is why this directive **extends** that requirement rather
than narrowing it — every figure REQ-CHAT-057 fixes still holds on an indented row, and the indent is a
new fact drawn beside them. (`PD-CHAT-003` already narrows REQ-CHAT-057, and one requirement may be
narrowed by one directive only, so a second claim on it would have had to be settled rather than
declared; there is nothing to settle, because nothing here disagrees with it.) A surface that does
not know the delegation tree SHALL draw every row at depth 0, which is what every surface did before
this directive.

**Why, and what it costs.** The owner read a live two-agent transcript and reported that "agents can be
barely distinguished". They were not: the role label was drawn in one accent colour for every agent, the
persona colour reached only a 2 px continuation bar and an expanded rail, and nothing in the transcript
said which agent had delegated to which — that fact lived only in the Agents panel, which indents its
children. Two agents alternating therefore read as one column of identical labels.

The palette this replaces was six tokens of which `--rt-ok` and `--rt-run` are the **same** colour, so
six slots yielded five hues and one persona in six collided outright; and three of the six were state
colours, so a persona bar could be read as an outcome beside a row whose outcome it was not. The
language's categorical ramp is six distinct hues declared for exactly this purpose.

The costs are four. **Beyond six personas the hues repeat**, which is the ramp's own declared behaviour
and is not fixed here; two agents deep in one run may share a colour, and the label, the indent and the
task line still tell them apart. **An indented row's columns move with it**: the first evidence shows
a child's timestamp starting one step right of its parent's, so the time gutter reads as a stepped
column rather than one straight edge. The alternative — indenting from the role label and leaving
the times aligned — puts the step inside the row and breaks the block the row is, which is worse for
the fact being drawn. **Depth costs horizontal room**: a row at depth 2 gives up 32 px of
measure, and REQ-CHAT-057's columns do not shrink to pay for it, so a deep delegation narrows the text
rather than the gutter. **The transcript now depends on the delegation tree** to draw a row in its
place, where it depended on the row alone; a row whose agent the record does not yet name is drawn at
depth 0 and moves in when the record catches up.

> **Extends:** REQ-CHAT-057, REQ-CHAT-068, REQ-CHAT-069, REQ-SHELL-075

*Raised by the owner, 2026-09-16; logged as [R-025](../requests.md#r-025).*
