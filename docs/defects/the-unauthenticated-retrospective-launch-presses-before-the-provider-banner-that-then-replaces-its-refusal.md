## The unauthenticated retrospective launch presses before the provider banner that then replaces its refusal

`live-run.mjs`'s `ask-retrospective-unauth` launch (PD-LIBRARY-002 revision 5, OQ-300) presses the Library's retrospective
gesture as soon as the control is enabled, and reads the refusal from the one notice on screen at the end. Nothing orders the
press after the shell's own first-launch notice: with the credential file moved aside, the open's notice slot reads
"providers: 0 authenticated" and posts "No model provider is authenticated yet" (REQ-WORKSPACE-152 (3)), an info notice that
replaces whatever stands in the single slot (REQ-NOTIFY-024). When the press wins that race, the refusal is posted first and
replaced 100 ms later, the capture's 60 s wait for the refusal text times out, and the check fails with "0 refusal notice(s)"
over a product that did post it.

Seen in the acceptance default run at `b9e3005` (pack `2026-10-14T13-37-17-899Z`, `ask-retrospective-unauth/app.log`): the press
at 13:40:15.903, `diagnostics: notice #1 error "Provider authentication required"` at 13:40:15.953, `providers: 0 authenticated`
at 13:40:16.059 and `notice: No model provider is authenticated yet` at 13:40:16.061, then the wait timed out after 60000 ms and
the probe read only notice #2. At `3c3f447` (lines 20 to 23 of the same file) the banner came first (16:00:48.701) and the
refusal replaced it (.711), so the check passed. Acceptance round 1 of fin46 (finding L6, harness defect, degrades). Recorded
2026-10-14 by fin46 (`fin46-accept1-4`).

## Specs

None contradicted by the product: the newest notice replaces the one standing (REQ-NOTIFY-024), and the refusal PD-LIBRARY-002
revision 5 owes was posted. The defect is the harness's: its check reads a slot it lets another notice take.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `ask-retrospective-unauth` launch's `ROTARIS_CAPTURE_CLICKS`, which press the gesture
  with no precondition on the banner.
- `apps/desktop/scripts/lib/analysis-reading.mjs` — `refusalWait` and `retrospectiveRefusalVerdict`, which read the notice on screen.
- `apps/desktop/src/main/index.ts` — the open's notice slot raising `NO_PROVIDER_HEADLINE` once providers are counted.
