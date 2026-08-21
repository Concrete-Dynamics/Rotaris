---
req-id: SWR-2505
status: approved
trace: required
test: required
title: "Network egress policy"
epic: SWR-2500
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2505 — Network egress policy

Network access initiated by agent tools MUST be governed by the permission
policy (SWR-2501).

- The `fetch` tool checks the target host against configurable allow/ask/deny
  host patterns (`runtime.network_egress_policy`, `network_allowed_hosts`,
  `network_denied_hosts`) before issuing a request; the default preset behavior
  follows the active mode (SWR-2503). Redirects are followed manually and every
  hop is re-classified, so a permitted host cannot bounce the agent onto a
  denied one.
- Precedence is deny → allow → default, and `*.example.com` covers one or more
  leading labels but not bare `example.com`. An unreadable host resolves to
  deny; there is no path from confusion to allow.
- Terminal commands known to reach the network (`curl`, `wget`, `pip install`,
  `npm install`, `git push`, …) are classifiable via the command patterns
  (SWR-2502) so modes can gate them separately from local commands.
- Kernel-level egress enforcement for terminal commands is in scope only inside
  the OS-level sandbox (SWR-2507), where the sandbox network configuration MUST
  honor the policy — see the limit below.
- Denied network calls return a structured refusal naming the blocked host and
  the rule that blocked it, with a stable machine-readable `failure_kind`
  (`egress_denied`, `egress_redirect_denied`, `egress_policy_error`,
  `too_many_redirects`) so the agent re-plans instead of retrying.

## Known limits

- **Terminal-side egress is a binary kernel switch, not per-host
  allowlisting.** The sandbox (SWR-2507) can close the network for a command or
  leave it open; it cannot allow `pypi.org` and deny `evil.test` for the same
  `pip install`. Real allow/ask/deny *per host* applies to the `fetch` tool,
  where Rotaris owns the socket. Per-host control for terminal commands needs a
  filtering proxy plus a kernel backstop (the shape Claude Code ships) and is
  **explicitly deferred**; what terminal commands get today is the SWR-2502
  pattern classification in front of them and, when sandboxed, the on/off
  switch behind them.
- Loopback is not special-cased into "allowed": `169.254.169.254` and an
  internal `10.x` service are exactly the targets a policy exists to gate, so
  only genuine loopback names and addresses count as local.

## Acceptance criteria

- A `fetch` to a denied host is refused before any socket is opened, and the
  refusal names the host and the rule.
- A redirect from an allowed host onto a denied host is refused at the hop.
- Tightening the configured host lists changes the policy the agent's `fetch`
  tool actually carries, not only the config file.
- A terminal command matching a network pattern is classified as such by the
  permission engine, independently of local-command rules.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Host normalization and wildcard matching; deny → allow → default precedence; refusal payload shape; runtime policy fields | Egress classification API | `tests/unit/test_network_egress.py`, `tests/unit/test_runtime_policy_sandbox_config.py` |
| Integration | `fetch` against a disallowed host is blocked before any socket use, including on a redirect hop; the registered tool carries the configured policy | Fetch tool executor, tool registration seam | `tests/integration/test_fetch_egress_policy.py`, `tests/integration/test_epic_seams.py` |
| User-flow E2E | An operator sets the egress policy in Rotaris Settings and the value reaches the run's `RuntimePolicy` | Public product boundary → user-observable result | `apps/rotaris/tests/test_settings_sandbox_egress.py` |

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
