## resilience-proof's auth-fallback-minimum reads two of three prompt controls through the log's redaction

## Outcome: repaired 2026-11-21 (R-119's branch, `feat/r-117-web-search-setup`)

The harness, not the product. Found and repaired the same day.

`pnpm resilience-proof` failed `auth-fallback-minimum: the prompt's own controls are not all usable at 1000x680` on the
Linux agent host, on `main` and the branch alike. The probe wrote `reauth-key=ok|Keep the fallback=ok|Re-authenticate=ok`;
the application log runs every line through the redaction pass (REQ-TOOLS-171, since 2026-11-01), which masks the token
after a name holding a REQ-TOOLS-172 secret segment (`key`), so the line read `reauth-key=*** the fallback=ok|…` and
split into two entries where the API-key prompt has three. The capture showed all three controls on screen and usable.
The probe now writes `label status` (a space, not `=`), which the pass leaves alone, as `lib/logged-text.mjs` records
for the same class. `pnpm resilience-proof` green on this host, 2026-11-21; its `auth-fallback-plan` variant, which the
red had kept from running, green with it.

## Specs

None contradicted. REQ-TOOLS-171 and REQ-TOOLS-172 are what the log did.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: `chromeUsable`'s `promptControls` and the check reading it.
- `apps/desktop/scripts/lib/logged-text.mjs`: the earlier repair of the same class.
