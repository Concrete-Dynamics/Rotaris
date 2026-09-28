## The notices file says the setup manifest pins no machine tools, while the shipped manifest pins two

`pnpm notices` (`tools/notices/notices.mjs`) reads `apps/desktop/scripts/code-intelligence/pins.json` as the build's setup
manifest (`PATHS.setupManifest`) and, finding no `machineTools` there, writes into `THIRD-PARTY-LICENSES.txt`'s "Tools
provisioned after installation" section: "The setup manifest of this build pins no machine tools, so this build downloads
neither Git nor ripgrep." Since 2026-09-28 the build ships a setup manifest, `apps/desktop/resources/setup-manifest.json`
(first-release-plan.md §4.1), and it pins Git 2.55.0 and ripgrep 15.2.0 with their archives, sources and licences. The
first half of that sentence is now false of the tree. The second half is still true — nothing in the product downloads
either tool, because the machine-setup flow is not built — but the file states the wrong reason for it, and it lists
neither tool's name, version, source or licence.

The generator's reader was written before the manifest existed, under OQ-73's reading that "when machine setup is built
its manifest carries `machineTools`, and the section lists them", with the caveat its gate review added: the key and its
shape were the generator's own assumption, "machine setup decides both, and the generator's reader follows". The manifest
now decides: `machineTools` is a list of tools each carrying `name`, `provisionedVersion`, `source` and `license` (the
generator expects `version`), beside the probe, the archives and the capabilities. The reader has not followed, and the
notices step still reads `pins.json`, whose `languageServers` list the manifest reproduces character for character (a
test holds the two equal), so the language-server sub-section is unaffected.

Noticed 2026-09-28 while building the setup manifest (first-release plan §4.1, R-062). The build was told to leave what
the notices file lists unchanged while OQ-73 is open, so this is recorded and not repaired. The repair is small once
OQ-73 is ruled: point `PATHS.setupManifest` at `apps/desktop/resources/setup-manifest.json`, read `machineTools` with
`provisionedVersion` as the version, and drop the "pins no machine tools" branch or keep it for a manifest that pins none.
Whether the section should then say the tools are "downloaded after installation" while no flow downloads them is part
of the same ruling.

## Specs

- `REQ-STARTUP-142`: the section is "generated from the setup manifest of that same build, listing for Git and for
  ripgrep the name, provisioned version, source URL and license identifier the manifest pins (REQ-STARTUP-058), and
  stating that those tools are downloaded after installation and are not contained in the artifact". The file is
  generated from a different file and lists neither tool.
- `REQ-STARTUP-152`: "the tool and MCP package versions a build provisions and warms SHALL be the versions pinned in the
  manifest that same build ships, and the same versions its `THIRD-PARTY-LICENSES.txt` reports". The notices file
  reports no version for Git or ripgrep, and none for `@playwright/mcp`.
- OQ-73 (`docs/architecture/open-questions.md`) holds the reading the generator was built under and says the reader
  follows the manifest's shape once machine setup decides it.

## Relevant files

- `tools/notices/notices.mjs` — `PATHS.setupManifest` (points at `pins.json`), `setupManifest()` (expects
  `machineTools[].version`), and the "Machine tools" sub-heading's two branches in the renderer.
- `tools/notices/notices.test.ts` — the cases that fix the `machineTools` shape the generator assumes.
- `apps/desktop/resources/setup-manifest.json` — the manifest the build ships, with `machineTools` as
  `packages/config/src/setup-manifest.ts` defines them.
- `apps/desktop/scripts/code-intelligence/pins.json` — what the generator reads today; its `languageServers` is the one
  source of truth for that list, and the setup manifest's copy is held equal to it by `packages/config/src/setup-manifest.test.ts`.

## Repaired 2026-09-28 under R-062

OQ-73 is still open; the repair keeps the reading it states (the section follows the manifest's shape, and what it says
about tools no flow yet downloads is the ruling's) and makes the file true of the tree.

- `PATHS.setupManifest` is `apps/desktop/resources/setup-manifest.json`, the manifest the build ships. The runtime the
  language-server sub-heading names is read from `pins.json` (`PATHS.codeIntelligencePins`), because the manifest does
  not repeat it; the language-server list itself now comes from the manifest, which a test already holds equal to
  `pins.json`.
- The reader follows the manifest's shape: schema version 1, the three lists, a machine tool's `provisionedVersion` as
  its version. `tools/` imports nothing from `packages/` (the component view), so the field names are a copy,
  `SETUP_MANIFEST_SHAPE`; `notices.test.ts` holds each to a key `SetupManifestSchema` declares and validates both the
  fixture and the shipped file with the schema itself. A machine tool carrying the old assumed `version` is refused
  naming `provisionedVersion`.
- "Machine tools" lists Git 2.55.0 and ripgrep 15.2.0 with name, provisioned version, source URL and licence identifier,
  and says: "The setup manifest of this build pins the tools below. None of them is contained in this artifact: they are
  to be downloaded after installation by machine setup, which this build does not yet carry, so this build downloads
  none of them." The "pins no machine tools" sentence stays only for a manifest that pins none.
- A third sub-heading, "Tool-server packages", lists `@playwright/mcp` 0.0.80 with its four fields (REQ-STARTUP-152).
  REQ-STARTUP-142 names no place for it; where it sits is raised as OQ-90.

Pinned by `tools/notices/notices.test.ts`: the tools section over the fixture and over the shipped manifest copied into
it, the "pins none" branch for a manifest that pins none, the manifest's shape refusals, the pins' refusals, the real
repository's manifest read, and the field names against the schema. `pnpm notices` on the tree still refuses with the
same eleven problems as before the repair (the runtime absent, O-3's address, nine components without licence text).
