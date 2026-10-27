# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Open question

Part 6 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Open question

`REQ-SHELL-005` says that in demo mode "the process opens no outbound network connection for its whole
lifetime", while `REQ-SHELL-162` lets a demo window be opened from a non-demo window and
`REQ-STARTUP-057` says a non-demo window of the same process is unaffected and checks for updates
normally. **Those cannot both hold once a mixed process exists.** Either the network-silence claim is
per-window rather than per-process, or a demo window must be its own process. **SR-1 sharpens this
rather than resolving it**: with one instance, a mixed process is not an unusual configuration to be
avoided but the only one available, and "a demo window must be its own process" is no longer an option
the architecture can take, because a second process of this application is exactly what
`REQ-STARTUP-161` forbids. The per-window reading is therefore the only one that can hold, and it should
be stated in the requirement rather than inferred here. See OQ-34.
