# EXEC slice — architecture proposals — 1. Scope

Part 1 of 9 of [the exec proposal](../exec.md), which indexes every part.

## 1. Scope

This slice owns everything between "the model asked for a tool call" and "the call ran, or did not,
and the record says which":

- the public tool registry and its per-tool capability declarations (REQ-TOOLS-001 to REQ-TOOLS-010);
- the single permission gate every dispatch passes (REQ-TOOLS-011 to REQ-TOOLS-032);
- command-line decomposition and pattern matching (REQ-TOOLS-033 to REQ-TOOLS-040);
- the three permission presets, mode resolution and the unattended downgrade (REQ-TOOLS-041 to
  REQ-TOOLS-049, REQ-TOOLS-067 to REQ-TOOLS-077, REQ-SANDBOX-098 to REQ-SANDBOX-107);
- the approval flow, interactive and headless (REQ-TOOLS-050 to REQ-TOOLS-066);
- the permission audit trail and the verification-gate evidence file (REQ-TOOLS-078 to REQ-TOOLS-083,
  REQ-TOOLS-190, REQ-SANDBOX-112);
- terminal execution — foreground, background, outcome classification, live streaming
  (REQ-TOOLS-095 to REQ-TOOLS-113, REQ-TOOLS-126 to REQ-TOOLS-128, REQ-TOOLS-179, REQ-TOOLS-187);
- OS-level confinement on every supported platform (REQ-TOOLS-114 to REQ-TOOLS-125,
  REQ-SANDBOX-048 to REQ-SANDBOX-097, REQ-SANDBOX-127, REQ-SANDBOX-128);
- network egress policy and the `fetch` tool (REQ-TOOLS-084 to REQ-TOOLS-094, REQ-SANDBOX-001 to
  REQ-SANDBOX-047);
- secret redaction as a shared pass (REQ-TOOLS-171 to REQ-TOOLS-174);
- custom tool plugins and the MCP grant/narrowing surface as *gate* clients (REQ-TOOLS-161 to
  REQ-TOOLS-170).

The workspace file tools, search tools, task-list, artifact and delegation tools
(REQ-TOOLS-129 to REQ-TOOLS-158, REQ-TOOLS-188, REQ-TOOLS-189) sit inside domain 05 but their
substance belongs to other slices (workspace/context, library/artifacts, run orchestration). This
document treats them only where they constrain the gate, the registry, or the execution host — the
path fence as a permission input (REQ-TOOLS-018, REQ-TOOLS-129 to REQ-TOOLS-132), the `operation`
argument name that keeps `write_file` out of the command facet (REQ-TOOLS-135), and the atomic-write
and undo obligations that fix where file I/O may run (REQ-TOOLS-132).

The integrated terminal panel itself (REQ-SHELL-079 to REQ-SHELL-111, REQ-SHELL-166) belongs to the
desktop-shell slice, but its backend contract is ours: it is a *view onto agent-owned terminal
streams*, and every constraint it places on how those streams are produced is recorded here.

---
