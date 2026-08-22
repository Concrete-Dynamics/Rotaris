---
req-id: SWR-3716
status: draft
trace: required
test: required
title: "The first launch offers Rotaris Cloud and lets the user in without it"
epic: SWR-2000
date: 2026-08-22
---

# SWR-3716 — The first launch offers Rotaris Cloud and lets the user in without it

Once SWR-3715 has provisioned the machine, Rotaris opens on a workspace it can
render and cannot run: no provider is configured, so the first prompt the user
sends fails on a missing credential, and the path to fixing it is buried in
Settings behind a list of providers that means nothing to someone who has just
installed the product. Rotaris Cloud is the recommended provider (SWR-745) and
is one browser round trip away (SWR-781), but nothing says so at the moment it
matters.

Rotaris shall greet a user with no usable provider with a **first-launch
guide**: one screen, one recommendation, and a door out of it that leads into
the application rather than back to the same screen.

## Scope

- **In scope**: the guide's trigger, its content, the skip path and what the
  application looks like after a skip, how the guide is reached again later, and
  the equivalent for the non-GUI entry points.
- **Out of scope**: the credential flows themselves — Rotaris Cloud OIDC
  (SWR-781), subscription providers and API-key providers already exist and the
  guide calls them. Machine provisioning (SWR-3715). Workspace initialization
  (SWR-2800). Any tour of the application's features: this guide is about being
  able to run, not about teaching the six views.

## The guide

**It appears exactly when it is useful.** The guide opens on a launch where no
provider credential is usable — the classification SWR-3711 already computes,
without an event loop, so the decision costs the launch nothing. A user who has
a working credential never sees it.

**One recommendation, stated as one.** The primary card is **Rotaris Cloud**,
marked as recommended, with a single sentence on what it gets the user and one
action. Choosing it runs the existing Authorization Code + PKCE browser sign-in
(SWR-781); on return the guide confirms the signed-in account and its credit
(SWR-780), selects a working default model, and closes into the application.

**The alternatives are present but quiet.** `Other providers` is a collapsed
disclosure listing the built-in providers Rotaris already supports; expanding it
and picking one runs that provider's existing credential flow. `I have an API
key` leads directly to key entry for an OpenAI-compatible or built-in provider.
Neither adds a new authentication path.

**Skipping is a supported outcome, not an escape hatch.**
`I'll choose a provider later` closes the guide and opens the application in its
normal state: every view works, the workspace loads, nothing is half-configured
and nothing is disabled that does not need a provider. The application is not a
shell behind a nag.

**Having skipped, the user is reminded once and never nagged.** After a skip the
guide does not reappear on the next launch. Instead the application carries a
dismissible `Set up a provider` notice with one action that reopens the guide,
Settings → Providers carries the same entry point permanently, and any surface
that cannot start a run without a credential says the credential is missing and
offers that one action — instead of failing on the first prompt with a provider
error.

**Nothing leaves the machine until the user acts.** The guide makes no network
request on open: no telemetry, no availability probe, no account lookup. The
first request is the one the user's chosen action makes.

**It obeys the same interface rules as everything else.** Every control has an
accessible name and is reachable by keyboard, `Esc` skips, focus starts on the
recommended action, state is conveyed by text and shape rather than colour
alone, and no state renders as a blank card — including a sign-in that fails or
is cancelled, which returns to the guide with the reason and the same three
choices intact.

**The non-GUI entry points get the sentence, not the screen.** `rotaris-cli` and
`rotaris-headless` never open the guide and never block on one; when no
credential is usable they print the one-line instruction naming the sign-in
command and exit non-zero.

## Acceptance criteria

- **AC-001**: A launch with no usable provider credential opens the guide; a
  launch with one does not.
- **AC-002**: The guide presents Rotaris Cloud as the recommended provider with
  a single primary action, an `Other providers` disclosure listing the built-in
  providers, an `I have an API key` path, and a skip.
- **AC-003**: Completing Rotaris Cloud sign-in from the guide leaves the user
  signed in with a usable default model selected, and closes into the
  application.
- **AC-004**: A failed or cancelled sign-in returns to the guide, states the
  reason as copyable text, and leaves all three choices available.
- **AC-005**: Skipping opens the application fully — every view usable, nothing
  disabled that does not require a provider — and the guide does not reopen on
  the next launch.
- **AC-006**: After a skip, the application shows a dismissible notice whose
  action reopens the guide, and Settings → Providers offers the same entry
  point permanently.
- **AC-007**: With no provider configured, a surface that would start a run
  says the credential is missing and offers the action that reopens the guide,
  rather than starting a run that fails on a provider error.
- **AC-008**: Opening the guide issues no network request; the first request is
  the one the chosen action makes.
- **AC-009**: Every control has an accessible name, the guide is fully operable
  by keyboard, `Esc` skips, and no state renders blank.
- **AC-010**: `rotaris-cli` and `rotaris-headless` with no usable credential
  print a one-line instruction and exit non-zero without opening a window.

## Test portfolio

| Level           | Productive scenario                                                                                                                    | Exercised boundary                                            | Planned/covering test                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Unit            | The guide opens only when no credential is usable, and renders every state — offered, signing in, failed, skipped — without a blank card | Guide widget over a credential-status model                     | `apps/rotaris/tests/test_first_launch_guide.py`          |
| Integration     | Choosing Rotaris Cloud runs the existing PKCE sign-in and leaves a signed-in account with a default model; a cancelled sign-in returns to the guide | Guide → `AuthManager` → provider settings, with the browser and network faked | `apps/rotaris/tests/test_first_launch_guide_signin.py`   |
| User-flow E2E   | A first-time user skips the guide, uses the application, is told why a run cannot start, reopens the guide from that notice and signs in | Real `MainWindow` driven by accessible name, network faked      | `apps/rotaris/tests/test_first_launch_skip_flow.py`      |

Depends on: [SWR-3715 — A bundled install provisions the machine once, before the app opens](../3000-distribution-updates/SWR-3715-first-run-machine-setup.md)

Depends on: [SWR-3711 — Credential status is classified without an event loop](../700-providers-auth/SWR-3711-credential-status-without-event-loop.md)

Related: [SWR-781 — Standard Keycloak OIDC authorization-code authentication](../700-providers-auth/SWR-781-standard-keycloak-oidc.md), [SWR-780 — Rotaris Cloud account credit-status reads](../700-providers-auth/SWR-780-cloud-account-status-reads.md), [SWR-3013 — Rotaris Cloud credit is visible before it runs out](SWR-3013-cloud-credit-surface.md), [SWR-745 — Rotaris Cloud as a first-class built-in provider](../700-providers-auth.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
