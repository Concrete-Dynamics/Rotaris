# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — Decision

Part 3 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

## Decision

**Alternative C, subject to OQ-23 being confirmed.**

- The packaged binary's entry point begins with: **if the first argument is the reserved token, hand
  the remaining arguments to the bundled runtime and propagate its exit status; do nothing else first.**
  No application bootstrap, no window, no writing to standard output, ever, on this path. On Windows
  this branch needs the runtime's node-mode environment flag or an equivalent, which is a spike item.
- The bundled runtime's location inside the packaged resources is resolved **by the branch**, not by
  command resolution — command resolution's only job is to recognise the token and report the entry
  unconditionally available.
- **The binding manifest is generated at build time, not hand-maintained.** The build starts the pinned
  runtime, reads its tool listing, and emits a module containing the tier membership and the never-grant
  names, then asserts `REQ-MCP-015`'s cardinality, disjointness and coverage checks. This is the
  difference between a manifest that is *checked* against the runtime and one that **is** the runtime's
  answer; `REQ-MCP-015`'s "an upstream rename fails a build rather than silently degrading a grant" is
  only true of the latter.
- The version cross-check of `REQ-MCP-095` is the same kind of build assertion over the shipped default
  entry and the setup manifest.
