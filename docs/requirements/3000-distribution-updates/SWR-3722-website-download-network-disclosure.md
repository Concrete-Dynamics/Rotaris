---
req-id: SWR-3722
status: draft
trace: required
test: required
title: "The official download page discloses automatic network access without degrading the download UX"
epic: SWR-3000
date: 2026-08-23
---

# SWR-3722 — The official download page discloses automatic network access without degrading the download UX

Rotaris performs limited automatic network access that is relevant before a user
runs a downloaded standalone build: SWR-3715 can fetch missing local tools and
warm package caches on first launch, and SWR-3003 checks GitHub for a newer
version on every standalone desktop launch. The official Rotaris website shall
make this visible **at the download surface**, without turning the download hero
into a legal notice or adding friction to the download flow.

## Scope

- **In scope**: the official Rotaris website download surface, a compact
  disclosure affordance adjacent to the download controls, localized disclosure
  copy, a link to the Privacy Policy, and a release-time check that the disclosure
  still matches SWR-3715 and SWR-3003.
- **Out of scope**: GitHub Release pages, repository README files, consent
  checkboxes, blocking dialogs, first-run privacy dialogs inside the desktop app,
  backend/provider traffic and payment/account processing.

## Behaviour

**The download design remains primary.** The disclosure must not be rendered as a
large paragraph, warning banner, modal, checkbox or interstitial in the download
hero. It shall use a visually secondary affordance such as a small information or
privacy icon/link next to the download metadata or download action.

**The detail is available on demand.** Activating the affordance by mouse, touch
or keyboard opens a compact popover/disclosure containing the network notice and
a link to the Privacy Policy. Hover may be supported, but hover must not be the
only way to reach the information.

**The notice covers the automatic client traffic that exists today.** It states
that:

1. on first launch, Rotaris may download missing tools and warm package caches
   required by the application, which can contact services such as GitHub,
   Astral and relevant package registries when their user-provided runners are
   available; and
2. supported standalone desktop builds contact GitHub on every launch to check
   whether a newer Rotaris version exists.

The notice also states that these setup/update requests may expose ordinary
technical connection data such as the user's IP address to the contacted service,
and that Rotaris does not intentionally attach workspace files, prompts or
provider credentials to those setup/update requests.

**Localization follows the website.** The German download page must expose the
German notice. The English download page should expose the English equivalent
through the same unobtrusive control; this adds no additional visual weight and
keeps the two public download surfaces behaviourally consistent.

Recommended copy:

**English**

> **Automatic network access.** On first launch, Rotaris may download missing
> tools and warm package caches from services such as GitHub, Astral and relevant
> package registries when their user-provided runners are available. Standalone desktop builds also check GitHub for
> updates on every launch. These requests may expose technical connection data
> such as your IP address to the respective services. Project files, prompts and
> provider credentials are not sent as part of these setup or update requests.
> See the Privacy Policy for details.

**Deutsch**

> **Automatische Netzwerkzugriffe.** Beim ersten Start kann Rotaris fehlende
> Werkzeuge herunterladen und benötigte Paket-Caches über Dienste wie GitHub,
> Astral und die jeweils erforderlichen Paketregistries aufwärmen, sofern deren
> vom Nutzer bereitgestellte Runner verfügbar sind.
> Standalone-Desktop-Versionen prüfen außerdem bei jedem Start über GitHub, ob
> eine neuere Rotaris-Version verfügbar ist. Dabei können technisch notwendige
> Verbindungsdaten wie deine IP-Adresse an den jeweiligen Dienst übermittelt
> werden. Projektdateien, Prompts und Provider-Zugangsdaten werden im Rahmen
> dieser Setup- und Update-Anfragen nicht übertragen. Weitere Informationen
> findest du in der Datenschutzerklärung.

**GitHub Releases are intentionally excluded.** The generated GitHub Release body
continues to focus on artifacts, checksums and changelog information. SWR-3722
places the consumer-facing disclosure on the official product website rather
than duplicating it on the development/distribution repository surface.

**A release must not silently make the website notice stale.** Before a public
standalone release is promoted through the official website, the maintainer must
compare the disclosure against the current automatic destinations and behaviour
of SWR-3715 and SWR-3003. If those behaviours changed, the website copy must be
updated before the new release is promoted there. The GitHub artifact build is
not blocked solely because the website has not yet been updated; the gate applies
to promotion through the official download site.

## Acceptance criteria

- **AC-001**: The official website exposes the disclosure immediately adjacent to
  or within the download surface without adding a visible legal paragraph,
  blocking modal, checkbox or interstitial to the normal download flow.
- **AC-002**: The disclosure can be opened with mouse, touch and keyboard and is
  not dependent on hover alone.
- **AC-003**: The disclosure describes both SWR-3715 first-run provisioning traffic
  and SWR-3003's always-on standalone launch-time GitHub update check.
- **AC-004**: The disclosure links to the canonical Privacy Policy.
- **AC-005**: The German website exposes German copy. If the English download
  surface is published, it exposes the equivalent English copy through the same
  compact interaction.
- **AC-006**: Opening or closing the disclosure does not initiate any additional
  network request other than normal website navigation; following the Privacy
  Policy link is user initiated.
- **AC-007**: GitHub Release generation does not duplicate this notice as a
  mandatory release-body section.
- **AC-008**: The release checklist requires a comparison of the website notice
  with the current SWR-3715 and SWR-3003 behaviour before a new standalone build
  is promoted on the official website.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The download disclosure renders localized EN/DE copy and the canonical privacy route | website i18n / download component | `Rotaris-website` component test |
| Accessibility | The disclosure opens by keyboard and touch-equivalent activation, has an accessible name and does not depend on hover | download disclosure control | `Rotaris-website` accessibility test |
| Release check | A maintainer can verify the published disclosure against the automatic network behaviour documented by SWR-3715 and SWR-3003 | release checklist | documentation/release review |

Related: [SWR-3715 — A bundled install provisions the machine once, before the app opens](SWR-3715-first-run-machine-setup.md)

Related: [SWR-3003 — In-App Update Notification](SWR-3003-in-app-update-notification.md)

Epic: [Distribution & Updates](../3000-distribution-updates.md)
