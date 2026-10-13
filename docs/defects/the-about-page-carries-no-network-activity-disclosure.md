## The About page carries no network-activity disclosure

The About & Legal surface (`Settings → About`, reached from the palette's "About & Legal" entry) draws three sections:
the product's identity, the legal documents and the licence. It says nothing about what the application puts on the
network. REQ-STARTUP-160 requires that surface to carry, as static text drawn from local data, three statements: what
first-launch machine setup and cache warm-up may contact, that a supported standalone build asks the release endpoint for
a newer release each time a window is activated and that this cannot be turned off, and that these requests can expose
connection metadata such as an IP address but never project files, prompt text or provider credentials.

The record also claims the opposite. The repaired note
`docs/defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md` ends "About & Legal's disclosure
needs no change", which assumes a disclosure that was never built.

Found 2026-10-13 by the survey of what is left to do (item N30, verified at `main` `6de2a67`); recorded by fin41 before
the repair.

## Specs

- **REQ-STARTUP-160** — unmet: the application does not itself disclose the network activity the startup document
  specifies, and About & Legal (REQ-STARTUP-141, REQ-SHELL-140) carries no such text.
- Its three statements cite REQ-STARTUP-058, REQ-STARTUP-064 and REQ-STARTUP-084 (setup and warm-up), REQ-STARTUP-105,
  REQ-STARTUP-111 and REQ-STARTUP-114 (the update check). Those mechanisms are not the defect; the missing statement of
  them is.
- REQ-SHELL-022's minimum window size bounds where the text must stay reachable and labelled.

## Relevant files

- `packages/ui/src/settings/About.tsx` — the About & Legal surface; its three sections and nothing else.
- `packages/ui/src/settings/About.test.ts` — the surface's render test, which has no case for a disclosure.
- `apps/desktop/scripts/settings-proof.mjs` — the built-app proof of the About page, which asserts no disclosure.
- `docs/defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md` — line 90's "needs no change".
- `apps/desktop/src/main/updater/{feed,updater,electron}.ts` — the update check the disclosure describes (REQ-STARTUP-105,
  REQ-STARTUP-111, REQ-STARTUP-114).
- `packages/config/src/setup-manifest.ts`, `packages/config/src/mcp/code-intelligence.ts` — the pins the setup clause
  describes (REQ-STARTUP-058).
