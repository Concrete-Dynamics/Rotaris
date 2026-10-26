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

## Outcome

*Repaired 2026-10-13 (fin41).* `AboutSettings` (`packages/ui/src/settings/About.tsx`) draws a fourth section, **Network
activity**, after Licensing: a `<section>` labelled by its own `settings__heading`, holding REQ-STARTUP-160's three
statements as plain paragraphs at the surface's own type token (`.about__value`). The text is held in the renderer bundle
(`NETWORK_DISCLOSURE`) and depends on no fact main supplies, so it draws before `shell.hello` answers and with the network
blocked. Nothing in it is a modal, a disclosure control, a checkbox, a button or a tooltip, and it names no host.

The setup statement names a third moment beside the requirement's two, "the first time a tool is needed", because that is
when this build makes such a request: machine setup and cache warm-up are not built (OQ-73), while a pinned tool-server
package and the code-intelligence runtime's language servers are fetched at first use. Raised as
[OQ-261](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-261) with that reading; the wording follows its ruling.

*Reported in place 2026-10-14 (fin43, `fin43-notices-and-config`):* OQ-261 was ruled 2026-10-13 under
[R-072](../../product/requests.md#r-072) as [`PD-STARTUP-006`](../../product/directives/pd-startup-006.md#pd-startup-006), and the setup
wording now follows it: "The first time a tool is needed, such as a tool server or a language's code intelligence, it may be
downloaded from the package registry that serves it, and only when this machine does not already have it." It no longer
names first launch, cache warm-up or the tool-archive hosts, which this build does not carry, and so no longer disagrees with
the notices file opened from the same page. `About.test.ts`'s setup case (red on the old wording) and `pnpm settings-proof`'s
launches 1 and 1″ pin it (three statements, no host, 611 characters selected at 1000×680, load 0.9).

**Pinned by** `packages/ui/src/settings/About.test.ts` ("the network-activity disclosure on About & Legal"), whose section
cases are red on the surface without the section, and by `pnpm settings-proof`'s launch 1″: the built app at REQ-SHELL-022's
1000×680 content size, where a real pointer selection dragged across the section after it is scrolled into view reads the
heading and all three statements (683 characters, 2026-10-13, load 0.8 with nothing else running), and launch 1 reads the
same three at the default size. The stale "needs no change" in
`docs/defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md` is corrected in place.
