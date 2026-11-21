[Settings — brief](../settings.md) › part 3

# The web search panel (R-119)

The owner found setting up the search key awkward: the Tools page drew a four-step card (choose a provider, paste a
stanza into the configuration file, paste the key, test), and the shipped entry pointed at `search.rotaris.invalid`,
which never answers — so no first run could reach search without a file edit.

**What other harnesses do** (public documentation, read 2026-11-21): the hosted coding tools ship search built in with
an on/off switch; the self-hosted chat tools offer a provider choice with only that provider's fields, a masked key and a
link to get one; one prompts on first use. None offers a test. The anti-pattern is the one the card had: a stanza to
copy by hand.

**Decided.**

1. The shipped `web_search` url is Tavily's hosted endpoint (REQ-CONFIG-181 leaves the vendor open), so the key is all
   the default needs.
2. One panel, three ledger rows on the page's label column: **Provider** (the provider the entry's url names, with "Get
   a key ↗"), **API key** (masked field, scope, **Save and test**, Delete once a key is stored), **Status** (the dot
   beside its word, and Test or **Turn on and test**). Controls wrap inside the value column at the minimum window.
3. **Save and test** stores the key, switches an entry configured off on (PD-CONFIG-006 revision 2) and probes it, and
   reports each step under the rows. The probe lists tools and runs no search; Tavily answered Healthy to a made-up
   key, so a keyed Healthy says the provider checks the key when an agent first searches.
4. Another provider (Linkup, Exa without a key, your own server) is behind "Use a different provider", closed: the
   choice, then **Use <provider>**, which writes the entry's url alone into the chosen scope ([`PD-CONFIG-013`](../../../product/directives/pd-config-013.md#pd-config-013),
   path B) and reads "<provider> is in use" for the one the entry already reaches; your own server takes a typed http(s)
   address, refused unless it parses. The stanza, Copy and Open the file stay beneath it for an edit by hand.
5. One filled control in every state: Save and test until a key is stored (or while one is typed), Turn on and test
   while the entry is off, Test otherwise; Open the file in the empty state.
6. The explanation sits behind the head's information control, closed until asked for (PD-CONFIG-012 clause 4).
7. The MCP section's cards are parted by `--rt-space-6`: with every card's margin at 0, each heading had sat on the
   last line of the card above.

**Driven** on the built app at 1400×900 and 1000×680 (`pnpm app:drive`, the scripted dialect, a scratch workspace):
the empty key, the disclosure open, Save and test with a made-up key (the key stored, `enabled: true` written, the
probe answering), the stored state. **Not driven:** `nocturne` and `high-contrast`; an unreachable endpoint; a
`review-ui` critique.
