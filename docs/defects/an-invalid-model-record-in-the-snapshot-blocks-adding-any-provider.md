## An invalid model record in the snapshot blocks adding any provider

Adding an OpenAI-compatible endpoint in Settings → Models failed with "Could not save provider
openai-compatible--deepseek-vpn: Invalid project snapshot at ...\project_settings.yaml: providers.deepseek.models[0]:
display_name must be a string" (2026-10-31, head `c583e1bc`, Windows 11). The file dated from 2026-08-18 and carried
`display_name: null` on its two model records of an unrelated provider. One bad record in a provider the owner was not
touching therefore refuses a save for a new one, and the message does not say what to do about it. A fresh profile, like the
live run's, never meets this, so the live run's sign-in passed while the owner's real profile could not add the endpoint.

Worked around on that machine by removing the two null lines, with the original kept as
`project_settings.yaml.bak-2026-10-31`. The product is not repaired (record-only).

## Specs

REQ-PROVIDER-084 and REQ-PROVIDER-085 make the parse strict, so the refusal itself may be as specified. Whether a null optional
field should be read as absent, and how a person recovers from an invalid snapshot from this dialog, is not established here.

## Relevant files

- `packages/config/src/project-settings.ts` — `parseSnapshot`, and the model record's `display_name` check.
- `packages/providers/src/project-settings.test.ts` — the strictness tests.
- `packages/providers/src/project-settings.ts` — `upsertProvider`, which reads the whole file first, so an unrelated record refuses the save.
- `packages/providers/src/signin.ts` — composes "Could not save provider".
