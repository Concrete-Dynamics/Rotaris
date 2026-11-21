[Product directives](../directives.md) › PD-PROVIDER-002

<a id="pd-provider-002"></a>

### PD-PROVIDER-002 — a Claude subscription is used through the Claude Code tool the user installed and signed in to, and the product never handles its credential

1. **The provider is the user's own tool.** A `claude-code` model SHALL be answered by the Claude Code tool installed on
   the user's machine, found on the executable search path the application was started with and started by the product
   in that tool's documented non-interactive mode. The product ships no copy of the tool and changes nothing in it. The
   provider is unavailable exactly when the executable is not on that path, and its detail says so.

2. **No credential of the tool's is handled.** The product SHALL NOT ask for, read, store, log or pass on a Claude
   subscription credential: no token is pasted, none is minted on the product's behalf, and none is put into the
   subprocess's environment. The tool authenticates itself, as it does when the user runs it. Connecting the provider
   asks the tool whether it is signed in with a Claude subscription and, when it is, records a marker in the credential
   store — a fixed word, not a secret. A tool that is not installed, not signed in, or signed in with an API key or a
   cloud provider is refused with a sentence that says which. Signing out removes the marker and leaves the tool's own
   sign-in alone. Of what the tool reports about itself only three facts are kept — signed in, by subscription, the
   plan's name — and the account it names is never logged, stored or sent anywhere.

3. **The tool is a model, and the product runs every tool call.** The owner's ruling on OQ-17 (2026-10-06) is kept as it
   was written for the day this provider is built: every tool call a `claude-code` agent makes SHALL pass through the
   product's approval flow and produce REQ-EVENTS-041's tool events and domain 03's transcript rows, as a model
   provider's calls do. To that end the tool's built-in tools are switched off, it loads none of the user's or the
   project's own settings, hooks, instructions or tool servers, and the one tool server it is given is the product's
   own, on the loopback interface, which hands each call to the run loop and answers it with the loop's result. The
   product's sandbox, permission mode and hooks therefore govern a `claude-code` agent exactly as they govern any other.

4. **The precheck stays.** REQ-PROVIDER-048's conflicting-credential precheck runs before every prompt as written: with
   any of its sources present the run is refused, naming them, because the tool would then bill something other than
   the subscription.

5. **The catalogue stays as it is.** The provider keeps its entry, its `local-sdk` connection mode, its three aliases
   (REQ-PROVIDER-047) and its shared-quota cap. REQ-PROVIDER-008's mapping keeps the `api-key` token for it, since the
   vocabulary of REQ-PROVIDER-148 is closed; no surface offers a key field for it, and its label says how it is
   connected.

**As built.** `apps/desktop/src/run-host/claude-cli/` holds the client (a `ModelClient`: one process per turn, a step
that ends in tool calls leaving it alive until the next step answers them), the tool bridge and the launcher;
`packages/providers/src/flows/claude-code.ts` and `signin.ts` hold the connection and the marker; the authentication
window and the provider list show the provider's own sentence and no key field. Run for real on 2026-11-21 against the
owner's subscription: a run on `claude-code/haiku` read a workspace file with the product's `read_file`, its transcript
row and tool event produced by the run loop, and answered from it.

**Why, and what it costs.** The owner asked for the subscription to be usable "like openclaw does it", through the
Claude CLI. The specification's design — a token minted by `claude setup-token`, pasted into the product, stored, and
injected as `CLAUDE_CODE_OAUTH_TOKEN` (REQ-PROVIDER-044 to 046, 049) — is the pattern Anthropic's published terms for
Claude Code name as not permitted to third-party developers: "developers may not collect, store, or intermediate
Claude.ai credentials or session tokens" (the Claude Code legal and compliance page, read 2026-11-21). The same page
says its restrictions do not "prevent an end user from signing in to the unmodified Claude Code binary with their own
Claude subscription", and is silent on a third-party application starting that binary. The owner chose the second: the
product starts the user's own tool and never holds the credential. What it costs: the provider works only where the
tool is installed and signed in; each turn starts a process; a conversation that outlives its process is handed to the
next one as text, so the provider's own prompt cache is lost at that point; and whether Anthropic regards an
application starting the tool as covered by that sentence is not settled by anything it has published — the owner may
ask its commercial contact, and this directive is where the answer is recorded.

> **Supersedes:** REQ-PROVIDER-044, REQ-PROVIDER-045, REQ-PROVIDER-046
> **Narrows:** REQ-PROVIDER-008, REQ-PROVIDER-049, REQ-PROVIDER-117

*Raised by the owner, 2026-11-21; logged as [R-112](../requests.md#r-112). The owner chose between the two designs and kept the ruling of OQ-17 when asked, the same day.*
