---
req-id: SWR-3721
status: draft
trace: required
test: required
title: "Provider settings state where model traffic is sent"
epic: SWR-2000
date: 2026-08-23
---

# SWR-3721 — Provider settings state where model traffic is sent

Rotaris supports provider paths with materially different data-flow boundaries:
Rotaris Cloud, direct remote APIs, OpenAI-compatible endpoints, GitHub Copilot,
OpenAI Codex, DeepSeek and Claude Code through a locally invoked Agent SDK. The
desktop application shall make the configured connection path understandable
before a user relies on it.

## Scope

- **In scope**: built-in provider metadata shown in Settings → Providers and in
  first-launch provider selection, connection-mode classification, destination
  operator/host where applicable, and synchronization of displayed information
  with the provider catalog.
- **Out of scope**: server-side subprocessor configuration, Rotaris Cloud backend
  routing, payment processing, provider contract terms and provider-side data
  retention guarantees.

## Behaviour

**Every built-in provider declares a connection mode.** Provider catalog metadata
shall distinguish at least:

- Rotaris-managed cloud/API traffic;
- direct remote HTTP/API traffic from the client;
- local SDK/CLI execution that subsequently communicates according to that
  provider's own client implementation; and
- user-defined OpenAI-compatible endpoints.

**The user sees the relevant destination before configuration is complete.** For
a fixed remote endpoint, Settings displays the provider/operator and canonical
host or service name. For a user-defined endpoint, it displays the configured
base URL. For a local SDK/CLI integration such as Claude Code, the UI states that
Rotaris invokes the local provider client/SDK rather than presenting it as a
normal Rotaris HTTP endpoint.

**Provider metadata comes from one product source.** The same catalog data used to
construct provider configuration choices shall supply the provider name,
connection mode and destination information shown in the UI. The UI must not
maintain an independent hard-coded provider list that can drift from the runtime
catalog.

**No unsupported privacy promise is inferred.** The desktop may link to provider
privacy information, but it must not claim that a provider does not store, train
on or otherwise process data unless that statement is separately maintained and
verified outside this requirement.

## Acceptance criteria

- **AC-001**: Every built-in provider exposed by the runtime catalog has a
  displayable connection-mode classification.
- **AC-002**: Fixed direct providers expose their service/operator and destination
  host; OpenAI-compatible providers expose the configured base URL.
- **AC-003**: Claude Code is identified as a local SDK/client integration rather
  than being displayed as a normal direct HTTP endpoint owned by Rotaris.
- **AC-004**: Settings → Providers and the SWR-3716 first-launch guide consume the
  same provider catalog metadata for provider identity and connection mode.
- **AC-005**: Adding a new built-in provider without the required transparency
  metadata fails a catalog/schema validation test.
- **AC-006**: Rendering provider destination information does not itself contact
  the provider.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Every built-in provider validates with connection-mode and destination metadata | provider catalog schema | `tests/unit/providers/test_provider_transparency_metadata.py` |
| Integration | Provider settings render runtime catalog metadata without a duplicate provider map | catalog → desktop settings model | `apps/rotaris/tests/test_provider_transparency.py` |
| User-flow E2E | A new user compares Rotaris Cloud, direct API and Claude Code and can see how each connects before selecting one | first-launch guide / Settings | `apps/rotaris/tests/test_provider_destination_flow.py` |

Related: [SWR-3716 — The first launch offers Rotaris Cloud and lets the user in without it](SWR-3716-first-launch-provider-guide.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
