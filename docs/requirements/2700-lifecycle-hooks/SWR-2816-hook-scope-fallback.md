---
req-id: SWR-2816
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2701
title: "Hook scope fallback when a workspace list is refused"
epic: SWR-2700
date: 2026-08-08
---

# SWR-2816 — Hook scope fallback when a workspace list is refused

A second property, separate from the trust gate (SWR-2815) and discovered while
integrating it. SWR-2701 says a workspace hook list *replaces* the inherited
one, following the established overlay semantics. Combined with the trust gate,
that hands a hostile repository a different attack: declare any hook list at
all, let the user decline the prompt, and the user's **own** global guardrail
hooks are gone with it. The attacker gets no code execution, but the user gets
no protection either — and, because a stored refusal does not re-prompt, no
warning that their hooks stopped running.

Replace semantics therefore apply only *between trusted scopes*.

## Acceptance criteria

- The loader keeps the hook entries a higher scope replaced, in
  `HookSettings.superseded_entries`, while it is still knowable which scope each
  entry came from. That field is populated by the loader and never written by
  hand; the loader decides nothing about trust.
- When workspace hooks are refused (or simply not yet reviewed), the entries
  they superseded are reinstated into the effective hook set.
- Only non-workspace entries are reinstated. A workspace list that replaced an
  earlier workspace list cannot smuggle itself back in through the fallback.
- An entry already present in the allowed set is not reinstated twice.
- The fallback is a consequence of refusal, not a permanent merge: once the user
  accepts the workspace list, it replaces the inherited one outright and nothing
  is restored.
- When hooks were restored, the skipped-hooks notice says so, so the user learns
  their own hooks still run rather than being left to guess.

Implementation: `HookSettings.superseded_entries` (`config/schema.py`),
`_preserve_superseded_hooks` (`config/loader.py`), `superseded_hooks`
(`hooks/models.py`), `resolve_trusted_hooks` / `trusted_hooks_for_config`
(`hooks/trust.py`).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A workspace list that replaced an earlier *workspace* list restores only the user-authored entries | `resolve_trusted_hooks` | `tests/unit/test_hook_trust.py::test_a_refused_workspace_list_never_reinstates_another_workspace_hook` |
| Integration | A repository declaring hooks replaces the user's global list through the real loader; the refusal blocks the repository's hooks and puts the user's guardrail hook back, and accepting hands the workspace list the field outright | `config.loader.load_config` → `trusted_hooks_for_config` | `tests/unit/test_hook_trust.py::test_an_untrusted_repository_cannot_switch_off_the_users_own_hooks` |
| User-flow E2E | A run in a repository that declares hooks still executes the user's own hook and reports the skipped one | Public product boundary → user-observable result | `tests/integration/test_hooks_user_flow.py::test_a_repository_cannot_run_its_own_hooks_or_switch_off_the_users` |

Derived from: [SWR-2701 — Hook configuration schema](SWR-2701-hook-configuration.md)

Epic: [User-Defined Lifecycle Hooks](../2700-lifecycle-hooks.md)
