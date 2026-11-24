[Product directives](../directives.md) › PD-CHAT-017

<a id="pd-chat-017"></a>

### PD-CHAT-017 — a reasoning control offers the levels the selected model offers

Every reasoning control outside Settings — the composer's reasoning chip, the run header's active-run reasoning
selector and the inspector's reasoning selector — SHALL offer **the levels the selected model offers, after a
provider-default entry**, and never a fixed `low` / `medium` / `high`. The levels a model offers are the ones
REQ-CONFIG-332 and [`PD-CONFIG-007`](pd-config-007.md#pd-config-007) already fix for a slot's control: the configuration
snapshot's `modelReasoning` projection, read from the model's `reasoning_effort_map` keys or its catalogue capability
record, in the vocabulary's own order, `off` and `xhigh` included. Each level is displayed under its own name; the
provider-default entry is labelled **Provider default**.

- **The composer's chip** chooses the entry role's `thinking:` for the next run. Its options are the provider default
  (written as `provider_default`) and the model's levels; a level the role states that the model no longer offers is
  appended and shown, so repopulating never discards it (REQ-CONFIG-332's appending rule). With no level stated the chip
  shows the provider default — never a `high` that no run would send.
- **The run header's and the inspector's selectors** switch the live run (REQ-MONITOR-142). Their options are the
  runtime's `unset`, labelled Provider default, and the model's levels. A model offering no levels offers the provider
  default alone.

**Why, and what it costs.** The owner, 2026-11-24: the dropdown should match what the selected model can do instead of
three hard-coded levels. The chip offered `low`/`medium`/`high` whatever the model was, so a model that honours `off`
or `xhigh` could not be given them from the composer, and a model that honours none was offered three levels that
changed nothing. What this costs is REQ-CHAT-009's fixed three labels and its displayed default of `high`, and
REQ-MONITOR-144's "(low / medium / high)". The chips' order, enablement, popover presentation (PD-CHAT-001) and the
next-run semantics (REQ-MONITOR-146) govern unchanged.

> **Narrows:** REQ-CHAT-009, REQ-MONITOR-144

*Raised by the owner, 2026-11-24; logged as [R-126](../requests.md#r-126).*
