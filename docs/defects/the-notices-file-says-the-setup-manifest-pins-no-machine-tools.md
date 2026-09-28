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
