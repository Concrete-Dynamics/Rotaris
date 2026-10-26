# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Unresolved conflict between slices

Part 5 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## Unresolved conflict between slices

**UI proposed that terminal-input audit logging "happens on the input side, in the main process".** That
contradicts two decisions and one requirement, and SR-1 narrows the disagreement without settling it.
`REQ-EVENTS-098` makes the right to write a session's history exactly the right to hold its lock, and
ADR-0002 keeps the lock in the run host; `REQ-TOOLS-078`'s ordering and immutability rules require
**one** writer per kind per session, and two producers writing from two processes would break both.

- **UI's position:** main owns the terminal input path and writes the entry there, and "it must not be
  possible for the renderer to write the audit log directly".
- **EXEC's position, adopted:** both producers go through the same writer in the run host. The
  renderer's submitted line is redacted through the shared pass of ADR-0007 and forwarded — main relays,
  the run host writes.

UI's underlying concern is satisfied by the adopted position and more strongly than before: the renderer
is sandboxed, has no filesystem, and now has no database connection either (ADR-0044). The disagreement
is only about which process holds the pen, and the lock rule settles it. **Under SR-1 the two processes
are main and the run host inside one instance** rather than two rival instances, which removes the
multi-instance framing from the argument but not the argument: one writer per kind per session is still
what the ordering and immutability rules require, and under `REQ-SESSION-199` it is additionally what
makes the exported ordinal series meaningful.
