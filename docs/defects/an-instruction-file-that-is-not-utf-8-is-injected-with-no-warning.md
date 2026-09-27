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
