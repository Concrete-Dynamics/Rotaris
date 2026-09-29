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
