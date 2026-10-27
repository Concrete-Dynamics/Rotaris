# Architectural constraints extracted from the specification — 11. Model providers and tool servers

Part 13 of 22 of [the constraints](../constraints.md), which indexes every part.

## 11. Model providers and tool servers

| # | Constraint | Label | Requirements |
|---|---|---|---|
| M-01 | Exactly six providers with fixed identifiers, display names and enumeration order; the catalogue is **build data, not runtime state**, and nothing in the running product writes the availability attribute. | HARD | REQ-PROVIDER-001, REQ-PROVIDER-006, REQ-PROVIDER-007 |
| M-02 | Each entry carries a **closed attribute set** with integrity rules enforced as **errors**; a build that violates any is rejected. | HARD | REQ-PROVIDER-002 – REQ-PROVIDER-004 |
| M-03 | **Absence must be representable distinctly from emptiness**: one entry has no discovery URL and no base URL, and a code path requiring one must **fail before opening any connection**. | HARD | REQ-PROVIDER-005 |
| M-04 | The catalogue attribute set is declared closed and three other requirements add attributes to it, one of them spelling a connection mode differently. | CONFLICT | REQ-PROVIDER-002 vs REQ-CONFIG-370, REQ-CONFIG-371, REQ-MONITOR-021 |
| M-05 | Credentials are one JSON file per provider at a fixed path with fixed keys and indentation, in a directory that is **never inside a workspace**; enumeration is the sorted basenames; after any operation the directory holds nothing but those files. | HARD | REQ-PROVIDER-014, REQ-PROVIDER-017 – REQ-PROVIDER-019 |
| M-06 | Protection is applied **explicitly on every platform and never inherited**, including an explicit Windows access-control list **with inheritance disabled**; **if it cannot be applied the credential is not written**. | HARD | REQ-PROVIDER-016, REQ-PROVIDER-063 |
| M-07 | A credential-status query performs **no network I/O**, is a function of the stored credential and the clock alone, and returns one of three values; two queries at the same clock reading must agree. | HARD | REQ-PROVIDER-010, REQ-PROVIDER-059 |
| M-08 | Per-provider status classification rules differ irreducibly and are **not a shared predicate**. | HARD | REQ-PROVIDER-024, REQ-PROVIDER-027, REQ-PROVIDER-034, REQ-PROVIDER-045, REQ-PROVIDER-050 |
| M-09 | A derived key lives in **process memory only** and is never written anywhere; a failed exchange fails one model call and never invalidates the stored credential. | HARD | REQ-PROVIDER-035 |
| M-10 | Bridge artifacts are rewritten as part of **every** credential save and are on disk **before the save returns**; a failure to write one is a warning, never a failed save. | HARD | REQ-PROVIDER-061, REQ-PROVIDER-134 |
| M-11 | Exactly three sign-in methods with a closed vocabulary; a local HTTP listener on fixed or ephemeral loopback ports with fixed paths; **the listener is closed and its port released before the sign-in call returns**, on every platform. | HARD | REQ-PROVIDER-008, REQ-PROVIDER-009, REQ-PROVIDER-029 – REQ-PROVIDER-031, REQ-PROVIDER-039, REQ-PROVIDER-148 |
| M-12 | A non-interactive attempt must produce an outcome within 30 seconds, and where the failure precedes contacting any provider the failure result is the **only output — no traceback, warning or other diagnostic anywhere**. | HARD | REQ-PROVIDER-013 |
| M-13 | Discovery dispatch is **per provider, not uniform**, and the error mapping is **total** — no response left unclassified, no unmapped status silently treated as success. | HARD | REQ-PROVIDER-047, REQ-PROVIDER-069 – REQ-PROVIDER-071, REQ-PROVIDER-076 |
| M-14 | Tier assignment is **deterministic and its determinism is the requirement**, with a code-point tie-break; the fallback rule makes it total and independent of discovery order. | HARD | REQ-PROVIDER-081, REQ-PROVIDER-082 |
| M-15 | Refresh is a **merge, not a replace**: models not re-discovered are preserved, sorted, appended and counted separately. | HARD | REQ-PROVIDER-083, REQ-PROVIDER-147 |
| M-16 | Capability declarations have a **three-source precedence stated in terms of source, not recency**, so provenance must be retained rather than only the value. | HARD | REQ-PROVIDER-149, REQ-PROVIDER-150 |
| M-17 | Consumed remote contracts accept and ignore unknown fields; the persisted snapshot **rejects** unknown keys. **The two rules are deliberately opposite.** | HARD | REQ-PROVIDER-151 vs REQ-PROVIDER-084 |
| M-18 | Every snapshot write is preceded by a **secret scan that refuses the write and reports the offending field's path**, with a closed two-family exemption set matched by path. | HARD | REQ-PROVIDER-086 |
| M-19 | **Unavailable models must be unconstructible into a client**, while pickers still display the row with its reason. | HARD | REQ-PROVIDER-075, REQ-PROVIDER-090 |
| M-20 | **Two request dialects against the same base URL, chosen per model, are mandatory** — not an optimisation. | HARD | REQ-PROVIDER-089, REQ-PROVIDER-092 |
| M-21 | Credential acquisition is **inside the request path**: a model naming a sign-in provider takes its credential from the store and an expired one is renewed **before the request leaves**. | HARD | REQ-PROVIDER-092 |
| M-22 | One money rule for the whole domain: **exact decimal arithmetic, never binary floating point**, covering per-token pricing carried through discovery; balances round down and every other amount half-up. | HARD | REQ-PROVIDER-121, REQ-PROVIDER-130, REQ-PROVIDER-150 |
| M-23 | Per-token prices are typed as floating point in one requirement and required to be exact in another. | CONFLICT | REQ-PROVIDER-072 vs REQ-PROVIDER-121 |
| M-24 | Per-provider concurrency defaults are stated twice, differently, and two requirements disclaim holding a list of provider names. | CONFLICT | REQ-CONFIG-095 vs REQ-MONITOR-021, REQ-PROVIDER-049 |
| M-25 | One shared redaction pass backs seven surfaces and **no venue carries rules of its own**; the display mask is a **different function** and the two are never substituted; masking of a stored tool-server secret is **unconditional**. | HARD | REQ-TOOLS-171, REQ-TOOLS-172, REQ-PROVIDER-107, REQ-PROVIDER-131, REQ-PROVIDER-140, REQ-MCP-081, REQ-MCP-109 |
| M-26 | The tool-server entry schema is closed and singly defined; a defect is **fatal from one source and non-fatal from another**, and the fatal case must report **every** defect, not the first. | HARD | REQ-MCP-001, REQ-MCP-002, REQ-MCP-023 |
| M-27 | Name algebra: candidate spellings are **added, never substituted**; denial outranks every grant; **renaming is a presentation decision and never a permission decision**; "no entry" and "empty list" must stay **distinguishable in the resulting surface**. | HARD | REQ-MCP-004, REQ-MCP-005, REQ-MCP-055 – REQ-MCP-057 |
| M-28 | Command resolution recognises the reserved token **before every other rule** and never looks it up on the search path; path-like forms are never rewritten; a bare name passes through with no guessing. | HARD | REQ-MCP-028 – REQ-MCP-033 |
| M-29 | The normalised runtime description has an **exactly-equal key set**, is produced only after filtering, renaming and grants, and is produced **for every agent backend the product supports**. | HARD | REQ-MCP-043 |
| M-30 | Discovery is memoised on a **nine-value identity**, **per process and never shared** — never written to disk, never coordinated between instances — while a health probe is **deliberately uncached**, contacting the server once per probe. | HARD | REQ-MCP-047, REQ-MCP-054 |
| M-31 | A server that becomes unreachable after connecting is handled **per call**, with **no retry and no automatic reconnection**; a later call may reconnect and succeed. | HARD | REQ-MCP-069 |
| M-32 | A mid-connection tool-list change may only ever **narrow** the callable set; a newly introduced name never becomes callable for the rest of that connection. | HARD | REQ-MCP-060, REQ-MCP-062 |
| M-33 | The stdio launch guarantee: **the product creates the child's three standard streams itself for every launch, never inherits the parent's, never requires a console to exist, and never allocates or shows one — no console window at any point.** | HARD | REQ-MCP-113 |
| M-34 | Exactly **one binding manifest** holds every identifier of the pinned runtime; it is not user-editable and does not vary by workspace; build checks verify tier cardinalities, disjointness and **that every name is reported by the pinned runtime**, and a failing build must not ship. | HARD | REQ-MCP-011, REQ-MCP-015, REQ-MCP-095, REQ-MCP-116 |
| M-35 | Whether a spawned stdio child inherits the parent process environment. | Silence | REQ-MCP-087, REQ-MCP-090 |
| M-36 | Whether the reserved token's branch serves only the stdio server, or is a general pass-through the setup subcommands also use. | CONFLICT | REQ-MCP-033 vs REQ-MCP-036, REQ-MCP-099 |

---
