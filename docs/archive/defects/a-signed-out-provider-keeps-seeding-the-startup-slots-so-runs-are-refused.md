## A signed-out provider keeps seeding the startup slots, so runs are refused

Signing out of a provider deletes its credential and leaves its record in `project_settings.yaml` marked
`authenticated: true` with its slot picks. The configuration layer seeds the startup slots from every record so marked,
in ascending order of provider id, the first non-null winning. With two providers signed in and the first by id then
signed out, the slots still name the signed-out provider's models, the lease reports it unresolved, and every run is
refused with "Provider authentication required — Authenticate at least one configured provider before starting a run."
although another provider is authenticated. Seen 2026-11-20 on a scratch profile: `codex` and `copilot` signed in,
`codex` signed out, the next run refused; removing the `codex` record by hand let the run start on `copilot`.

## Specs

REQ-PROVIDER-102 and REQ-PROVIDER-060 (sign-out never touches the snapshot) read with REQ-PROVIDER-091 (each
authenticated snapshot provider's slot picks seed the root slots) and REQ-WORKSPACE-137. The requirements are each met
as written; together they leave the snapshot's `authenticated` flag saying something the credential store no longer
does. No requirement says which of the two is the truth for slot seeding.

## Relevant files

- `packages/providers/src/signin.ts` — `signOut` deletes the credential and nothing else.
- `packages/config/src/project-settings.ts` — `snapshotLayer` reads `authenticated` from the snapshot record alone.
- `apps/desktop/src/run-host/launch.ts` — the refusal when the entry model's sign-in provider was not leased.

## Repaired

2026-11-21, by [`PD-PROVIDER-003`](../../product/directives/pd-provider-003.md#pd-provider-003) clause 4: sign-out marks the record `authenticated: false`. Seen in the built application: after signing out of `claude-code` its record read `authenticated: false`.
