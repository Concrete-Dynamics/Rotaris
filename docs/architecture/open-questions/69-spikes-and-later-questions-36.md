# Open questions — Spikes, and the questions raised since (36 of 36)

Part 69 of 69 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-468; OQ-460 – OQ-467, OQ-477, OQ-490, OQ-491, OQ-493 – OQ-503, OQ-487 archived in [the archive](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md).

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

- OQ-477 — How is a store refused as corrupt resolved?; ruled 2026-11-04; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-477)
- OQ-490 — Does R-092's "superseded requirements" ask for more than the text beyond a definition line, which is none?; ruled 2026-11-04; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-490)
- OQ-491 — Does `PD-ORCH-002` supersede `REQ-ORCH-153` whole, or narrow its presentation clause?; ruled 2026-11-04; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-491)
- OQ-493 — Does the accessibility contract REQ-SHELL-144..168 aim at a WCAG 2.2 conformance level, so that a success criterion it does not restate is …; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-493)
- OQ-494 — Under an active OS forced-colours palette, does the shell defer to it or switch to `high-contrast`, and what then marks a floating surface …; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-494)
- OQ-495 — Are renderer zoom and OS text enlargement supported inputs, when under them a 1000×680 window lays out below every compact threshold?; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-495)
- OQ-496 — Which non-status transitions does §1.8 admit: a rearranged structure, a pane becoming an overlay drawer, the palette's listing appearing, a …; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-496)
- OQ-497 — Does flipping the in-app reduced-motion setting stop a pulse or spinner that is already running, or only the next one to start?; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-497)
- OQ-498 — Does an acknowledgement's 4200 ms lifetime pause while the pointer rests on it?; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-498)
- OQ-499 — May a literal pixel value stand off the token scale, as an optical correction or as the metric debt the ui-language baseline tolerates, and …; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-499)
- OQ-500 — Does §1.4's type system, three faces and three weights with “never weight” for hierarchy, keep row headers, Table group headers and the …; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-500)
- OQ-501 — Does §1.3's “never mixed on one surface” mean one window or one component, when a glance crosses the status strip and the delegation tree?; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-501)
- OQ-502 — Should the pulse mark what needs the operator rather than what is running, and may a long wait grow in emphasis?; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-502)
- OQ-503 — Do secondary Buttons and icon controls read as controls under §1.7's flat styling?; ruled 2026-11-03; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-503)
- OQ-487 — May a release publish its Software Bill of Materials beside the artifacts of REQ-STARTUP-031?; ruled 2026-11-04; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-487)
