# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Consequences accepted

Part 5 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Consequences accepted

1. A small piece of infrastructure we own and must test on all three platforms, **including the case
   where the root is unwritable**.
2. Users cannot inspect preferences with platform tooling. No requirement asks for that; if one ever
   does — enterprise policy management, or another program reading it — this decision is what changes.
3. **Forward and backward compatibility need no migration mechanism**, because every key answers with
   its declared default when absent and every unknown stored value falls back to a default. That is why
   alternative B's migration feature is not a loss, and it is why alternative D's strongest offer — a
   schema — buys nothing here.
4. Adding a preference means editing the registry table. That is the intended friction:
   `REQ-SHELL-006` requires a new preference to be "registered in that table rather than minting a key
   of its own".
5. **Two draft debounces are both implemented and both tested.** They are different figures serving
   different requirements and it would be easy to collapse them into one by accident.
6. **The single-instance gate must admit benchmark iteration processes**, and if it does not,
   `REQ-UIBENCH-046` fails without any test that currently exists noticing. Raised as an open question;
   the two checks above are this ADR's contribution to catching it.
7. **This store is a named exception to SR-4 and must stay one.** The guard is the same as ADR-0029's:
   no preference key has a row type anywhere in any schema, which is checkable by reading the schema
   next to the registry table.
