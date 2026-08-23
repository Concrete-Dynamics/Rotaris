---
req-id: SWR-3720
status: approved
trace: required
test: required
title: "Release artifacts carry complete third-party notices"
epic: SWR-3000
date: 2026-08-23
---

# SWR-3720 — Release artifacts carry complete third-party notices

Every distributed Rotaris desktop artifact shall carry licensing notices that
cover the software and assets actually delivered with that artifact. The notice
inventory must not be limited to Python distributions when the packaged product
also contains fonts, icons or other non-Python components.

## Scope

- **In scope**: standalone desktop artifacts, bundled Python dependencies,
  bundled fonts/icons/assets, native or auxiliary components shipped inside the
  artifact, generation and validation of `THIRD-PARTY-LICENSES.txt`, and access
  to the notices from the desktop About & Legal surface.
- **Out of scope**: server-side dependencies, dependencies used only during CI or
  development, and software merely present on the user's machine before Rotaris
  starts.

## Behaviour

**The inventory follows the artifact.** The release process derives the notice
inventory from the set of components that are actually shipped. Python package
metadata may be one input, but it is not treated as the complete artifact
inventory by itself.

**Non-Python assets are included.** Fonts, icon sets and other licensed assets
bundled under the desktop application's resources must contribute their license
text and attribution to the generated notices when required by their license.

**Provisioned tools are distinguished from bundled tools.** Tools fetched by
SWR-3715 after installation are recorded with name, version, source and license
identifier in setup metadata/documentation, but are not falsely described as
bytes bundled into the Rotaris installer when they are downloaded separately
from their official sources.

**Missing licensing information fails the release check.** A shipped component
whose license cannot be identified or whose required license/notice text is
missing blocks the release pipeline until the issue is resolved or explicitly
classified by a documented license-review rule.

**The notices ship with every standalone artifact.** The generated notice bundle
is installed with Rotaris and is reachable from the About & Legal surface defined
by SWR-3717.

## Acceptance criteria

- **AC-001**: The notice generator inventories bundled Python distributions and
  separately enumerated non-Python resources included in the release artifact.
- **AC-002**: The bundled JetBrains Mono, Manrope, Space Grotesk and Phosphor
  resources are represented by the corresponding license/attribution material
  when those assets are present in the artifact.
- **AC-003**: A fixture representing a shipped component without sufficient
  license metadata or required notice text makes the release validation fail.
- **AC-004**: A component used only in development/CI is not included unless it
  is also shipped in the end-user artifact.
- **AC-005**: Tools provisioned after install by SWR-3715 are labelled as
  provisioned/downloaded components with source/version/license metadata rather
  than as installer-bundled components.
- **AC-006**: Windows, macOS and Linux standalone release artifacts contain the
  generated third-party notice bundle.
- **AC-007**: The installed desktop app can open the same notice bundle from
  About & Legal without network access.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Python packages and non-Python asset manifests produce one normalized notice inventory | notice generator | `tests/unit/packaging/test_third_party_licences.py` |
| Unit | Missing required license material blocks validation | license inventory validator | `tests/unit/packaging/test_third_party_licence_validation.py` |
| Integration | A built desktop artifact contains the generated notice file and referenced bundled asset licenses | packaging output inspection | `tests/integration/test_release_licence_bundle.py` |
| User-flow E2E | About & Legal opens the notice bundle from an installed artifact | desktop resources | `apps/rotaris/tests/test_about_legal_licences.py` |

Related: [SWR-3717 — Legal and product information is always reachable from the desktop app](../2000-rotaris-desktop/SWR-3717-about-legal-center.md)

Epic: [Distribution & Updates](../3000-distribution-updates.md)
