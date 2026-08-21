---
req-id: SWR-3013
status: approved
trace: required
test: required
title: "Rotaris Cloud credit is visible before it runs out"
epic: SWR-2000
date: 2026-08-19
---

# SWR-3013 — Rotaris Cloud credit is visible before it runs out

Rotaris Cloud is prepaid and the recommended provider, yet Rotaris shows a user
nothing about their credit. The dashboard reports cumulative tokens and the cost
Rotaris itself accumulated, and Settings reports plan usage for Codex, Copilot,
and Claude Code — but for our own provider there is no balance anywhere. A user
discovers they are out of credit when a long run dies mid-iteration on a provider
quota error, having already spent the time.

Rotaris shall show the credit the backend reports, and use it before spending.

- The **Overview dashboard** carries a `Rotaris Cloud credit` tile: the current
  balance, the credit state, and what the last billed call cost. It names its
  own state in every case — not signed in, first read in flight, funded,
  out of credit, or unreadable — and never renders as a blank card.
- The **status bar** carries the balance beside the run's cost, so it stays
  visible while the user is working rather than only on the Overview.
- Credit state is conveyed by **text and shape, not colour alone**.
- When the backend says the account may not spend, the tile states that and
  offers one concrete next action that takes the user to their account.
- The reading **refreshes on its own** — when Rotaris starts, after the user
  signs in to Rotaris Cloud, when a run finishes, and periodically while the app
  is open — and the user can also refresh it by hand. Refreshing never blocks
  the interface.
- **Starting a run that cannot be admitted is caught first.** If the models the
  run will use belong to Rotaris Cloud and the last known reading says the
  account may not spend, Rotaris says so before the run starts and lets the user
  open their account or start anyway. The check uses what Rotaris already knows;
  it does not add a network round trip to starting a run.
- When a run does fail on a provider quota error against Rotaris Cloud, the
  failure notice states the actual balance and state instead of only
  "Provider limit reached".

Rotaris does not impose a spend cap of its own, and does not ask the backend for
permission before each iteration — the backend already refuses a request it
cannot admit.

## Acceptance criteria

- Overview shows a `Rotaris Cloud credit` tile whose value is the reported
  balance and whose supporting text names the credit state and the last billed
  call's cost.
- With no Rotaris Cloud sign-in, the tile explains that and offers sign-in
  rather than showing an empty or zero balance.
- When the reading fails, the tile says so, keeps a retry action, and exposes
  the technical detail as copyable text.
- When the account may not spend, the tile shows a persistent warning with an
  action that opens the user's Rotaris Cloud account.
- The status bar shows the balance while a Rotaris Cloud account is signed in,
  and shows nothing when none is.
- Starting a run on Rotaris Cloud models while the account may not spend raises
  a confirmation naming the balance, and the user can still choose to start.
- Credit state is distinguishable without colour, and every new control carries
  an accessible name.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The credit tile renders each state a user can land in — signed out, loading, funded, out of credit, unreadable — without a blank card | `CloudCreditCard` over a `CloudCredit` state model | `apps/rotaris/tests/test_cloud_credit_tile.py` |
| Integration | A balance read on a worker thread reaches the store and the views that display it, and a failed read degrades instead of propagating | `CloudAccountBridge` → `Store.set_cloud_credit` → `cloud_credit_changed` | `apps/rotaris/tests/test_cloud_account_bridge.py` |
| User-flow E2E | A signed-in user sees their credit on Overview and in the status bar; when the account is out of credit they see the warning, can reach their account, and are stopped before starting a run that cannot be admitted | Real `MainWindow` driven by accessible name, with only the network faked | `apps/rotaris/tests/test_cloud_credit_flow.py` |

Depends on: [SWR-780 — Rotaris Cloud account credit-status reads](../700-providers-auth/SWR-780-cloud-account-status-reads.md)

Related: [SWR-745 — Rotaris Cloud as a first-class built-in provider](../700-providers-auth.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
