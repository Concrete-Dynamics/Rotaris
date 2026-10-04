# Live runs

A live run launches the built product against a real model endpoint. It is the only evidence that the product
works for a user, and it can spend money. Proofs pass on a product a live run still finds broken.

## Authorization

- A live run needs the owner's explicit authorization **in the conversation**: per run, or standing ("run it as much
  as you want"). An unmetered or self-hosted endpoint still needs it. `AGENTS.md` calls the live run "never
  automatic", and an agent asks before running one against a metered endpoint. Here the owner's authorization for the
  registered self-hosted default is standing (R-068, 2026-10-02: "never ask for my persmission for it. you always have
  my permission."), and `AGENTS.md` says so beside the rule; `pnpm slice-proof` signs into the same registry since
  that day and runs on the same terms.
- The plan carries it: `"live": { "authorized": true, "ownerWords": "<their words>" }`. Without that field, `render`
  tells every agent live runs are not authorised, and acceptance runs no live-runner.
- **Ask once per owner.** Once the owner has made the authorization standing, it is recorded once with their words
  and the date (here R-068 in `docs/product/requests.md`), and every later plan quotes those words in
  `live.ownerWords` without asking again (every plan since has). It covers what the words cover, here the registered
  self-hosted default; another endpoint, or a metered one, is asked about. A per-run authorization covers its run.
  The words are in the conversation that gave them: a new session relying on the recorded words alone may meet the
  classifier's refusal (The permission system, below), and then asks the owner once.
- The endpoint and key live outside the repository. Here: `~/.rotaris/live-run/endpoints.json` names the default
  endpoint and marks it `unmetered`; the key sits beside it in a file only its owner can read; the environment may
  carry the key and URL in variables the owner names. Never print a key: compare with
  `[ "$(tr -d '\n' < keyfile)" = "$VAR" ]`. A record names an endpoint by its registry name (`katalyst`), never by
  its base URL: a URL a run logged is written elided (`…/v1/chat/completions`), the host left in the registry.

## The permission system

- The auto-mode classifier refuses a live-run launch as a "Real-World Transactions" action: for agents, which cannot
  see the owner's words, and for the orchestrator until the owner authorized it in the conversation.
- **A refusal is final for that action**: never retried, split, re-quoted, or handed to another agent. In order: the
  agent stops and reports what it was doing and the exact command it sent; the orchestrator, which holds the owner's
  quoted words in the conversation, runs the launch itself, and the classifier judges that launch on them (finacc's
  passed); a refusal of the orchestrator's own launch goes to the owner, who decides.
- **An agent's shell starts every command in the primary checkout**: its working directory is reset between commands.
  A launch by relative path (`node apps/desktop/scripts/live-run.mjs …`) therefore runs the primary checkout's script
  on the primary checkout's build, never the tree being judged: an agent never launches one so. Reaching another tree
  takes `cd <tree> && …` or an absolute path. finacc's live-runner (`wf_6c39b5ac-be8`, `accept:live#1`, 05:14:14 UTC
  on 2026-10-03) sent
  `cd /home/user/Rotaris-crw-wt-accept && export PATH=… && timeout 5400 xvfb-run … node apps/desktop/scripts/live-run.mjs …`;
  no allow rule matched that form, and the classifier refused it. Duress was then not launched, the autopsy had no pack, and the refusal came back as a repair bundle no
  builder could close (`accept1-4`, blocked once its builder's own launch was refused too, at about 06:39).
- **So the profile's live commands are absolute**: one command each, naming the Node 24 binary and the script by
  absolute path, with nothing before it. `live-run.mjs` resolves its tree from its own path
  (`resolve(import.meta.dirname, '..', '..', '..')`), so it judges and writes its evidence in the tree that holds it,
  from any working directory. The live-runner sends each exactly as written; on a refusal it launches nothing more and
  hands every run, with that same text, to the orchestrator (SKILL.md §5).
- **What clears it for agents** is an allow rule the owner approves, in the git-ignored local settings
  (`.claude/settings.local.json`; a tracked settings file would dirty every checkout), matching the absolute commands,
  with `<repo>` the primary checkout's path (here `/home/user/Rotaris-crw`). No such rule exists yet:

  ```json
  { "permissions": { "allow": [
    "Bash(timeout * xvfb-run * /opt/node24/bin/node <repo>-wt-accept/apps/desktop/scripts/live-run.mjs --confirm --skip-build*)",
    "Bash(LIVE_RUN_DURESS_MS=* timeout * xvfb-run * /opt/node24/bin/node <repo>-wt-accept/apps/desktop/scripts/live-run.mjs --confirm --skip-build*)"
  ] } }
  ```

  The four relative rules the file holds (`… node apps/desktop/scripts/live-run.mjs --confirm --skip-build*`, with and
  without `timeout` and `LIVE_RUN_DURESS_MS=`) match only a launch of the primary checkout's script, which no agent
  judges. A rule's trailing `*` admits later flags too (`--only`, and also `--endpoint` or `--budget`): it bounds the
  script and the tree; the endpoint registry and the prompts bound the rest. Adding a rule is the owner's decision: ask
  at planning time (SKILL.md §1) with the exact text, and edit the file only on the owner's explicit instruction
  (`references/environment.md`, Long jobs). A settings file created mid-session may take effect only after the session
  reloads. A detached launch (`references/environment.md`, Long jobs) is not one of these forms; the classifier judges
  it.
- Until a rule holds, the orchestrator runs the live runs from the hand-off and gives the packs to an autopsy agent.

## Running

- Build the head you mean to judge first; a live run of a stale build judges nothing. The tree must also hold the
  code-intelligence bundle (`pnpm code-intel:bundle`, seconds when it is already there): since `5cc297d` a
  `--skip-build` launch refuses at once without it, and before that the duress run at `1763f7f` ran in a tree without it
  and never exercised code intelligence (its autopsy's U5, 2026-10-03).
- The orchestrator sends the profile's commands as they are, from any directory, as a background task with the Bash
  tool's `timeout` (`references/environment.md`, Long jobs). The default run takes about sixteen minutes: at `1763f7f`,
  `timeout 5400 xvfb-run -a -s "-screen 0 1600x1000x24" /opt/node24/bin/node /home/user/Rotaris-crw-wt-accept/apps/desktop/scripts/live-run.mjs --confirm --skip-build`
  ran from 05:56 to 06:15 UTC on 2026-10-03 and passed.
- Duress needs a window the endpoint can fill (`LIVE_RUN_DURESS_MS=5400000` under `timeout 7200` here; one took 85
  minutes, the one at `1763f7f` 77): give it the Bash tool's largest `timeout`, 7,200,000 ms. When you run it while a
  workflow goes on, run it in a dedicated tree (`<repo>-wt-live`: set up, built and bundled at the head you judge, its
  path in place of the acceptance tree's), because the next round's sweep checks the acceptance tree out at a new head
  and rebuilds it under a running launch.
- One acceptance live run at a time on this host: they compete for CPU and the endpoint. Two concurrent ones leave
  each other's sandboxes alone.
- Evidence lands in `.live-run/runs/<stamp>/` of the tree that ran it, the newest named in `.live-run/latest.txt`.

## After a live run

Autopsy every session (the `run-autopsy` skill), record each defect as a note, and drive the notes through a plan.
A live finding that recurs after a note says it was fixed is a finding, and says so.
