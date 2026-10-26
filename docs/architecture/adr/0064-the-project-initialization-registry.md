# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-15
- **Origin:** `REQ-WORKSPACE-078` to `REQ-WORKSPACE-115`, not one of which was cited anywhere in this
  tree before this record. The `initialization:` and `project_init:` keys have been section-class in
  `packages/config/src/keys.ts` since Part I with **no reader behind either**;
  `packages/ui/src/WorkspaceView.tsx` has carried a `projectSetupPending` parameter no caller ever
  supplied, with `packages/ui/src/composer.ts` recording in a comment that nothing could pass `true`;
  and `packages/ui/src/settings/McpSettings.tsx` states in the product's own words that the machine-setup
  half of its action *"belongs with the onboarding task registry, which does not exist yet"*.
- **Depends on:** ADR-0002 (process topology — which process may do what), ADR-0035 (the bundled
  code-intelligence runtime and the three setup subcommands this registry's one task drives), ADR-0036
  and ADR-0037 (configuration loading, the section readers, and Tier A's single write path), ADR-0044
  (the IPC contract — channel 12 and the five commands), ADR-0049 (notices, for the background banner),
  ADR-0055 (startup sequencing — the slot `REQ-WORKSPACE-141` puts the resolution in).
- **Requirements:** `REQ-WORKSPACE-078`..`115`, `141`, `142`, `144`, `147`, `153`; `REQ-MCP-036`, `037`,
  `099`, `112`, `116`; `REQ-CONFIG-050`, `390`; `REQ-CHAT-007`; `REQ-SHELL-149`; `REQ-NOTIFY-008`.

## Parts

Since 2026-10-26 the rest of this document is in [`0064-the-project-initialization-registry/`](0064-the-project-initialization-registry/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0064-the-project-initialization-registry/01-context.md) | Context |
| [02](0064-the-project-initialization-registry/02-the-decision.md) | The decision; Why the core is in `config` and not in `workspace`; Why the task delegates rather than reimplements; Pushed, not polled |
| [03](0064-the-project-initialization-registry/03-consequences.md) | Consequences |
| [04](0064-the-project-initialization-registry/04-first-execution-2026-09-15-pnpm-init-proof-five.md) | First execution — 2026-09-15 (`pnpm init-proof`, five scenarios, all passed) |
| [05](0064-the-project-initialization-registry/05-on-linux-as-root-2026-09-28-pnpm-init-proof-r.md) | On Linux as root — 2026-09-28 (`pnpm init-proof`, R-062): a third order of the same race |
| [06](0064-the-project-initialization-registry/06-on-linux-as-root-2026-09-28-pnpm-init-proof-r-2.md) | On Linux as root — 2026-09-28 (`pnpm init-proof`, R-062): a third order of the same race *(continued, from "Measured")* |
