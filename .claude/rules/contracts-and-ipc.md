---
paths:
  - "packages/contracts/**/*.ts"
  - "apps/desktop/src/main/**/*.ts"
  - "apps/desktop/src/preload/**/*.ts"
---

# What crosses a boundary

Every cross-process shape is a schema in `contracts`, and the two directions are not symmetrical.

- **Outward is one channel.** A renderer command is a member of `CommandRequestSchema`, discriminated on
  `kind`; the answer is always `CommandOutcomeSchema`. A request that does not parse is
  `command.malformed`, and **nothing throws out of `runCommand`** — an uncaught exception in main raises
  the platform's native error box and wedges the loop (ADR-0019); a throwing handler is `command.failed`.
- **Every string a command carries has a bound** from `contracts/src/limits.ts` (OQ-467) — free text, path or name, a
  list by its count, an open-shaped payload by `jsonBounded` — and `limits.test.ts` fails a new field left without one.
- **A command is answered for the window that raised it** — `MainWindows.forCommand(senderId)` (a dialog: its
  parent's), not "the main window" (`REQ-SHELL-020`). With two main windows alive those are different answers.
- **The sender is checked by origin, not by id alone** (R-091, checklist 17): a `senderFrame` that is not
  `isApplicationPage` (OQ-466), or in a packaged build a sender no main window stands behind, is refused
  `command.untrustedSender` before `runCommand` (`main/command-sender.ts`). A window that sends commands is
  registered in `MainWindows` or built with `parent`.
- **The preload is not a stop for a command** — it exposes one `command` method for every kind. Only a
  new *channel* adds a method there, and **the preload renumbers nothing and re-derives nothing**:
  sequence numbers are the producer's, payloads pass through untouched (ADR-0044).
- **A delivery bound is one budget across every window taken together**, never one per window. Getting
  that backwards was defect T2-1.
- **One notice slot.** A second persistent notice replaces; it does not stack. A transient
  acknowledgement carries exactly one action. Both vocabularies are closed enumerations — widening one
  is a decision, not an edit.
- Main **never** opens the store, never reads `agents.yaml`, and never hands a credential to a renderer
  (W-01). `main` cannot import `ui`/`ui-core`: pre-paint theme data lives in `contracts/src/theme/`.

Ordered edit paths: `docs/architecture/views/04-seams.md` §1 (command), §2 (channel), §6 (notice),
§7 (preference). Evidence: `pnpm app:drive command …` drives `runCommand` by the renderer's own path.

The two schemas' guard is their property tests, `commands.property.test.ts` and `process-protocol.property.test.ts`: every
`kind`, generated from the schema itself, parses and survives a JSON round trip whole; no input makes `safeParse` throw;
a non-object is refused; an unknown top-level key is **stripped**, not refused — a new kind or field is covered there
without an edit, and one the generator cannot meet fails by name.
