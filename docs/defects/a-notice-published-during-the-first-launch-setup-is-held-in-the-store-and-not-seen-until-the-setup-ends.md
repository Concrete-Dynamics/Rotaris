## A notice published during the first-launch setup is held in the store and not seen until the setup ends

On a fresh profile the built application opens on the first-launch setup (PD-WORKSPACE-010). An update notice published
then — here through the driver's face seam (`pnpm app:drive updateFace link-only`) — is current in main's notice store and
present in the window's DOM (`[data-testid="notice"]` measured at x 12, y 52, 1376 × 59.25 at 1400×900), but the setup
covers it: the screenshot shows only the setup's steps. It appeared once `Skip setup` was pressed. An update check runs on
the first window's post-show activation (REQ-STARTUP-114), so on a link-only or updatable build's first launch an offer
found by that check is out of sight for as long as the setup lasts, and nothing announces it.

Met on 2026-11-21 while capturing the link-only face (R-117, Stage 3). Not investigated beyond the observation; not repaired
here.

## Specs

Unestablished. REQ-NOTIFY-023/024 put a persistent notice in the window's one slot, and PD-WORKSPACE-010 withholds only
REQ-WORKSPACE-152 (3)'s provider notice during the setup; no record found says another notice waits behind the setup or
shows over it. A question for the setup's owner rather than a measured breach.

## Relevant files

- `packages/ui/src/Notice.tsx` — the banner, rendered in the shell beneath the setup.
- `apps/desktop/src/renderer/main.tsx` — where the setup stage and the shell are composed.
- `docs/product/directives/pd-workspace-010.md` — the first-launch setup and the one notice it withholds.
- `apps/desktop/src/main/updater/updater.ts` — the check on the first window's activation that can publish during the setup.
