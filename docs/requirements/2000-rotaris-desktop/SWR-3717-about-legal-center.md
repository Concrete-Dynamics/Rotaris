---
req-id: SWR-3717
status: draft
trace: required
test: required
title: "Legal and product information is always reachable from the desktop app"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3717 — Legal and product information is always reachable from the desktop app

Rotaris shall provide a permanent **About & Legal** surface in the desktop
application. A user must be able to reach the product's legal notices and product
identity without signing in, configuring a provider, opening a workspace, or
starting a run.

## Scope

- **In scope**: an About & Legal entry point, product/version information,
  operator/publisher information, links to the current public legal documents,
  the product license, third-party notices, and the security contact.
- **Out of scope**: checkout acceptance, account management, backend privacy
  controls, account deletion, and server-side legal processes.

## Behaviour

**The entry point is permanent.** Settings and the application menu expose an
`About & Legal` action. It is available in every normal desktop state, including
when no workspace or provider is configured.

**Product identity is explicit.** The surface shows at least the product name,
running version, build or commit identifier when available, installation flavour
when detectable, the publisher/operator name, and the public security contact.

**Legal documents are directly reachable.** The surface provides clearly named
links for the Privacy Policy, EULA, Terms/AGB, Acceptable Use Policy and withdrawal
information where that document applies to the offered service. Links open the
canonical published version in the system browser. Failure to open a browser is
reported without breaking the application.

**Licensing is visible.** The surface identifies the Rotaris product license and
provides access to `THIRD-PARTY-LICENSES.txt` or the equivalent generated notice
bundle shipped with the current build.

**No network request is needed to render the surface itself.** Product version,
license identity and bundled third-party notices are read locally. Opening an
external legal-document link is the user action that may use the network.

## Acceptance criteria

- **AC-001**: `About & Legal` is reachable from Settings and from the application
  menu without authentication, provider configuration or an open workspace.
- **AC-002**: The surface displays the running Rotaris version and publisher
  identity and exposes the security contact.
- **AC-003**: Privacy Policy, EULA, AGB/Terms, AUP and applicable withdrawal
  information are individually named and open their canonical URLs.
- **AC-004**: The Rotaris license and the third-party notice bundle are accessible
  from the same surface without requiring network access.
- **AC-005**: Rendering `About & Legal` performs no HTTP request.
- **AC-006**: A failed external-link launch produces a visible, non-blocking error
  and leaves the surface usable.
- **AC-007**: Every control is keyboard reachable and has an accessible name.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The surface renders product identity and all required legal entries from local metadata | About/Legal view model | `apps/rotaris/tests/test_about_legal.py` |
| Integration | Bundled third-party notices can be opened and external legal URLs are delegated to the OS | Desktop resources → shell/browser bridge | `apps/rotaris/tests/test_about_legal_resources.py` |
| User-flow E2E | A fresh install with no provider opens About & Legal and reaches every legal entry | Main window navigation | `apps/rotaris/tests/test_about_legal_flow.py` |

Related: [SWR-3720 — Release artifacts carry complete third-party notices](../3000-distribution-updates/SWR-3720-complete-third-party-notices.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
