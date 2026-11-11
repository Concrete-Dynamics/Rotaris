[Product directives](../directives.md) › PD-CONFIG-008

<a id="pd-config-008"></a>

### PD-CONFIG-008 — the Settings category list stands under four headings

The Settings category list MUST present the thirteen categories in REQ-CONFIG-268's order, which this directive does not change, under four headings:

| Heading | Categories under it, in order |
|---|---|
| Agents | Models, Personas, Runtime |
| Application | Interface, Display |
| Extensions | Skills, Instructions, Hooks, MCP Servers, Plugins, Tools |
| Project and about | Project, About |

A heading is text. It MUST NOT be a control, MUST take no focus and MUST NOT be selectable; its group MUST be exposed to assistive technology as a group named by the heading; and no heading MUST repeat the label of a sole category under it. Keyboard movement through the list is REQ-SHELL-153's and MUST pass from the last category of one group to the first of the next as though no heading stood between them: Arrow Up, Arrow Down, Home and End move focus without changing the selection, Home reaching Models and End reaching About. Every category keeps its label, its identifier (REQ-CONFIG-269), its place, its content and the way its changes are committed. Where the list is taller than the view, it scrolls on its own axis and the category's body keeps its place.

**Why, and what it costs.** Decision D3 of [the information-architecture map](../../design/information-architecture.md). Measured on the built application at `880a08a9` (`pnpm app:drive`, 1400×900): the list was thirteen rows on one rhythm with no heading and no gap, and finding a category was a read of up to thirteen labels. Four headings, each naming what its categories configure, make it a read of four words and then at most six labels, and they make the list's order legible: who does the work and within which bounds, how this window presents it, what a run is given, and the two pages that configure nothing (REQ-CONFIG-268's own last sentence sets Project and About apart from "the configuration categories").

What it costs: the list is taller by four headings and three gaps (measured after building at 1000×680: 563 px of list in a 570 px column, 7 px to spare, so with a notice standing above the view the list scrolls); the fourth heading names its two members, because they share no better word, where the other three name a subject; and the order still places "Application" between two groups that describe a run. That last cost is the price of a refusal.

**Proposed, and refused by this round's own critique.** The first draft moved Interface, Display and About into one "Application" group at the foot of the list and gave Project a group of its own. It is not decided: a heading would have repeated the label of its only member; REQ-CONFIG-268's second sentence would have stopped being true; and the new order was an expert's grouping with no usage data behind it, which is the ground on which the same map refuses to change the Library's default tab. The order stands as the specification has it.

Also built with it, and covered rather than decided: REQ-SHELL-153's keyboard movement, which the list did not have before this change (`docs/archive/defects/`, the note on the Settings list's arrow keys).

> **Extends:** REQ-CONFIG-268

Nothing REQ-CONFIG-268 states is displaced: the thirteen categories, their labels and their order stand as written, and the headings are added beside them. REQ-CONFIG-269, REQ-CONFIG-271, REQ-CONFIG-405, REQ-CONFIG-459, REQ-SHELL-152 and REQ-SHELL-153 govern in full.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's standing delegation [R-098](../requests.md#r-098), which the owner authorised on 2026-11-11; decision D3 of [the information-architecture map](../../design/information-architecture.md), written the same day and read against an independent critique recorded there. The owner did not word this directive.*
