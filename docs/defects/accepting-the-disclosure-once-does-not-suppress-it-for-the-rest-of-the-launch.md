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

**Amended 2026-10-02 (fifth triage of the open notes; reproduced in the built app the same day).** The triage reproduced
it by code trace: main reads only the two preferences, and the board keeps nothing after a plain acceptance, so the next
card's preview reads `due` and the dialog is shown again. Bundle `fin9-queue-dispatch-and-disclosure` then confirmed it
in the built app with `requirements-proof`'s new `disclosure-launch` stage, before repairing: REQ-101 released and its
disclosure accepted with "Start the run", then REQ-102 released in the same launch, and the disclosure was on screen
again for REQ-102 ("Before this run starts", its worktree `…-req-102-u1`, the buttons "Abandon", "Start, and do not show
this again" and "Start the run").

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
