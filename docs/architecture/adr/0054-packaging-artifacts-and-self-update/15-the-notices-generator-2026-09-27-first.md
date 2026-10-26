# ADR-0054 — Packaging, the four artifacts, and self-update — The notices generator — 2026-09-27, first execution (`first-release-plan.md` §4.3)

Part 15 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The notices generator — 2026-09-27, first execution (`first-release-plan.md` §4.3)

*REQ-STARTUP-037, REQ-STARTUP-141..143, REQ-STARTUP-149; IC-7's second half.* `pnpm notices` (`tools/notices/generate.mjs`
over `notices.mjs`) is the licence-inventory generation and validation step this record's pipeline runs per platform
before freezing. It writes `apps/desktop/resources/THIRD-PARTY-LICENSES.txt` (git-ignored) only when validation passes.
A failure exits 1 with one `error:` line per problem naming the component or path, and it removes any earlier file so a
stale one cannot be frozen in its place. The closure is computed offline, from what is installed:

- the desktop application's production `dependencies` and those of every workspace package it builds from, never a
  development dependency and never a product package;
- Electron as one component, with its own credits reproduced beneath it (OQ-72);
- SQLite and winpty (win32 only), which this build compiles into its native modules from vendored sources whose
  licence files the `files` patterns above strip from the archive;
- the bundled runtime's interpreter and every distribution in it;
- the fonts and the icon set, from a table beside the generator that must name every face `packages/ui/src/fonts.css`
  bundles.

The inputs a person owns are three version-controlled files beside the generator:

- the maintainer-review table (`reviewed-exceptions.json`, empty);
- the release inputs (`release-inputs.json`), where the owner writes O-3's LGPL address;
- the fonts table (`bundled-assets.json`), with the upstream OFL texts under `licenses/`.

**What the first run over this tree found.** The file renders 20.4 MB, 19.8 MB of it Electron's 779 credited
components. There are 40 application components on win32 (38 npm packages including Electron, plus SQLite 3.53.4 and
winpty 0.4.4-dev), 74 runtime components on the Linux bundle, and 4 fonts and icon sets. **Validation refused, on
six problems, each correctly:**

1. the LGPL address is empty (O-3, owed by design);
2. `@ai-sdk/provider-utils` 5.0.36 carries no licence text in its npm package;
3. `@xterm/addon-serialize` 0.14.0, the same;
4. `@xterm/headless` 6.0.0, the same;
5. `proxy_tools` 0.1.0, in the runtime, the same;
6. `dotenv` 0.9.9, in the runtime, declares no licence identifier.

Four of those wait on a maintainer's reviewed exception, which only a maintainer may write (plan §6, O-11). The sixth
has no reviewed route under REQ-STARTUP-143 as worded (OQ-74).

*Corrected 2026-09-27 by the gate review: the list above is short by eight.* The generator had counted any non-empty
licence-named file as the component's licence text. `@workflow/serde` 4.1.0 is inlined into the main bundle. Its only
licence file reads "Apache License 2.0" and then "See the LICENSE file in the root of this repository", and the
package ships no such file. The generator now reads a file that only names the licence, or only sends the reader
elsewhere for it, as a reference. It reads a NOTICE or an authors list as an attribution. Neither counts as the text,
and both are still reproduced (OQ-75). **Run again, validation refuses on fourteen problems:**

- O-3;
- `dotenv`;
- the four components above that ship no licence file;
- eight that ship only a reference:
  - `@workflow/serde` 4.1.0;
  - `ai` 7.0.92 and `@ai-sdk/gateway`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` and `@ai-sdk/provider`, each
    with Apache-2.0's per-file notice only;
  - in the runtime, `certifi` 2026.7.22, with MPL-2.0's Exhibit A only;
  - in the runtime, `mslex` 1.3.0, with the Apache-2.0 notice and an `AUTHORS.rst`.

O-11 names twelve reviews.

**Validation fails on more than REQ-STARTUP-143's five conditions.** These are the generator's own integrity guards.
Each fails closed and names what it found:

- a font's licence file that lacks the font's own copyright notice;
- an installed Electron runtime whose `dist/version` differs from its `package.json`;
- Electron credits whose product count does not match what could be read;
- a malformed or future-dated reviewed exception, even when no component needs it;
- a required dependency that is not installed;
- an input file that is not a JSON object.

Only the rule that Electron, the interpreter, a compiled-in library and a bundled asset must carry their text is a
reading of the requirement (OQ-75). The rest guard the generator's own inputs.

*Corrected 2026-09-27 by the gate review's second round, on two points.* First, an input that parsed to `null`, `false`,
`0` or `""` had been read as having nothing to report. Over an otherwise valid fixture, a `release-inputs.json` holding
`null` exited 0 with "(no address)" in the header. A `bundled-assets.json` holding `null` dropped every font and icon
text, and a `pins.json` holding `null` dropped every language server. Second, the address check still accepted the
plan's own example `Name <sources@domain.tld>`, `test@test.com`, `noreply@…`, two addresses in one value, and the
stock postal templates. Both are repaired. What the check refuses, and its limits as a word-and-shape heuristic, are
stated in the plan's §4.3.

Two premises of REQ-STARTUP-142 are not true of this
build: Manrope is named and not bundled, and no setup manifest pins a machine tool (OQ-73). **Nothing in this record
changes.** The step sits where REQ-STARTUP-037 puts it, before freezing. The `extraResources` entry
that carries the file into the artifact, and `package.mjs`'s call to the step, are §4.4's, with `build-id.txt`.
*Both landed 2026-09-27; see the next section.*
