# Tooling

Everything an agent can reach outside its own conversation, and the single gate every reach passes
through. The gate is the centre of this context: a tool call resolves to allow, ask or deny before
anything executes, and the decision is recorded.

Terms are derived from `docs/spec/05-tools-permissions-approvals.md` and
`docs/spec/10-sandbox-network-egress.md`. Where a decision is *kept* belongs to
[Session Record](../store/CONTEXT.md).

## Language

### The tool surface

**Public tool surface**:
The closed set of tool names a persona may declare under `tools:`. It never names a tool server:
exactly one key grants a server, and `tools:` carries public tool names alone. — `REQ-TOOLS-001`,
`REQ-TOOLS-166`
_Avoid_: built-in tools, the tool list

**Tool-name registry**:
The public declaration of what each tool does — reads workspace files, writes workspace files, runs
commands — which other domains resolve capability questions against, so that a tool added later
joins or stays out of a bundle by its own declaration. — `REQ-CONFIG-231`

**Custom tool plugin**:
A module loaded in-process from the workspace's designated plugin folder, extending the surface
without changing the gate it passes through. — `REQ-TOOLS-161`, `REQ-TOOLS-165`

### The gate

**Permission gate**:
The single point every tool call passes through — built-in, plugin or tool-server alike — resolving
to `allow`, `ask` or `deny` before anything executes. — `REQ-TOOLS` §2
_Avoid_: permission check, ACL, policy engine

**Permission mode preset**:
One of exactly three shipped presets, ordered by restrictiveness: `restricted`, `ask`,
`autonomous`. These three spellings are the whole vocabulary and they are stable persisted values. —
`REQ-TOOLS-041`, `REQ-TOOLS-047`
_Avoid_: permission level, security mode, yolo mode

**Downgrade**:
The automatic tightening of a permissive mode requested where no one can answer a prompt, unless
confinement is active or the workspace has explicitly opted out. — `REQ-TOOLS-067`

**Rule id**:
The stable identifier of whichever rule produced a decision, spelled `{mode}:{rule-name}` for a
preset rule and carried in refusals and in the audit, so a decision can be traced to its cause. —
`REQ-TOOLS-039`, `REQ-SANDBOX` rule identifiers

**Decision source**:
Which of the twelve origins a decision came from, recorded beside it. — `REQ-TOOLS-078`

**Approval**:
The interactive prompt raised for an `ask`, carrying a request id, the redacted command and the
argument summary. — `REQ-TOOLS` §5
_Avoid_: confirmation, consent dialog

**Headless resolution**:
How an `ask` resolves when no one can answer: the fail-safe policy `deny` or `abort`. An
unrecognised value behaves as `deny`. — `REQ-TOOLS-065`

**Denial**:
A refusal returned to the agent as a recoverable tool error, not as a run failure. — `REQ-TOOLS` §2

### Redaction

**Mask**:
The product's single rendering of a secret value. There is one mask across the product — not one for
stored secrets and another for command lines and argument summaries. — `REQ-TOOLS-171`

**Key-name test**:
The single test for whether a key's value is secret-like, applied by every surface that writes or
renders configuration. — `REQ-TOOLS-172`

**Request summary**:
The redacted account of what a call asked for, carried into an approval and into the audit. It
carries no argument values beyond the redacted command facet inside it. — `REQ-TOOLS-016`

### Running commands

**Terminal tool**:
The tool that runs a command, in the foreground or as a background session. — `REQ-TOOLS` §10, §11

**Background session**:
A long-running terminal session an agent starts and later reads from, identified by `ts_` plus eight
hex characters. — `REQ-TOOLS` §11

**Stream**:
The live character output of one terminal session, delivered to whatever surfaces are watching under
an aggregate delivery bound taken across every window together. — `REQ-TOOLS-126`,
`REQ-MONITOR-306`

**Outcome kind**:
The classification of how a command ended, distinct from its exit code. — `REQ-TOOLS` §12

**Failure kind**:
Why a call failed, drawn from a per-tool vocabulary — `timeout`, `invalid_request`,
`execution_error`, `sandbox_unavailable` for the terminal. — `REQ-SANDBOX` terminal observation
additions

**Path fence**:
The boundary confining the file and search tools to the workspace. Reaching outside it is a
configuration decision, never a launch-time one. — `REQ-TOOLS-130`, `REQ-TOOLS-191`
_Avoid_: jail, chroot, workspace root check

### Confinement and egress

**Confinement**:
The operating-system layer restricting what a command may write and whether it may reach the
network. It is inactive unless the workspace turns it on, and it **refuses to run commands** rather
than silently falling back when it cannot be proven working. — `REQ-SANDBOX-048`, `REQ-SANDBOX` §11
_Avoid_: sandbox as a verb; "sandboxed" is the persisted flag and "sandbox backend" the named
implementation, but the behaviour is confinement

**Confinement mode**:
`off`, `workspace-write`, or `read-only`. — `REQ-SANDBOX-048`

**Availability verdict**:
The four-field answer the confinement service gives — `available`, a backend name, one sentence of
reason, one of remediation — demonstrated by a trial launch rather than inferred, taken at most once
per process and cached. Every surface that reports availability presents this same text. —
`REQ-SANDBOX-067`, `REQ-SANDBOX-071`
_Avoid_: "sandbox check", or "probe result" for the value; the probe is the act, the verdict is what it returns

**Confinement specification**:
What a confinement would be, computed once and identically on every platform: the effective writable
roots, the carve-outs for the protected names, and the network flag. The per-platform renderers
consume it and decide nothing, which is where backend parity comes from. — `REQ-SANDBOX-058`,
`REQ-SANDBOX-061`
_Avoid_: "sandbox config" — the configuration is the six keys; this is what they resolve to for one command

**Carve-out**:
A protected name (`.git`, `.rotaris`) made unwritable inside a writable root. Which of three forms it
takes turns on whether the name exists when the invocation is rendered, and no form leaves anything on
the host filesystem. — `REQ-SANDBOX-056`, `REQ-SANDBOX-077`

**Effective writable root**:
A directory writable inside an active confinement: the session's actual execution directory first,
then each configured additional root, duplicates removed and missing ones skipped. — `REQ-SANDBOX-058`
_Avoid_: "allowed path" — that is the file tools' fence (`REQ-TOOLS-132`), a different boundary

**Egress policy**:
The per-host disposition applied to the `fetch` tool — `allow`, `ask` or `deny` — with allow and
deny host lists. An unclassifiable host is denied. — `REQ-SANDBOX-001`

**Host pattern**:
An exact host or `*.` plus a host, compared whole label by whole label. The wildcard stands for at
least one leading label and does not include the bare name. Any other use of `*` is a configuration
error. — `REQ-SANDBOX` host pattern grammar

**Network-reaching command**:
A terminal command the classifier recognises as reaching the network by its leading tokens, gated by
the permission layer rather than by the egress policy. — `REQ-TOOLS-094`, `REQ-SANDBOX-043`
