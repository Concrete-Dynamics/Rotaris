## The Settings save bar scrolls out of view with its category

Found on 2026-11-11 by the independent critique of the providers card (UIR-404,
[the Settings brief](../design/briefs/settings.md), "Critique 2026-11-11, of the providers card") and measured the same
day; not repaired, since the round was bounded to that card and the bar belongs to every category.

The save bar (the save status, Save and Discard) is the first child of the category body, which is the element that
scrolls, and it has no rule that holds it in place (`.save-bar` in `packages/ui/src/shell.css`; computed `position:
static`). A category taller than the view therefore carries the bar away with its content. Measured on the built
application (`pnpm app:drive`, Settings › Models at 1000×680, one unsaved change made on Runtime): the body is 495 px
with 1,097 px of content; at the top the bar stands at y 139; scrolled to the end it stands at y −463, 602 px above
the view, and neither Save nor Discard nor the status "Unsaved changes" is on screen. A person who changes a model slot
near the foot of the category sees no sign that anything is unsaved.

## Specs

REQ-CONFIG-270: "Save, Discard and the save-status indicator are visible and operable from every category: no
category's own content can push them out of view".

## Relevant files

- `packages/ui/src/SettingsView.tsx` — the save bar's place inside `.settings__body`.
- `packages/ui/src/settings/ConfigSettings.tsx` — `SaveBar`.
- `packages/ui/src/shell.css` — `.save-bar`, `.settings__body`.
