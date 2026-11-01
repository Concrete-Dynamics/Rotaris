# Open questions — Spikes, and the questions raised since (36 of 36)

Part 69 of 69 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-468; OQ-460 – OQ-467 archived in [the archive](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md).

- OQ-460 — May clause (4)'s second hand-over wait an interval of its own?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-460)
- OQ-461 — What does a launch end as when the holder is live and never answers?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-461)
- OQ-462 — What is the person told when a utility process is lost or never reports ready, and is it forked again?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462)
- OQ-463 — Should a credential at rest be encrypted under the platform's user-bound key, beyond the mode bits and the access-control list …; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-463)
- OQ-464 — Does the workspace write boundary bind the terminal, git and MCP tools, or the file tools alone?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-464)
- OQ-465 — May the per-session log be bounded in size, and by what shape?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-465)
- OQ-466 — Does the renderer stay on the `file:` scheme, or move to a privileged custom scheme?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-466)
- OQ-467 — What bounds the size of what a renderer command carries?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467)

<a id="oq-468"></a>

**OQ-468 — Do the workspace-boundary sentences the user reads overclaim where OS confinement is inactive?** *(REQ-WORKSPACE-022, REQ-TOOLS-131, REQ-CONFIG-327, REQ-TOOLS-129, ADR-0022, IC-8. Raised 2026-11-01 by the ruling of OQ-464, which asked for it and did not rule it.)*

**What is open.** OQ-464 ruled the boundary per tool: the fence binds every first-party tool that takes a path, the gate's key scoping binds a tool call carrying a path key, and the terminal and MCP are bounded by OS confinement where it exists and by nothing on native Windows (IC-8). Three sentences the user reads say more. REQ-WORKSPACE-022 and REQ-TOOLS-131 state, verbatim, "File access: agents may read and write inside this workspace folder only." REQ-CONFIG-327 states that "any call reaching a path outside the workspace continues to require approval". Where confinement is inactive a shell command reaches any path the operating system allows, and the sentences promise what the mechanism does not hold.

**What the build proceeds under.** The sentences stay as the requirements state them; a change to those strings needs a directive, which OQ-464's ruling did not mint. The hardening plan hardens the fence (bundle `fence-hardening`) and adds OQ-464's invariant test, and changes no user-facing wording.

**What decides it.** A ruling on whether the wording is narrowed where confinement is inactive (a directive over the three requirements, stating the terminal's and MCP's boundary as it is), or left as the target's own words with the gap recorded in `docs/architecture/hardening.md`.
