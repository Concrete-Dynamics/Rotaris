## An instruction file that is not UTF-8 is injected with no warning

REQ-WORKSPACE-045 names two ways a context file can be unreadable: an I/O error and a **decoding** error. Each is to
be skipped with a warning naming the path and the error. `mergeInstructionContext` skips a file only when
`ports.readFile` throws. The real port is `NODE_DISCOVERY_PORTS.readFile`, which is `readFileSync(path, 'utf8')`, and
that never throws on invalid UTF-8: Node replaces each undecodable sequence with U+FFFD. So a file that cannot be
decoded is merged, replacement characters and all, and no warning is logged.

Measured 2026-09-27: `readFileSync(path, 'utf8')` over the bytes `68 69 0a ff fe c3 28 0a` returns `"hi\n���(\n"`
and does not throw. The gate's verification of `pnpm injection-proof` merged a file holding those bytes through
`NODE_DISCOVERY_PORTS` and got the block `<!-- source: …/AGENTS.md -->\nhi\n���(` with no warning. The existing unit
case for REQ-WORKSPACE-045 uses a port whose `readFile` throws, so it covers the I/O half only.

Found while verifying first-release-plan §3.2/§3.3; it predates that work (the merge was built 2026-09-22 under
`PD-WORKSPACE-002`). Recorded, not repaired: the repair is a separate change.

## Specs

**REQ-WORKSPACE-045**: "An unreadable file (I/O or decoding error) SHALL be skipped with a warning naming the path and
the error, without aborting discovery." The decoding half is unmet. The same port reads `SKILL.md` files, so one that is not
UTF-8 is parsed and injected the same way. REQ-WORKSPACE-053 skips an "unreadable file" there without saying whether a
decoding error is one, so that half is noted here and not claimed as a contradiction.

## Relevant files

- `packages/config/src/instructions.ts`: `mergeInstructionContext`, which catches only a throw from `readFile`.
- `packages/config/src/skills/discover.ts`: `NODE_DISCOVERY_PORTS.readFile`, the lenient `utf8` decode. A strict
  decode (`new TextDecoder('utf-8', { fatal: true })` over the bytes) would throw and reach the existing warning.
- `packages/config/src/instructions.test.ts`: the REQ-WORKSPACE-045 case, which exercises a throwing port only.
- `apps/desktop/src/run-host/skills.ts`: `workspaceContext`, the only caller, which passes the node port.

## Repaired — 2026-09-28 (R-062)

`NODE_DISCOVERY_PORTS.readFile` (`packages/config/src/skills/discover.ts`) now decodes the bytes with
`new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })`. A file that is not UTF-8 throws, and the throw reaches
the warning path `mergeInstructionContext` already had for the I/O half: the path, the decoder's error, no block, the
walk not aborted. Nothing else about the port moved — a file that decodes reads exactly as before, a leading BOM
included (`ignoreBOM` keeps it in place, as `readFileSync(path, 'utf8')` did), so the only file whose outcome changed
is one that could not be decoded.

**What the same port does for a `SKILL.md` that is not UTF-8 (REQ-WORKSPACE-053).** It is skipped with the reason
`unreadable file: <the decoder's error>`, through the arm the walk already had for a throwing read, and discovery
continues — the reading this note suggested. The requirement lists "unreadable file" among its example reasons without
saying whether a decoding error is one; the build reads it as one, because the alternative — parsing frontmatter with
U+FFFD standing in for what the author wrote — is not the file the author wrote, and because REQ-WORKSPACE-045 names
the decoding error outright for the sibling walk that shares this port. That silence is raised as **OQ-76**
(`docs/architecture/open-questions.md`); a force-loaded body (REQ-WORKSPACE-062) and the disable manifest
(REQ-WORKSPACE-052) take the same arm through the same port, and so does a `SKILL.md` loaded by hand
(`loadManualSkill`, REQ-WORKSPACE-057/151): it now fails with "SKILL.md not found: {raw}" and the decoder's reason in
parentheses, the arm its I/O half already used, where it used to load with U+FFFD in its text. The `TextDecoder` rejects UTF-16 and UTF-32 as well, so a
`SKILL.md` saved in either — encodings YAML itself admits — is now skipped where it was previously parsed as mojibake.

**Tests that pin it, each red against the lenient port (checked by restoring `readFileSync(path, 'utf8')`):**
`packages/config/src/instructions.test.ts` — "REQ-WORKSPACE-045: a file that is not UTF-8 is a DECODING error through
the real port": the bytes `68 69 0a ff fe c3 28 0a` written to a temporary `AGENTS.md`, merged with a sibling
`CLAUDE.md` through `NODE_DISCOVERY_PORTS`, give the sibling's block alone, no U+FFFD, and one warning naming the path
and a non-empty error. `packages/config/src/skills/skills.test.ts` — "REQ-WORKSPACE-053 — a SKILL.md that is not UTF-8,
through the real port (OQ-76)": the same bytes as one skill's `SKILL.md`, a valid sibling discovered, the bad one in
`skipped` with `unreadable file: …` and its path; the same bytes loaded by hand through `loadManualSkill`, as a
directory and as the file, each failing with the "SKILL.md not found" sentence and a reason carrying no U+FFFD; and a
case that the port still reads non-ASCII UTF-8 and a BOM as it did. The built app's behaviour on such a file is not observed by a proof: `injection-proof`'s fixture holds no
undecodable file, and adding one was not in this item's scope.

Repaired 2026-09-28 under R-062, on the branch `fix-config-isolation-decoding`.
