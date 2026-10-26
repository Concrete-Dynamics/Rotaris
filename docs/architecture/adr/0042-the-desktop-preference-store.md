# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-1 and SR-4
- **Origin:** DATA (ADR-DATA-09), UI (ADR-UI-06)
- **Depends on:** ADR-0002, ADR-0004
- **Two slices proposed different roots; the conflict is resolved here.**

> **This store does not move to the database, and the reason is in SR-4 itself.** The ruling's table
> places "global configuration, the discovery snapshot, **desktop preferences**" in per-user
> configuration and data directories, and its principle asks for a database only where the data is
> "high-volume, queried, or transactional". A closed table of a few dozen keys is none of the three. The
> decisive fact is scope: SR-4's database is **one per workspace**, while `REQ-SHELL-006` requires this
> store to lie **outside every workspace directory** so that no preference ever appears in a project or
> its version control. A per-workspace store cannot hold a per-user preference.

## Parts

Since 2026-10-26 the rest of this document is in [`0042-the-desktop-preference-store/`](0042-the-desktop-preference-store/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0042-the-desktop-preference-store/01-context.md) | Context |
| [02](0042-the-desktop-preference-store/02-alternatives-considered.md) | Alternatives considered |
| [03](0042-the-desktop-preference-store/03-decision.md) | Decision; What SR-4 does and does not touch; What SR-1 requires of whoever implements it — a constraint this store owns the reason for |
| [04](0042-the-desktop-preference-store/04-first-execution-2026-09-04-the-theme-preference.md) | First execution — 2026-09-04, the theme preference |
| [05](0042-the-desktop-preference-store/05-consequences-accepted.md) | Consequences accepted |
| [06](0042-the-desktop-preference-store/06-revisit-if.md) | Revisit if |
| [07](0042-the-desktop-preference-store/07-sixth-execution-2026-09-09-part-ak-the.md) | Sixth execution — 2026-09-09 (Part AK′), the requirements board's keys and the second parametrised family |
| [08](0042-the-desktop-preference-store/08-seventh-execution-2026-09-11-part-c-the-draft-a.md) | Seventh execution — 2026-09-11 (Part C″), the draft a load can beat |
| [09](0042-the-desktop-preference-store/09-correction-2026-10-14-fin45-three-preferences.md) | Correction — 2026-10-14 (fin45), three preferences under keys the table does not list |
