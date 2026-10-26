[Product directives](../directives.md) › PD-PROVIDER-001

<a id="pd-provider-001"></a>

### PD-PROVIDER-001 — the hosted connection mode is spelt `hosted-cloud`, and a provider's shared quota is a number it declares

**The spelling.** The hosted connection mode SHALL be spelt `hosted-cloud` wherever the product names it: the
catalogue's connection mode (REQ-PROVIDER-002), the destination sentence REQ-CONFIG-370 composes for it, and the
vocabulary table of domain 15, whose `rotaris-cloud` names the same mode. No surface or record SHALL carry a second
spelling. REQ-CONFIG-370's sentence for the mode, its fields and its fallbacks are otherwise unchanged.

**The quota cap.** Whether a provider's quota is consumed by concurrent calls against one account SHALL be declared on
that provider's catalogue entry as a **number**: the cap of concurrent calls that every model of the provider carries
without the user configuring anything. A provider that declares none leaves its models uncapped. REQ-MONITOR-021's
uniform figure of 2 no longer governs; the rest of that requirement does — a cap the user configures for a model replaces
the declared one entirely, and the cap in force stays inspectable. The numbers this product declares are REQ-CONFIG-095's:
`deepseek` 3 and `claude-code` 2.

**As built.** The catalogue spells the mode `hosted-cloud` (`packages/providers/src/catalogue.ts`), and the values in force
are the two numbers above, declared since 2026-10-06 (fin22) on the catalogue entries as `sharedQuotaCap` (`deepseek` 3,
`claude-code` 2, every other entry none). Main hands them to the run host at its handshake, and `modelCapInForce`
(`packages/config/src/sections/models.ts`) applies a model's stated `max_parallel`, else its provider's declared cap.
Until then they were held by configuration's provider-conditional default (`defaultMaxParallel`), a list of two provider
names, as recorded in
[`the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md`](../../defects/fixed/the-shared-quota-cap-is-a-list-of-provider-names-not-a-catalogue-property.md).

**Why, and what it costs.** OQ-6: REQ-PROVIDER-002 spells the mode `hosted-cloud` where REQ-CONFIG-370 spells it
`rotaris-cloud`, and REQ-CONFIG-095 gives one provider a cap of 3 where REQ-MONITOR-021 gives every declaring provider 2
and refuses to hold a list of names. The owner took the catalogue's spelling and a number per provider, which keeps both
caps the product applies today and lets a provider added later declare its own. What it costs: REQ-MONITOR-021's single
figure is gone, so the cap a provider imposes is read from its entry rather than known in advance.

> **Narrows:** REQ-CONFIG-370, REQ-MONITOR-021

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-6.*
