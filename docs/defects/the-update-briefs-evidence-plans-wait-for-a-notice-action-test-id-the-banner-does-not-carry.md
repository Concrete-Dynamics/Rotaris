## The update briefs' evidence plans wait for a notice-action test id the banner does not carry

`docs/design/briefs/notice-banner.md` §11 (and the `title-bar-and-rail.md` §11 it shares) reach the failure faces with
`waitFor` on `[data-testid="notice"][data-severity="error"]` "with and without `[data-testid="notice-action"]`". The banner's
action control carries no `data-testid`: `packages/ui/src/Notice.tsx` gives it `data-action="<member>"` and the layout
contract id `data-ui="notice-action"`. A drive written from the brief waits out its 15 s bound and reports the face missing
when it is drawn (met on 2026-11-21 while capturing R-117's Stage 2 faces; `[data-testid="notice"] [data-action="install-update"]`
reaches row 4, and the absence of `.notice__action` row 4′).

Found while doing other work; not repaired here — the brief is `design-ui`'s record to correct.

## Specs

None contradicted: the selector is evidence wording, not a requirement. The briefs' own "never a sleep" rule is what the
wrong selector defeats.

## Relevant files

- `docs/design/briefs/notice-banner.md` §11 — names `[data-testid="notice-action"]`.
- `packages/ui/src/Notice.tsx` — the action control's attributes (`data-action`, `ui={{ id: 'notice-action' }}`).
