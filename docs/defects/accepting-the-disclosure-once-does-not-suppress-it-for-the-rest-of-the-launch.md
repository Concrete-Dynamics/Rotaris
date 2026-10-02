## Accepting the disclosure once does not suppress it for the rest of the launch

The board asks for the elevation's disclosure again on every card whose first run-starting action is taken in the same
launch of the application, after the person accepted it (not permanently) on an earlier card. Nothing remembers a
plain acceptance beyond the card it was given on:

- main's launch preview (`apps/desktop/src/main/requirements-runs.ts`, `preview`) and its standing disclosure
  (`standingDisclosure`) read only the two preferences: `off` with the elevation switched off, `suppressed` once
  accepted permanently, else `due`. A plain acceptance writes no preference and main holds nothing for it;
- the board (`packages/ui/src/requirements/RequirementsView.tsx`, `acceptLaunch`) sends `disclosure: 'accepted'` on the
  one card's act or release, and its own comment says "accepting suppresses the disclosure for the rest of THIS
  launch", but it keeps nothing either, so the next card's preview reads `due` and the dialog is shown again;
- the workspace service (`apps/desktop/src/workspace-service/delivery.ts`) records the acceptance on that card's
  `Launch` only. After a restart, a second card whose launch the recovery rebuilt reads "have not been disclosed and
  accepted" on the queue even after the person accepted the first card's disclosure in this launch.

Found by code reading on 2026-10-02 (a verifier's optional finding on bundle `fin7-queue-and-roles`, repair round 3),
following the preview, the standing disclosure and the board's accept path; not reproduced in the built app. The gap
predates that bundle, which neither widened nor repaired it. Not repaired.

## Specs

- `REQ-TRACE-472`: "Accepting SHALL suppress the disclosure for the remainder of that launch, and accepting it
  permanently SHALL suppress it in subsequent launches too." "Launch" is read here as a launch of the application, as
  "subsequent launches" requires; only the permanent half is implemented.

## Relevant files

- `apps/desktop/src/main/requirements-runs.ts`: `standingDisclosure` and `preview`, the two places that decide `due`
  from the preferences alone.
- `packages/ui/src/requirements/RequirementsView.tsx`: `acceptLaunch` (the plain acceptance, and the comment that claims
  the suppression) and `discloseFromQueue`.
- `packages/ui/src/requirements/panes/presentation.ts`: `disclosureFor` (shows the dialog whenever the preview reads `due`).
- `apps/desktop/src/workspace-service/delivery.ts`: `disclosed` and the per-card `Launch.disclosure`.
