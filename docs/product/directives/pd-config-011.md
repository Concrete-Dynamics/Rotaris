[Product directives](../directives.md) › PD-CONFIG-011

<a id="pd-config-011"></a>

### PD-CONFIG-011 — what stands first inside a Settings category, and what stands once

Four arrangements inside the Settings categories, none of which adds or removes a category, a control or a stored value:

1. **Models: the providers stand before the model slots.** The category SHALL draw the providers card first, the model slots under a "Model slots" heading second, and Dictation third.
2. **Personas: the role's name stands once.** The role table SHALL have five columns in this order: Persona, Model, Reasoning, Scope, Tools. The Persona cell holds the role's identifier in the mono face.
3. **Personas: the playbook catalogue is closed until asked for.** Each slot SHALL be a disclosure, closed when the category opens, whose summary line names the slot and counts its variants; opened, it lists every variant identifier and its text as before.
4. **Skills: a skill is one entry.** The table SHALL have five columns in this order: Skill, Source, Trigger, Invocation, Load. The Skill cell holds the skill's name, its description and the path of its `SKILL.md`, each on a line of its own; the description keeps its tooltip and accessible description, and the path keeps REQ-WORKSPACE-149's elision with the full path as its tooltip and accessible description.

**Why, and what it costs.** The owner asked for the Settings page and every tab in it to be reworked, "information architecture, ux, ui", with functionality preserved ([R-105](../requests.md#r-105)). Each clause answers a measurement of the built view on `131d02cb`:

- *Providers first.* A slot can only name a model a provider serves, and the notice that sends a person to this category says "No model provider is authenticated yet". Under the seven slot rows the providers began 470 px down the body at 1400×900 and below the fold at the minimum window. Cost: a person who comes to change a slot scrolls past six provider rows.
- *The name once.* "Persona" and "Role" printed the same identifier in two columns for all fifteen roles: the built view has no second name to show. With six columns the table needed 683 px of a 645 px body at 1000×680, so the category scrolled sideways, which the `settings-body` layout contract forbids. Cost: if a persona ever carries a display name distinct from its role, the column returns by a revision of this clause.
- *The catalogue closed.* The eight slots stood 1 300 px under the role table at 1400×900, each headed in the mono face at 24 px, above the 20 px of the view's own title. It is reference text read when writing an override. Cost: one press before a slot's text can be read or searched in the page.
- *One entry.* Seven columns needed 862 px of the 645 px body at the minimum window, and at 1400×900 a description ran eight lines in a 280 px column beside a path cut mid-word. Cost: the description shows three lines until its row is pointed at or holds focus; its whole text remains the cell's accessible description.

> **Narrows:** REQ-CONFIG-338, REQ-WORKSPACE-067
> **Extends:** REQ-CONFIG-329, REQ-ORCH-026

The cases narrowed, stated exhaustively. REQ-CONFIG-338: the number of columns and the "Role" column; which cells are interactive and that Tools is read-only (as PD-CONFIG-001 narrows it) govern as written. REQ-WORKSPACE-067: that Path and Description are columns of their own; every cell's content, tooltip, accessible description and label governs as written, as do the header card and its controls. REQ-CONFIG-329 fixes no order for its two cards and REQ-ORCH-026 requires that every slot, variant identifier and text be listed, which an opened disclosure does; this directive adds the order and the closed first state.

*Raised by the owner, 2026-11-18, in conversation; logged as [R-105](../requests.md#r-105). Minted by the agent that built it (`claude-fable-5-2`) under the owner's words in that request ("you have full control at what you want to do there") and the standing delegation [R-098](../requests.md#r-098). The owner worded the request; the agent worded this directive.*
