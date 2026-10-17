# `requirements-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/requirements-proof.mjs`](../../apps/desktop/scripts/requirements-proof.mjs).

The delivery store and the board (ADR-0041); since 2026-10-02 its `ready-restart` stage quits and relaunches the built app over a card resting in `ready` and starts it from the queue's disclosure, its `ready-restart-automatic` stage has an automatic queue start such a card at the relaunch with nothing clicked, and its `disclosure-launch` stage shows one plain acceptance holding for the rest of the launch and the disclosure due again in the next (`review-rerun` and `blocker-resume` take their second run-starting action in a relaunch for that reason)
