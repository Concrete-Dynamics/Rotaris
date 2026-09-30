## The start-session dialog draws REQ-SANDBOX-130's "this host cannot confine anything" on a Linux or macOS host whose launcher is only missing

`packages/ui/src/StartSessionDialog.tsx` draws `NO_CONFINEMENT_DISCLOSURE` whenever `confinement?.available !== true`.
That condition is true in four cases:

- a Linux host without `bwrap`;
- a host whose trial failed;
- a host whose verdict has not been taken yet (`confinement === null`);
- a host with no mechanism at all.

REQ-SANDBOX-130's disclosure belongs to the last case only. Its sentence, "no value of the sandbox mode changes that
here … the answer changes only when the workspace runs on a host Rotaris can confine", is untrue on a Linux host where
`sudo apt-get install bubblewrap` changes the answer. The settings surface draws the same disclosure only when
`confinement.backend === 'unavailable'` (`packages/ui/src/settings/SecurityPolicy.tsx`), so on such a host the two
surfaces REQ-SANDBOX-130 names disagree.

Read from the code on 2026-09-28. Not measured in the built app: `sandbox-proof` asserts the settings surface only,
and it found the disclosure correctly absent there on Linux both with and without `bwrap`.

## Specs

This contradicts REQ-SANDBOX-130, which scopes the disclosure to "a host for which no confinement mechanism exists at
all" and requires "the same" fact "on both surfaces". It also contradicts REQ-SANDBOX-071, under which every surface
presents the same availability text. On a Linux host with a missing launcher or a failed trial, the dialog already
carries the mechanism's own reason and remediation (REQ-SANDBOX-119), and that text is correct.

## Relevant files

- `packages/ui/src/StartSessionDialog.tsx`: the `start-session-disclosure` condition.
- `packages/ui/src/settings/SecurityPolicy.tsx`: the settings surface's condition, `backend === 'unavailable'`.
- `packages/contracts/src/confinement.ts`: `NO_CONFINEMENT_DISCLOSURE`.

Noticed 2026-09-28 under R-062 while repairing `sandbox-proof` for Linux. Not repaired, because it is outside that
harness-only task.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Both surfaces now read one predicate, `owesNoConfinementDisclosure`
(`packages/contracts/src/confinement.ts`, beside `NO_CONFINEMENT_DISCLOSURE`). It is true only for a verdict whose
backend is `unavailable`, which is REQ-SANDBOX-065's no-mechanism case. The launch dialog now draws the disclosure
under that predicate instead of under `available !== true`, and the settings surface uses the same predicate in
place of its own inline condition, so the two surfaces can no longer disagree. On a host with a mechanism that is
unusable, the dialog carries only that mechanism's own reason and remediation (REQ-SANDBOX-119), as it already did.
Before the verdict arrives, the dialog states nothing.

Pinned by `packages/ui/src/start-session-disclosure.test.ts`, whose five cases render the dialog for each verdict
shape; three of them fail on the code before the repair. Also pinned by `sandbox-proof`'s new scenario 2b, which
reads the launch dialog in the built app, as root under Xvfb:

- **Linux with `bwrap` moved out of `PATH`:** the build before the repair went red on this check ("the launch dialog
  drew REQ-SANDBOX-130's no-mechanism disclosure on linux"). After the repair it is green: no disclosure, and the
  control is disabled with the launcher-missing reason and both install lines.
- **Linux with `bwrap`:** green, with no disclosure, no reason, and the control enabled.

The one run that went red after the repair failed in scenario 5, not in this check. It ran without `bwrap` while
another workflow loaded the host (load average 4.2). Its selects were chosen but its Save never matched. Re-run once
alone, the proof was green. That is consistent with the open
[`the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`](../the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md),
which names `sandbox-proof`, but the run did not establish that it was the cause.
