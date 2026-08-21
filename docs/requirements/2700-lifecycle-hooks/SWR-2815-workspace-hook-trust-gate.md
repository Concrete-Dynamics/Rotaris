---
req-id: SWR-2815
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2701
title: "Workspace hook trust gate"
epic: SWR-2700
date: 2026-08-08
---

# SWR-2815 — Workspace hook trust gate

SWR-2701 makes hooks declarable in the layered config, and the most specific
layer is `<workspace>/.rotaris/agents.yaml` — an ordinary file inside a
repository, which therefore travels inside a clone. A hook entry *is* a shell
command. Without a gate, cloning an unfamiliar repository and opening it would
run whatever that repository's author wrote, with no user action beyond opening
the project. That is remote code execution, and SWR-2701 does not describe the
decision that prevents it. This requirement does.

The gate is a property of *scope*, not of hook content: no attempt is made to
judge whether a command looks dangerous.

## Acceptance criteria

- Hooks stamped `source="global"` (`~/.config/rotaris/`) and `source="default"`
  (the built-in `DEFAULT_CONFIG`) always run. The user wrote those on their own
  machine, so there is nothing to consent to.
- Hooks stamped `source="workspace"` run only after an explicit verdict recorded
  for *that* workspace **and** *that exact hook set*. Any other scope value —
  one this module does not recognise — is blocked. There is no branch in which
  "I do not know where this came from" resolves as safe.
- The verdict is keyed on a digest covering every field a reviewer would want to
  have seen: hook name, event, matcher, command, timeout, `required`, and the
  order of the entries (reordering `pre_tool` hooks changes what runs before
  what). Only workspace-sourced entries contribute, so editing a global hook
  never revokes a workspace verdict and editing a workspace hook never survives
  one.
- A recorded **refusal** is a decision and sticks until the hook set changes.
  Re-prompting on every run would train the user to click the dialog away, which
  is worse than the refusal being quiet.
- Every ambiguous state resolves as *not trusted*, without raising: a missing,
  corrupt, truncated, wrongly-shaped, wrongly-versioned or unreadable trust
  file, and a `.rotaris` path that is not a directory, all read as "no verdict".
  A hostile repository cannot ship a hand-written `hook-trust.json` in a shape
  the reader would misread — `trusted` is checked against `bool`, not
  truthiness.
- Recording a verdict is atomic and *raises* on failure rather than swallowing
  it: a caller that wrongly believes it recorded a refusal would keep running
  hooks the user just rejected.
- The user-facing "hooks were skipped" notice reports only the count and the
  config file. Hook names and commands are attacker-authored text and are not
  echoed into a terminal the user did not ask to have them rendered in; the full
  list belongs in the review prompt, which the user opened on purpose.

## Known and intended property

Hooks loaded through the CLI's `--config <path>` override are **trusted**. That
path feeds raw YAML into the merge without the loader's per-scope stamping, so
its entries carry no stamp and resolve as `source="default"`. This is
deliberate: typing a config path on one's own command line is a materially
different act from opening a directory that happened to arrive inside a clone.

Implementation: `src/rotaris_core/hooks/trust.py` (verdict stored at
`<workspace>/.rotaris/hook-trust.json`), desktop review prompt in
`apps/rotaris/src/rotaris/widgets/hook_trust_dialog.py`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The digest changes on a changed command, matcher, timeout, `required` flag or entry order, and ignores hooks from trusted scopes; every unreadable or malformed trust file reads as untrusted; the skip notice never echoes the untrusted command | `rotaris_core.hooks.trust` | `tests/unit/test_hook_trust.py` |
| Integration | A cloned repository's hooks stay blocked through the real config loader until the user accepts, and go back behind the gate when the repository rewrites them | `config.loader.load_config` → trust gate | `tests/unit/test_hook_trust.py::test_cloned_repository_cannot_run_its_hooks_until_the_user_says_so` |
| Integration | The desktop reports workspace hooks as awaiting review, records a dismissal as a refusal rather than consent, and does not ask again | `ConfigService` / `HookTrustDialog` | `apps/rotaris/tests/test_hook_trust_ui.py` |
| User-flow E2E | A repository declaring its own hook cannot run it, and the user is told hooks were skipped without the command being shown | Public product boundary → user-observable result | `tests/integration/test_hooks_user_flow.py::test_a_repository_cannot_run_its_own_hooks_or_switch_off_the_users` |

Derived from: [SWR-2701 — Hook configuration schema](SWR-2701-hook-configuration.md)

Epic: [User-Defined Lifecycle Hooks](../2700-lifecycle-hooks.md)
