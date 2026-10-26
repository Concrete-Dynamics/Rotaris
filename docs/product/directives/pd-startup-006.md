[Product directives](../directives.md) › PD-STARTUP-006

<a id="pd-startup-006"></a>

### PD-STARTUP-006 — the setup statement names the moments the build carries

**The setup statement.** REQ-STARTUP-160's first content statement — what About & Legal's network-activity disclosure says
of setup — SHALL name the moment at which this build reaches the network for a tool: **the first time a tool is needed**,
when a tool server's pinned package is fetched by its package runner as that server first starts (`PD-STARTUP-005`), and
when a language's server is provisioned by the bundled code-intelligence runtime at that language's first use
(REQ-STARTUP-058's second list, REQ-STARTUP-159, REQ-STARTUP-064 as amended under ESC-32, REQ-MCP-118). The statement SHALL
say that the request reaches the package registry that serves the tool, and only for work the machine has not already done,
and SHALL name no host. This moment is the specification's own; the directive records it and extends nothing.

**What only a build that carries them names.** First-launch machine setup, cache warm-up and the pinned tool-archive hosts
SHALL be named only in a build that carries machine setup (REQ-STARTUP-060 onward) or REQ-STARTUP-064's warm-up. The change
that builds either one SHALL restore the matching words in this statement, and the notices file's machine-tools sentence,
in the same commit.

**What is unchanged.** REQ-STARTUP-160's update-check and exposure statements, the surface (About & Legal, read in place,
reachable at the minimum window size), its readability with every outbound request blocked, and the clause that the
disclosure names no host, endpoint or request the document does not require.

**As built.** `NETWORK_DISCLOSURE.setup` in `packages/ui/src/settings/About.tsx`: "The first time a tool is needed, such as a
tool server or a language's code intelligence, it may be downloaded from the package registry that serves it, and only when
this machine does not already have it."

**Why, and what it costs.** REQ-STARTUP-160's first statement names two moments this build does not carry — machine setup
and cache warm-up are not built (OQ-73, deferred by R-071) — and the archive hosts it never contacts, while the requests of
that kind it does make, at a tool's first use, went unnamed until the build added a third moment beside the two (OQ-261). A
disclosure that names what the build does not do disagrees with its behaviour, which the requirement itself calls
non-conformant on the disclosure. What it costs: the statement must change again when machine setup or the warm-up ships,
and a reader comparing it with REQ-STARTUP-160's words finds two moments missing.

> **Narrows:** REQ-STARTUP-160

*Ruled 2026-10-13 by the consortium under the owner's delegation ([R-072](../requests.md#r-072)), the ruling of
[OQ-261](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-261).*

> **First execution, 2026-10-14 (fin43, `fin43-notices-and-config`).** Built the day after it was ruled. **What was
> measured.** `About.test.ts`'s setup case requires "first time a tool is needed", "may", "package registr" and "does not
> already have it" and refuses "first launch", "warming caches" and "tool archives"; it was red on the text before. `pnpm
> settings-proof`'s launches 1 and 1″ read the three statements, no host, the new phrases present and the three absent from
> statement 1, and a full pointer selection of the section at 1000×680. **What was not measured.** No live run: nothing on
> the network changed, only the words. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
