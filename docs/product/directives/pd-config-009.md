[Product directives](../directives.md) › PD-CONFIG-009

<a id="pd-config-009"></a>

### PD-CONFIG-009 — the providers card draws one filled control, the add-endpoint action in its head

The providers card of the Models category (REQ-CONFIG-329) MUST draw exactly one filled control, the add-endpoint action in its head, in every state of the provider list: no row, any number of rows, and any row's settings open.

A provider row's actions MUST NOT be drawn filled. The row's primary action is Quick Start where REQ-CONFIG-371 renders one, and Authenticate or Re-authenticate otherwise. It MUST stand first in the row's action row and MUST be drawn as a hairline control, whether or not credentials are stored; its label and its accessible name stay REQ-CONFIG-372's. The row's other actions keep their order and are drawn as a hairline, as bare text or as a link. A row's settings (REQ-PROVIDER-141) MUST draw Save first among their actions and as a hairline. The empty state of REQ-CONFIG-388 MAY keep an add-endpoint control of its own, drawn as a hairline.

The save bar's Save (REQ-CONFIG-270) is not this directive's. It is drawn filled while unsaved changes stand, on every category, and this directive counts the category's body.

**Why, and what it costs.** The design language allows a view one filled control ([§1.7](../../design/README/01-1-the-design-language.md), "One filled control": "so a dense screen carries exactly one accent surface"). Measured on the built application at `ab29f51b` (`pnpm app:drive`, 1400×900 and 1000×680): the Models category drew seven, "Add endpoint" and six "Authenticate"; each row's open settings added a filled Save (read in the source). The independent critique of 2026-11-11 filed it as UIR-307, high ([the Settings brief](../../design/briefs/settings.md)); the critique of 2026-11-10 had filed the same as UIR-001.

REQ-CONFIG-371 names a row's primary action once, Quick Start, and says nothing of a fill. The fill on Authenticate came from the mockup, whose list holds four providers of which one is unauthenticated, so it draws one fill. The product's list holds every provider REQ-PROVIDER-140 lists ([`PD-CONFIG-002`](pd-config-002.md#pd-config-002)), so before the first sign-in every row is unauthenticated and the mockup's rule yields a fill per row. A row's rank is therefore drawn by its place, first in the row, and the accent is given to one control.

That control is the add-endpoint action because it is the only action the card has in every state, and because it opens both paths a person comes here for: registering an endpoint, and authenticating a built-in provider (REQ-CONFIG-378).

What it costs:

- On first use, a person who wants a built-in provider needs that row's Authenticate, and it no longer carries the accent. The accent stands on a control labelled "Add endpoint", whose dialog offers the built-in providers too but whose label does not say so.
- A row with stored credentials and a row without differ by label, status word and indicator, and no longer by the button's variant.
- In a row's settings, Save is told from Validate and Check health by its place alone.
- While unsaved changes stand, the save bar's Save is filled as well, so two fills stand on the view. The same holds on Project and on MCP Servers. Which of the two yields is not decided here.

**Considered, and not taken.**

- *No fill in the card, the head's action a hairline as the mockup draws its "Check status".* It would hold the rule in the unsaved state as well. Not taken: the Overview's empty state sends a first-time user here to do one thing, and the view would offer twenty controls of one weight with nothing saying where to start.
- *The fill on one row: the first unauthenticated one, or the recommended one.* The list is ordered by identifier (REQ-PROVIDER-140), so the first row is an accident of spelling; the recommended provider is unavailable in this build (its status reads "Coming soon").
- *The head's fill yielding while the save bar's Save stands.* It would make Models the one category whose body answers to the frame. A rule for the frame against a body belongs to all thirteen categories, and is left for a ruling there.

Also built with it, and covered rather than decided: the row's action cell is a table cell, so the row's rule is one line and no label in the row breaks at 1000×680 (UIR-308 and UIR-309 of the same critique; REQ-CONFIG-367, REQ-SHELL-022). And a press of Authenticate on a provider that signs in with a stored key opens the row's settings, where its answer is stated (REQ-PROVIDER-050 states that answer for DeepSeek): with the settings closed the press changed nothing on screen ([the note](../../archive/defects/a-key-providers-authenticate-changes-nothing-on-screen-while-its-settings-are-closed.md)).

> **Extends:** REQ-CONFIG-329, REQ-CONFIG-371, REQ-PROVIDER-141

Nothing the three state is displaced: the card, its rows, each action's presence and enablement, and the settings' five actions stand as written. The directive adds how their rank is drawn. REQ-CONFIG-367, REQ-CONFIG-372, REQ-CONFIG-378, REQ-CONFIG-388 and REQ-PROVIDER-140 govern in full.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's standing delegation [R-098](../requests.md#r-098), which the owner authorised on 2026-11-11; logged as [R-099](../requests.md#r-099), the owner's request of the same day to take up the open critique findings ("das ist deine entscheidung"). Read against an independent critique of the built change, recorded in [the Settings brief](../../design/briefs/settings.md). The owner did not word this directive.*
