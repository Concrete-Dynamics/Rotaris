## The application answered yes to every device permission

Before 2026-10-30 `apps/desktop/src/main/` set no `setPermissionRequestHandler` and no
`setPermissionCheckHandler`, so Electron's own default answered **allow** to every permission a
renderer's page asked for: the camera, the microphone, notifications, midi, geolocation and the rest.

**Repaired 2026-10-30.** `apps/desktop/src/main/permissions.ts`, reached from `index.ts`, grants `media`
(audio) to the application's own pages only and the clipboard write the copy buttons use; everything else
is refused. `pnpm dictation-proof` reads the built app's grants. The first list refused the clipboard,
which is why `clipboard-read` is granted too — a write with no press behind it reaches the check handler
under that name — and that admits a clipboard read, recorded here rather than smoothed over.

## Specs

None directly. `REQ-SHELL-005` (the renderer is the only place a page is drawn) and ADR-0030 (main owns
the device-facing capabilities) both assume main grants what a page may reach; a default of "all" makes
that assumption false rather than contradicting a sentence.

## Relevant files

- `apps/desktop/src/main/permissions.ts`: the two handlers and the allow-list
- `apps/desktop/src/main/index.ts`: where the handlers are installed
- `apps/desktop/scripts/dictation-proof.mjs`: reads the grants from the built app
