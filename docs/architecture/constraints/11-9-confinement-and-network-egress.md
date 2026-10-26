# Architectural constraints extracted from the specification — 9. Confinement and network egress

Part 11 of 22 of [the constraints](../constraints.md), which indexes every part.

## 9. Confinement and network egress

| # | Constraint | Label | Requirements |
|---|---|---|---|
| S-01 | Confinement is opt-in per session over exactly three modes; an **opportunistic "confine where possible" mode is explicitly forbidden**; the mode has exactly **two sources** and no third route. | HARD | REQ-SANDBOX-048, REQ-SANDBOX-049, REQ-SANDBOX-055, REQ-SANDBOX-122, REQ-TOOLS-114 |
| S-02 | The platform-to-mechanism map is **closed at two identifiers**; the mechanism is chosen **before** the search path is consulted; **no alias may be added**; native Windows has no backend at all. | HARD | REQ-SANDBOX-065, REQ-SANDBOX-073, REQ-TOOLS-115 |
| S-03 | Probing proceeds in increasing cost and **no subprocess is spawned once an earlier step has failed**; availability is **demonstrated, never inferred**, with literally fixed trial invocations. | HARD | REQ-SANDBOX-066, REQ-SANDBOX-067, REQ-SANDBOX-068, REQ-SANDBOX-070 |
| S-04 | **No simulated, stubbed, recorded or emulated backend ever yields "available"**; conformance is judged by observable effect on a live process on a real host, by six named effects. | HARD | REQ-TOOLS-119, REQ-SANDBOX-127 |
| S-05 | There is **no silent fallback, structurally**: preparing a command yields either a confined command string or an availability error, never the original command. | HARD | REQ-SANDBOX-074, REQ-SANDBOX-088, REQ-TOOLS-118 |
| S-06 | A session requiring confinement the host cannot deliver **does not start** — no session, no lock, no snapshot — and the refusal is the run stream's first and only entry. | HARD | REQ-SANDBOX-094 – REQ-SANDBOX-097, REQ-SANDBOX-126 |
| S-07 | A wrap failure at command time refuses only that command and **must never be absorbed by general error or retry handling**. | HARD | REQ-SANDBOX-078, REQ-SANDBOX-083, REQ-SANDBOX-084 |
| S-08 | Only a **new command string** is wrapped; a request carrying both a background flag and a session id counts as a new spawn and is wrapped, so the documented-invalid combination cannot become a single-field bypass. | HARD | REQ-TOOLS-120, REQ-SANDBOX-080 – REQ-SANDBOX-082 |
| S-09 | The protected names are always read-only inside confinement, with no setting able to remove the exclusion, and the exclusion attaches to the **name** rather than to what it points at. | HARD | REQ-SANDBOX-056, REQ-SANDBOX-057, REQ-TOOLS-116 |
| S-10 | The command travels into confinement as a **single shell argument** and every rendered path is quoted; **quoting is a security boundary**, because the wrapper is a string submitted to a live shell. | HARD | REQ-SANDBOX-063, REQ-SANDBOX-064, REQ-SANDBOX-079 |
| S-11 | Read access inside confinement is **deliberately unrestricted**. | HARD | REQ-SANDBOX-053, REQ-SANDBOX-060 |
| S-12 | **Two egress enforcement points with different mechanisms which must not be conflated**; destination-aware filtering of terminal traffic is explicitly out of scope and the limitation must be documented. | HARD | REQ-SANDBOX-047, REQ-SANDBOX-059, REQ-TOOLS-094, REQ-TOOLS-117 |
| S-13 | Host canonicalization is a fixed function with stated required results; the unknown host classifies deny, matches no pattern and counts as remote. | HARD | REQ-SANDBOX-006 – REQ-SANDBOX-008, REQ-SANDBOX-013, REQ-SANDBOX-019 |
| S-14 | Pattern grammar is exact-host or a single leading wildcard label and nothing else; matching advances **whole labels**; a wildcard does not cover the bare name. | HARD | REQ-SANDBOX-009 – REQ-SANDBOX-012, REQ-TOOLS-085 |
| S-15 | Consultation order is denied, then allowed, then default, so a specific denial outranks a broader allow. | HARD | REQ-SANDBOX-014, REQ-SANDBOX-015 |
| S-16 | "Local" is **textual and performs no name resolution**; everything else is remote and gated, explicitly including private and link-local ranges. **A name that resolves to loopback is still remote.** | HARD | REQ-SANDBOX-018, REQ-SANDBOX-019, REQ-TOOLS-087 |
| S-17 | Classification happens **before any connection is opened**, for the named URL and again for every redirect target; **redirects are never followed automatically**; the hop budget is 20; redirect resolution is specified exhaustively. | HARD | REQ-SANDBOX-022 – REQ-SANDBOX-024, REQ-SANDBOX-031, REQ-TOOLS-090 |
| S-18 | The `ask` disposition belongs to the gate, not the executor; a hop onto a **new** ask-host is refused; a hop onto an already-permitted host is not re-gated. | HARD | REQ-TOOLS-091, REQ-SANDBOX-027 – REQ-SANDBOX-030 |
| S-19 | The fetch failure-kind vocabulary is closed at eight spellings with fixed error classes, one spelled identically to the terminal observation's member of the same name. *Nine since 2026-10-13: `PD-TOOLS-013` revision 2 adds `interrupted` (`InterruptedError`) for a fetch its run cancels ([OQ-238](../open-questions/51-spikes-and-later-questions-18.md#oq-238)); still closed.* | HARD | REQ-TOOLS-092, REQ-SANDBOX-020, REQ-SANDBOX-024 – REQ-SANDBOX-026 |
| S-20 | The fetch timeout precedence chain is exactly three levels, the built-in reachable **only** where there is no owning run, with the supplying level reported. | HARD | REQ-SANDBOX-021, REQ-CONFIG-115, REQ-TOOLS-093 |
| S-21 | The policy is read from the owning run's current **saved** configuration at each call; unsaved settings edits reach nothing. | HARD | REQ-SANDBOX-038, REQ-SANDBOX-118, REQ-TOOLS-089 |
| S-22 | A denial *inside* active confinement is the host's own and is passed through **uninterpreted, un-normalized, un-annotated and un-retried**. | HARD | REQ-SANDBOX-128 |
| S-23 | Verification checks and probes run through the **same terminal enforcement point**; lifecycle hooks sit deliberately **outside** both confinement and the permission policy. | HARD | REQ-SANDBOX-123, REQ-SANDBOX-124, REQ-HOOKS-122 |
| S-24 | "Nothing left on the host filesystem" for carve-outs, against a documented deliberate artifact appearing inside a writable root. | CONFLICT | REQ-SANDBOX-077 vs REQ-TOOLS-123 |
| S-25 | Two host-canonicalization rules disagree about whether an IPv6 literal is bracketed. | CONFLICT | REQ-TOOLS-086 vs REQ-SANDBOX-006 |
| S-26 | Whether `fetch` honours system or environment proxy settings. | Silence | — |

---
