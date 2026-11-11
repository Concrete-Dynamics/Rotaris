[Product directives](../directives.md) › PD-CONFIG-009

<a id="pd-config-009"></a>

### PD-CONFIG-009 — the providers card draws one filled control, the add-endpoint action in its head

The providers card of the Models category (REQ-CONFIG-329) MUST draw exactly one filled control, the add-endpoint action in its head, in every state of the provider list: read in flight, no row, any number of rows, and any row's settings open.

A provider row's actions MUST NOT be drawn filled. The row's primary action is Quick Start where REQ-CONFIG-371 renders one, and Authenticate or Re-authenticate otherwise. It MUST stand first in the row's action row and MUST be drawn as a hairline control, whether or not credentials are stored; its label and its accessible name stay REQ-CONFIG-372's. The row's other actions keep their order and are drawn as a hairline, as bare text or as a link. A row's settings (REQ-PROVIDER-141) MUST draw Save first among their actions and as a hairline. The empty state of REQ-CONFIG-388 MUST NOT draw an add-endpoint control of its own; its sentence names the head's.

The save bar's Save (REQ-CONFIG-270) is not this directive's. It is drawn filled while unsaved changes stand, on every category, and this directive counts the category's body.

**Why, and what it costs.** The design language allows a view one filled control ([§1.7](../../design/README/01-1-the-design-language.md), "One filled control": "so a dense screen carries exactly one accent surface"). Measured on the built application at `ab29f51b` (`pnpm app:drive`, 1400×900 and 1000×680): the Models category drew seven, "Add endpoint" and six "Authenticate"; each row's open settings added a filled Save (read in the source). The independent critique of 2026-11-11 filed it as UIR-307, high ([the Settings brief](../../design/briefs/settings.md)); the critique of 2026-11-10 had filed the same as UIR-001.

REQ-CONFIG-371 names a row's primary action once, Quick Start, and says nothing of a fill; in the adopted language the primary button is the filled one, so this directive narrows that clause (below). The fill on Authenticate came from the mockup, whose list holds four providers of which one is unauthenticated, so it draws one fill. The product's list holds every provider REQ-PROVIDER-140 lists ([`PD-CONFIG-002`](pd-config-002.md#pd-config-002)), so before the first sign-in every row is unauthenticated and the mockup's rule yields a fill per row. A row's rank is therefore drawn by its place, first in the row, and the accent is given to one control.

That control is the add-endpoint action because it is the only action the card has in every state, and because it opens both paths a person comes here for: registering an endpoint, and authenticating a built-in provider (REQ-CONFIG-378).

What it costs:

- On first use, a person who wants a built-in provider needs that row's Authenticate, and it no longer carries the accent. The accent stands on a control labelled "Add endpoint", whose dialog offers the built-in providers too but whose label does not say so.
- The filled Authenticate was the row's one mark of a missing credential, and it is gone. A row with stored credentials now differs from one without by its action's label ("Re-authenticate"), by the masked key where a key is stored, and by "Sign out" being enabled. The status word and the indicator state the connection (REQ-CONFIG-368), not the credential: before a check, both rows read "Not checked".
- In a row's settings, Save is told from Validate and Check health by its place alone.
- While unsaved changes stand, the save bar's Save is filled as well, so two fills stand on the view (measured: "Save" and "Add endpoint"). The same holds on Hooks, Project and MCP Servers. Which of the two yields is [OQ-550](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-550).

**Considered, and not taken.**

- *No fill in the card, the head's action a hairline as the mockup draws its "Check status".* It would hold the rule in the unsaved state as well. Not taken: the Overview's empty state sends a first-time user here to do one thing, and the view would offer twenty controls of one weight with nothing saying where to start.
- *The fill on one row: the first unauthenticated one, or the recommended one.* The list is ordered by identifier (REQ-PROVIDER-140), so the first row is an accident of spelling; the recommended provider is unavailable in this build (its status reads "Coming soon").
- *The head's fill yielding while the save bar's Save stands.* It would make Models the one category whose body answers to the frame. A rule for the frame against a body belongs to every category that draws a fill, and is OQ-550.

**Proposed, and refused by this round's own critique.** The first build let the empty state keep an add-endpoint control of its own, drawn as a hairline ("MAY keep"). Refused: the card then drew two controls of one name 60 px apart, and the state's sentence can name the head's. The first build also recorded this directive as extending REQ-CONFIG-371; it narrows it.

**What is not built.** Quick Start is not drawn anywhere in this build (REQ-CONFIG-371, REQ-CONFIG-389's managed-cloud row), so its place and its drawing under this directive are stated and not captured or tested.

Also built with it, and covered rather than decided: the head's actions stand at the card's right edge (REQ-CONFIG-329's "right-aligned action"; the adopted `TableCard` holds a spacer the product's copy had dropped). The row's action cell is a table cell, so the row's rule is one line and no label in the row breaks at 1000×680 (UIR-308 and UIR-309; REQ-CONFIG-367, REQ-SHELL-022). A press of Authenticate on a provider that signs in with a stored key opens the row's settings, moves focus to the key field and states its sentence there (REQ-PROVIDER-141): with the settings closed the press changed nothing on screen ([the note](../../archive/defects/a-key-providers-authenticate-changes-nothing-on-screen-while-its-settings-are-closed.md)). The action's accessible name reads "Authenticate" for a row nobody has checked (REQ-CONFIG-372); it read "Re-authenticate" under the label "Authenticate".

> **Narrows:** REQ-CONFIG-371
> **Extends:** REQ-CONFIG-329, REQ-PROVIDER-141

The case narrowed, stated exhaustively: how a provider row's primary action is drawn. Where REQ-CONFIG-371 has Quick Start "presented as the row's primary action", that action stands first in the row and is a hairline control, never a filled one. Everything else REQ-CONFIG-371 states governs as written: which actions a row renders, when each is enabled, the destructive presentation of Delete, the one tooltip and its order, and what availability means. Nothing REQ-CONFIG-329 or REQ-PROVIDER-141 states is displaced; the directive adds which control of the card is filled and how the settings' Save is drawn. REQ-CONFIG-367, REQ-CONFIG-372, REQ-CONFIG-378, REQ-CONFIG-388 and REQ-PROVIDER-140 govern in full.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's standing delegation [R-098](../requests.md#r-098), which the owner authorised on 2026-11-11; logged as [R-099](../requests.md#r-099), the owner's request of the same day to take up the open critique findings ("das ist deine entscheidung"). Its first build was read by an independent critique the same day, which refused the disposition, one clause and one stated cost; each is corrected above, and the critique is recorded in [the Settings brief](../../design/briefs/settings.md), "Critique 2026-11-11, of the providers card". The owner did not word this directive.*
