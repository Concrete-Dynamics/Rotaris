---
req-id: SWR-3718
status: draft
trace: required
test: required
title: "First-run provisioning makes automatic network activity explicit"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3718 — First-run provisioning makes automatic network activity explicit

SWR-3715 may contact external distribution services before the main Rotaris
window opens in order to provision missing tools and warm package caches. The
first-run experience shall make that automatic network activity understandable
and inspectable without requiring knowledge of Rotaris internals.

## Scope

- **In scope**: the bundled desktop first-run setup UI, its explanation of
  automatic downloads, the displayed destination/service information, and access
  to privacy information before the main window opens.
- **Out of scope**: provider requests caused by a user's configured model,
  Rotaris Cloud backend traffic, payment/account traffic, and server-side
  processing.

## Behaviour

**The setup explains why network access can occur.** Before or while provisioning,
the setup window states that Rotaris may download missing local tooling and warm
package caches required by configured MCP servers. It must not describe this as
provider/model traffic.

**The concrete destination is inspectable.** For every automatic download or
cache warm-up, the details view exposes the tool/package being resolved and the
network destination hostname when known. This includes the official release
locations used for `uv`, Git, Node and ripgrep and package registries reached by
`uvx` or `npx` warm-ups.

**The setup does not imply project-content transfer.** The UI explains that this
machine-setup traffic is for acquiring tooling and packages and is separate from
later AI-provider traffic. Workspace files, prompts and provider credentials must
not be intentionally attached to setup download requests.

**Privacy information is reachable before the main window.** Because SWR-3715
runs before the normal desktop surface, the setup window provides a `Privacy`
action that opens the canonical Privacy Policy in the system browser.

**Network failure remains non-blocking.** The transparency additions do not
change SWR-3715's offline/degraded behaviour: if external services cannot be
reached, the user can continue into Rotaris with the affected features degraded.

## Acceptance criteria

- **AC-001**: A first-run setup that will download at least one tool tells the
  user that external network access may occur for machine provisioning.
- **AC-002**: The details view identifies each automatic download/warm-up by
  tool or package and shows the destination hostname when it is known.
- **AC-003**: The setup distinguishes tooling/package acquisition from AI-provider
  requests and does not claim that prompts or workspace contents are required for
  provisioning.
- **AC-004**: A Privacy action is reachable from the setup window before the main
  application opens.
- **AC-005**: Opening the Privacy action is user initiated; simply rendering the
  explanatory setup UI adds no extra network request beyond the provisioning
  operations already required by SWR-3715.
- **AC-006**: Offline and failed-download flows still allow `Continue without it`
  as specified by SWR-3715.
- **AC-007**: Destination/service details are copyable text and remain available
  in the setup log after a failed step.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Planned setup steps expose a displayable tool/package and destination hostname | Setup plan → presentation model | `apps/rotaris/tests/test_setup_network_disclosure.py` |
| Integration | Tool downloads and uvx/npx warm-ups appear in the details log without workspace or provider data | Setup runner → setup UI event stream | `apps/rotaris/tests/test_setup_network_details.py` |
| User-flow E2E | A fresh bundled install sees the network explanation, opens Privacy, inspects destinations and continues after an offline failure | First-run setup window | `apps/rotaris/tests/test_first_run_network_transparency.py` |

Depends on: [SWR-3715 — A bundled install provisions the machine once, before the app opens](../3000-distribution-updates/SWR-3715-first-run-machine-setup.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
