[Product directives](../directives.md) › PD-CONFIG-005

<a id="pd-config-005"></a>

### PD-CONFIG-005 — the Models category also holds the dictation model

Settings › Models SHALL hold a third section, **Dictation**, below REQ-CONFIG-329's two cards, editing the `dictation:` keys
[OQ-457](../../architecture/open-questions/68-spikes-and-later-questions-35.md#oq-457) reads. It commits with Save like the rest of the
category. Save SHALL refuse a value the loader would refuse, naming the field, before anything is sent. The two cards and everything
REQ-CONFIG-329 states about them are unchanged.

**Why, and what it costs.** The owner asked for a selectable dictation model on the Settings surface, and REQ-CONFIG-268 fixes the thirteen
categories, so a fourteenth is not open. A dictation model is a model, so Models is where a person looks. It costs the category its stated
shape of exactly two cards, and the section stands below the providers list, past the fold at the default window.

> **Narrows:** REQ-CONFIG-329

*Raised by the owner, 2026-10-30, relayed in a lane brief; logged as [R-089](../requests.md#r-089). Minted by the lane under the brief's
instruction to mint where a reading departs from a live requirement; the rest of dictation is raised as OQ-455 to OQ-459 and not ruled here.*
