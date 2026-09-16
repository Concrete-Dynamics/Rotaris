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
  the platform's native error box and wedges the loop (ADR-0019).
- **A command is answered for the window that raised it** — `windowFor(senderId) ?? activeWindow()`, not
  "the main window" (`REQ-SHELL-020`). With two main windows alive those are different answers.
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
