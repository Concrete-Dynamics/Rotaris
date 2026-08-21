---
req-id: SWR-780
status: approved
trace: required
test: required
type: technical
derived-from: SWR-700
title: "Rotaris Cloud account credit-status reads"
epic: SWR-700
date: 2026-08-19
---

# SWR-780 — Rotaris Cloud account credit-status reads

Rotaris Cloud is the recommended built-in provider (SWR-745), and it is prepaid:
the backend holds a credit balance and decides per request whether the account
may spend. Rotaris MUST be able to read that decision, so the surfaces that show
it (SWR-3013) never have to know the backend's payload shape.

The reader fetches `GET /v1/account/usage-status` from the Rotaris Cloud API
base — the `api_base_url` persisted from the CLI token exchange, or the
provider's default base URL — presenting the stored access token as a bearer
credential, and normalizes the payload into `CloudAccountStatus`:

- `balance` as an exact `Decimal` in the account currency, derived from the
  atomic balance and the atomic scale the payload declares. Money is never
  carried as a float.
- `state` as a `CreditState` — `available`, `exhausted`, or `overdrafted`.
  A value the client does not know degrades to `unknown` rather than failing,
  so a backend that adds a state does not break an installed client.
- `admission_allowed`, the backend's own answer to "may this account spend
  right now", which is what a pre-run check consults.
- `latest_settled_usage` — when the account has billed at least one call, the
  time it happened, its settlement status, and its cost — or `None` when it has
  not.

Reads are best-effort in the same sense as SWR-776: any transport failure,
non-success status, or unusable body raises `CloudAccountError` for the caller
to degrade gracefully, and never blocks the surface that asked.

Because the reader depends on a credential that expires, callers obtain the
token through the auth manager, which refreshes it before use.

## Acceptance criteria

- `fetch_cloud_account_status` returns a normalized `CloudAccountStatus` for an
  authenticated Rotaris Cloud account, and raises `CloudAccountError` when the
  backend returns an error status, an unreachable host, or an unusable body.
- The balance is exact: an atomic balance and scale convert to the same decimal
  the backend reports for the same amount elsewhere in the payload.
- An account that has never billed a call reports `latest_settled_usage` as
  absent rather than as a zero-cost call.
- A credit state the client does not recognize reads as `unknown` and still
  yields a usable status.
- The stored per-account API base overrides the provider default.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An authenticated account's balance, state, admission decision, and last call cost are read from the backend payload; failures and unknown states degrade instead of crashing | `fetch_cloud_account_status` over a mocked `https://rotaris.ai/v1/account/usage-status` | `tests/unit/providers/test_cloud_account.py` |
| Integration | A user whose access token has expired still gets a current balance, because the read refreshes the credential first | `AuthManager.get_token` → `POST /cli/refresh` → `GET /v1/account/usage-status` | `tests/integration/test_cloud_account_refresh.py` |

Derived from: [SWR-700 — Provider Integration & Authentication](../700-providers-auth.md)

Serves: [SWR-3013 — Rotaris Cloud credit is visible before it runs out](../2000-rotaris-desktop/SWR-3013-cloud-credit-surface.md)

Epic: [Provider Integration & Authentication](../700-providers-auth.md)
