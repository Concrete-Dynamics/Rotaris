[Product directives](../directives.md) › PD-PROVIDER-003

<a id="pd-provider-003"></a>

### PD-PROVIDER-003 — each launch checks the signed-in providers, the Claude Code tool is connected when it is found, and its catalogue is the one the tool reports

1. **The Claude Code catalogue is the tool's own.** Discovery for `claude-code` SHALL ask the installed tool which
   models it offers the signed-in account, by the tool's own control request in its non-interactive mode — a request
   that sends no prompt and spends nothing — and record every model the tool names, each under the identifier the tool
   takes for it, with the name, the effort levels and the resolved model the tool states. The tool's `default` entry is
   not recorded: it names no model of its own. Where the tool names its aliases `opus`, `sonnet` and `haiku`, those
   seed the large, medium and small slots, since each names the newest model of its family. Where the tool cannot be
   asked or answers nothing usable, the three aliases of REQ-PROVIDER-047 are the catalogue, so a tool too old to
   answer still connects.

2. **A tool found signed in is connected without being asked for.** At launch, when the Claude Code tool is on the
   search path, signed in with a Claude subscription, and the product holds neither a marker nor a snapshot record for
   the provider, the product SHALL connect it as PD-PROVIDER-002 clause 2 connects it — the marker, the catalogue, the
   slot assignment — and say so in one informational notice. A provider the user signed out of keeps its snapshot
   record and is therefore never connected again by this clause; it is connected again only by the user. Nothing of
   PD-PROVIDER-002's clause 2 is loosened: no credential of the tool's is read, stored or passed on.

3. **Each launch checks what is signed in.** After the first window is shown, the product SHALL run REQ-PROVIDER-118's
   health check once for every provider that holds a stored credential, side by side, none waiting on another: the
   credential verified and silently refreshed where it expired, the provider's free catalog call made, the discovered
   models persisted as a catalog refresh persists them. Each provider's row shows the state the check found. A check
   that ends other than healthy is logged with its detail and reported in one warning notice naming every such
   provider, published only when no other notice is current. The check never blocks the window, a run or the composer,
   and a launch with no stored credential makes no call.

4. **Sign-out marks the snapshot record signed out.** Sign-out SHALL mark the provider's snapshot
   record `authenticated: false`, changing nothing else in it. A record so marked seeds no startup slot
   (REQ-PROVIDER-091 as written), so a provider the user signed out of no longer names the models a run starts on. A
   record that holds no credential for any other reason is left as it is: a provider authenticated by its model
   configuration has a record and no stored credential, and is not signed out.

**As built.** `packages/providers/src/flows/claude-code.ts` holds the request and the reading of its answer
(`localToolModelsOf`); `signin.ts` holds `connectLocalToolIfFound`, `launchCheck` and the one field sign-out writes;
`apps/desktop/src/main/claude-code-tool.ts` starts the tool, by two fixed command lines, and main runs the check once
per launch after the first window is shown. Run on 2026-11-21 in the built application against the owner's signed-in
tool: a fresh launch connected it and recorded the 13 models it named; the next launch read it healthy; signed out,
its record read `authenticated: false` and the launch after left it alone. The slot heuristic, given dated identifiers,
first seeded the slots with the oldest model of each family, which is why clause 1 names the aliases. The first build
also marked, at launch, every record with no stored credential; `pnpm resilience-proof` went red on three scenarios
whose provider is authenticated by its model configuration, and clause 4 was narrowed to sign-out. Not run: a turn
on a dated identifier, and the Windows command-shim line.

**Why, and what it costs.** The owner, on the first release that carried the provider sign-ins: the Claude sign-in
offered three models where the tool offers the account many more; a tool already installed had to be found and
connected by hand; and nothing told a user at launch that a provider had stopped answering or a catalogue had moved.
Clause 4 repairs what the first real sign-outs showed
([the note](../../archive/defects/a-signed-out-provider-keeps-seeding-the-startup-slots-so-runs-are-refused.md)): two
requirements, each met, left the snapshot saying a signed-out provider was authenticated, and every run was refused.
What it costs: a launch with signed-in providers makes one catalog call each and, with the tool installed, starts it
twice (its status, its models); a launch on a machine with the tool signed in connects a provider the user did not
name, once; and clause 4 makes sign-out write the snapshot, which REQ-PROVIDER-102 said it never does.

> **Narrows:** REQ-PROVIDER-047, REQ-PROVIDER-060, REQ-PROVIDER-102
> **Extends:** REQ-PROVIDER-118, REQ-PROVIDER-147

*Raised by the owner, 2026-11-21; logged as [R-114](../requests.md#r-114).*
