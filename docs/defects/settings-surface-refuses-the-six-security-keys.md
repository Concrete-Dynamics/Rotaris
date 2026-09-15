## The Security policy section refuses to edit the six sandbox and egress keys

The Settings screen's "Security policy" section draws one sentence in place of the controls it
owes: *"No confinement backend exists on this platform, so the six confinement and egress values
are read from the file and not edited here."* No selector, no list, no toggle, no problem label
and no availability label is rendered, on any platform.

The stated reason does not carry the omission. Four of the six keys — `network_egress_policy`,
`network_allowed_hosts`, `network_denied_hosts`, and `sandbox_writable_roots` — have nothing to
do with a confinement backend, and the egress half of the domain is built and enforced
(`packages/agent-tools/src/egress.ts`). The two that do relate to a backend are still stored on a
host that cannot honour them, by `REQ-SANDBOX-116`'s own instruction. The effect is that the one
screen the specification names as the reason a user never has to open a YAML file is the screen
that tells them to.

Noticed on 2026-09-15 while planning Part AR (OS-level confinement). Recorded, not repaired,
before the work that will repair it starts.

## Specs

- `REQ-SANDBOX-113` — the runtime section "exposes all six sandbox/egress settings so that no YAML
  has to be edited by hand", enumerating a sandbox-mode selector, a writable-roots list with entry
  field and add button, a network toggle, an egress-policy selector, allowed- and denied-host lists
  each with entry field and add button, and a per-list problem label. All six must round-trip.
  Nothing of this is drawn.
- `REQ-SANDBOX-114`, `REQ-SANDBOX-115`, `REQ-SANDBOX-117`, `REQ-SANDBOX-118` — per-control
  validation, the two teaching descriptions (deny wins; `*.example.com` does not match
  `example.com`), the confirmation before loosening the disposition to `allow`, and the
  unsaved-changes indication. Each is unreachable while the controls are absent.
- `REQ-SANDBOX-116` — the availability label, and its instruction that selecting a mode on an
  incapable host is *still stored*, which is the reason the section's own sentence gives for not
  drawing the control.
- `REQ-SANDBOX-130` — on a host with no confinement mechanism the product states the limit plainly
  "in its own words", on the settings surface, *without the user having to select a confinement
  mode first*. The present sentence is not that disclosure: it reports a missing editor, not that
  every agent command runs with the account's own privileges.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx:266-267`: the `Security policy` heading and the
  sentence that stands in for the section.
- `packages/config/src/sections/runtime.ts:47-48,80,152-153`: the six keys, their defaults and
  their load-time validation — already implemented, and what the controls would write through.
- `packages/config/src/writers.ts:197`: `SIX_SECURITY_KEYS`, the save path the section would use.
- `packages/ui/src/settings/config-state.ts`: the pending/dirty state the unsaved-changes
  indication of `REQ-SANDBOX-118` would hang from.
- `packages/ui/src/StartSessionDialog.tsx:45`: `NO_CONFINEMENT_DISCLOSURE`, the `REQ-SANDBOX-130`
  text the launch surface already carries and the settings surface does not.
