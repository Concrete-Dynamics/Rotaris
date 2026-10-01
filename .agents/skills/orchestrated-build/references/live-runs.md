# Live runs

A live run launches the built product against a real model endpoint. It is the only evidence that the product
works for a user, and it can spend money. Proofs pass on a product a live run still finds broken.

## Authorization

- A live run needs the owner's explicit authorization **in the conversation**: per run, or standing ("run it as much
  as you want"). An unmetered or self-hosted endpoint still needs it. `AGENTS.md` calls the live run "never
  automatic", and an agent asks before running one.
- The plan carries it: `"live": { "authorized": true, "ownerWords": "<their words>" }`. Without that field, `render`
  tells every agent live runs are not authorised, and acceptance runs no live-runner.
- The endpoint and key live outside the repository. Here: `~/.rotaris/live-run/endpoints.json` names the default
  endpoint and marks it `unmetered`; the key sits beside it in a file only its owner can read; the environment may
  carry the key and URL in variables the owner names. Never print a key: compare with
  `[ "$(tr -d '\n' < keyfile)" = "$VAR" ]`.

## The permission system

- The auto-mode classifier refuses a live-run launch as a "Real-World Transactions" action: for agents, which cannot
  see the owner's words, and for the orchestrator until the owner authorized it in the conversation.
- **A refusal is final for that action.** Do not retry it, split it, re-quote it, or hand it to another agent. Stop,
  say what you were doing and why it needs the permission, and let the owner decide.
- **What clears it for agents** is an allow rule the owner approves, in the git-ignored local settings
  (`.claude/settings.local.json`; a tracked settings file would dirty every checkout). Keep it to the launch forms
  agents use, with `--confirm --skip-build`, so it admits no endpoint or budget change:

  ```json
  { "permissions": { "allow": [
    "Bash(timeout * xvfb-run * node apps/desktop/scripts/live-run.mjs --confirm --skip-build*)",
    "Bash(xvfb-run * node apps/desktop/scripts/live-run.mjs --confirm --skip-build*)",
    "Bash(LIVE_RUN_DURESS_MS=* timeout * xvfb-run * node apps/desktop/scripts/live-run.mjs --confirm --skip-build*)",
    "Bash(LIVE_RUN_DURESS_MS=* xvfb-run * node apps/desktop/scripts/live-run.mjs --confirm --skip-build*)"
  ] } }
  ```

  Adding it is the owner's decision: ask at planning time (SKILL.md §1). A settings file created mid-session may take
  effect only after the session reloads. A detached launch (`references/environment.md`, Long jobs) is not one of
  these forms; the classifier judges it.
- Until a rule holds, the orchestrator runs the live runs itself and gives the packs to an autopsy agent.

## Running

- Build the head you mean to judge first; a live run of a stale build judges nothing.
- The default run takes about sixteen minutes. Duress needs a window the endpoint can fill
  (`LIVE_RUN_DURESS_MS=5400000` under `timeout 7200` here; one took 85 minutes): run it as a background task with
  the Bash tool's largest `timeout`, 7,200,000 ms (`references/environment.md`, Long jobs). That launch is one of
  the allow-rule forms above, so an agent holding the rule can run it as well (not yet observed).
- One acceptance live run at a time on this host: they compete for CPU and the endpoint. Two concurrent ones leave
  each other's sandboxes alone.
- Evidence lands in `.live-run/runs/<stamp>/` of the tree that ran it, the newest named in `.live-run/latest.txt`.

## After a live run

Autopsy every session (the `run-autopsy` skill), record each defect as a note, and drive the notes through a plan.
A live finding that recurs after a note says it was fixed is a finding, and says so.
