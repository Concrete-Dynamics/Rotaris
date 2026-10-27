[Product directives](../directives.md) › PD-STARTUP-007

<a id="pd-startup-007"></a>

### PD-STARTUP-007 — a reviewed exception may supply the licence identifier a dependency ships the text of and does not declare

**The rule.** REQ-STARTUP-143's failure on "a dependency in the shipped closure declares no license identifier" SHALL NOT
fail a dependency that a maintainer-review table entry of the identifier kind covers. Such an entry carries the fields
REQ-STARTUP-143 lists, with why no identifier is declared in place of why no licence text is obtainable, and names the
licence file the dependency ships. It covers the dependency only when all of the following hold:

- the component is a **dependency** of the shipped closure — never Electron, the interpreter, a compiled-in library or a
  bundled asset;
- the dependency **ships the named licence file**, that file carries licence text and not only a reference to one
  (OQ-75), and the text **is shown to be the claimed licence's** by the notices validation's own check of that licence;
  a licence the validation holds no check for cannot be claimed this way;
- the dependency's version falls **inside the entry's range** and the entry's **expiry has not passed**; otherwise it is
  treated exactly as no entry at all, as REQ-STARTUP-143 says of every entry.

The notices file SHALL print the claimed identifier for that dependency with the statement that none was declared and that a
maintainer-reviewed exception identifies it, the reason the entry gives, and the shipped text.

**What it does not change.** An identifier entry never excuses missing licence text, and a text entry never excuses a
missing identifier: a dependency that lacks both needs both. Every other condition of REQ-STARTUP-143 governs as written,
and the table's place, review, expiry bound and range rule are unchanged. Identifiers are still copied as declared; whether
one must be an SPDX expression is not decided here (OQ-74's second half).

**As built.** `tools/notices/notices.mjs`, an entry `"covers": "identifier"` in `tools/notices/reviewed-exceptions.json`
carrying `whyNoIdentifier` and `licenseFile`, held to `LICENSE_TEXT_CHECKS` (`notices.test.ts`). The one such entry is
`dotenv` 0.9.9, MIT, against its shipped `dotenv-0.9.9.dist-info/LICENSE`.

**Why, and what it costs.** OQ-74: `dotenv` 0.9.9, which `serena-agent` requires in the code-intelligence runtime, declares
`License: UNKNOWN` and no classifier in its package metadata, and ships the full MIT text. REQ-STARTUP-143 as worded gives
that case no route but removing the dependency, which would break the tool server, so the first release was blocked on a
component whose licence is present and checkable. The entry is the same reviewed, dated, expiring claim of an identifier the
table already carries for every text exception, and the shipped text it rests on is checked by the build rather than taken on
trust. What it costs: the identifier printed for such a dependency is a maintainer's claim, not the component's, for as long
as the entry stands; and a licence the validation cannot check stays blocked until a check is added for it.

> **Narrows:** REQ-STARTUP-143

*Decided 2026-10-23 by the owner's delegate (Augustus), on David Fischer's delegation; logged as
[R-083](../requests.md#r-083), the ruling of [OQ-74](../../architecture/open-questions.md).*
