[Product directives](../directives.md) › PD-CONFIG-006

<a id="pd-config-006"></a>

### PD-CONFIG-006 — the reasoning vocabulary is what the models bring, and `off` and `xhigh` are levels

The reasoning-level vocabulary for slots and models SHALL be `auto`, `off`, `low`, `medium`, `high`, `xhigh`,
`max`. Two names it did not have are added:

- **`off`** — reasoning switched off, a level a model may offer. What an endpoint calls it is a
  `reasoning_effort_map` **value** (REQ-CONFIG-091): an endpoint whose map reads `off: none` is sent `none`,
  exactly as `max: xhigh` sends `xhigh` today. `none` is therefore a spelling a level maps to and is never
  itself a level of this vocabulary; and
- **`xhigh`** — the extra-high effort, a level in its own right rather than only a provider-dialect spelling of
  `max`.

The per-role vocabulary still adds `default` and `provider_default` to those seven. A vocabulary name still is
not a substitute for what a model offers: **a level is offered only where the model's own entry declares it**,
exactly as REQ-CONFIG-332 already reads — the keys of the entry's `reasoning_effort_map` where it declares one,
otherwise the levels its catalogue capability record declares (`capabilities.reasoning_levels`,
REQ-CONFIG-202) — the declared set read against this vocabulary, in the vocabulary's own order, minus `auto`,
which no model offers (REQ-CONFIG-093, REQ-CONFIG-332). Widening the vocabulary is what lets a model that
declares `off` or `xhigh` have them offered instead of clipped away; a model declaring neither still offers no
levels and its control is the unset entry alone. Each level is displayed under its own name, so `off` and
`xhigh` display literally.

How a level reaches a provider, extending REQ-CONFIG-092: `off` SHALL be sent as its `reasoning_effort_map`
entry where the entry holds one — so an endpoint whose map reads `off: none` is sent `none` — and where the entry
holds none it SHALL send **no** reasoning-effort field at all, because "switched off" is expressed by the absence
of an effort or by the endpoint's own word for it and never by a guessed string. `off` is a known level, so that
path raises no warning. `xhigh` SHALL reach the provider unchanged, as `low`, `medium` and `high` already do.
`max` continues to reach it as `xhigh` where no map entry states otherwise, and an explicitly configured
`reasoning_effort` still bypasses the whole path and is sent verbatim (REQ-CONFIG-089). **`auto`'s own handling is
not changed by this directive**: whether it honours a map entry is left exactly as the build has it, and only the
offered-level vocabulary and `off`'s route are settled here.

The discovery snapshot's capability record is how a catalogue reaches a control (REQ-CONFIG-332), so a
provider's catalogue that reports the reasoning levels its models support SHALL have them captured into each
model's `capabilities.reasoning_levels` under the product's own name for them, by the same route and with the
same three-state absent/present discipline the image-input declaration of REQ-PROVIDER-149 already uses. A
payload that states no reasoning levels leaves the key absent rather than guessing one, an entry that states a
`reasoning_effort_map` remains that model's source, and no level is ever inferred from a model's name or id.
Which payload key paths are read is **build data** on the terms REQ-PROVIDER-073 fixes for a provider's own
payload: this rule fixes what is done with each declared level, not where it is found.

**Why, and what it costs.** The owner's rule is that the product's own vocabulary is secondary and that what a
model and its provider actually bring is what matters: a locally hosted endpoint that understands `off`, `low`,
`high`, `xhigh` and `max` was offered a set clipped to the product's five, missing `off` and `xhigh` — two levels
its model can honour — while offering none it could not. What this costs is REQ-CONFIG-069's and
REQ-PROVIDER-088's claim that the vocabulary is **closed** at its old members, and the same closure inside
REQ-CONFIG-079 and REQ-CONFIG-332. `auto`, the unset entry, the vocabulary's original five, and the
`reasoning_effort_map` precedence all keep their meanings, so no value a user has already stored changes what it
says.

> **Narrows:** REQ-CONFIG-069, REQ-CONFIG-079, REQ-CONFIG-332, REQ-PROVIDER-088
> **Extends:** REQ-CONFIG-092, REQ-PROVIDER-072

*Raised by the owner, 2026-11-08, relayed to this lane in a brief; logged as [R-095](../requests.md#r-095). Minted
by the lane under the brief's instruction to mint where a reading departs from a live requirement. **Why a directive
and not an amendment:** `REQ-CONFIG-069` and `REQ-PROVIDER-088` are faithful statements of the behavioural target —
the product simply wants something else — so the corpus is not wrong and it is not edited in place; the requirement
texts keep their words and carry this directive's back-pointer at their own definitions, as `README.md` prescribes.
The offered-set rule keeps the shape PR #72 built for its field (the vocabulary read against the model's declared
levels); what widens is the vocabulary, which is the owner's correction. The codex subscription catalogue's own
reasoning-level capture (`REQ-PROVIDER-076`) is not displaced by this and stays owed as its own build.*
