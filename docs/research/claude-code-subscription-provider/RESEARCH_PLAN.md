# Research Plan: Claude Code Subscription as a Rotaris Provider

Status: draft research notes, not yet a requirements document
Date: 2026-08-03

## Question

Can Rotaris add a new provider that runs a private local Python harness
against a Claude Code / Claude subscription (Pro/Max/Team/Enterprise) instead
of pay-as-you-go Anthropic API billing?

## Answer

Yes. For a private local Python harness, use Anthropic's **official Claude Agent SDK** with **Claude Code subscription OAuth**—not the Messages API endpoint. The documented non-interactive route for a Max plan is `claude setup-token` plus `CLAUDE_CODE_OAUTH_TOKEN`; that token authenticates against your subscription rather than API billing. [docs.anthropic](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)

## Architecture

Your Python process calls the **Agent SDK**, which runs the Claude Code agent runtime locally; it is not a direct HTTP client for `https://api.anthropic.com/v1/messages`. The SDK supplies the same agent loop, tool use, context management, and session model as Claude Code. [code.claude](https://code.claude.com/docs/en/agent-sdk/overview)

```text
your Python harness
  -> claude-agent-sdk
    -> locally installed Claude Code runtime
      -> Anthropic subscription OAuth
        -> Max-plan usage limits
```

Do not build an OAuth-to-OpenAI-compatible proxy or manually replay tokens against undocumented endpoints. Use the SDK/CLI authentication path directly; it is the documented path for automated environments using a Pro, Max, Team, or Enterprise subscription. [docs.anthropic](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)

## Install and authenticate

Install Claude Code first, log in once with the Claude.ai account that owns your Max subscription, then install the Python SDK in a virtual environment. A normal `/login` stores subscription credentials locally; on Linux they are stored in `~/.claude/.credentials.json` with mode `0600`. [anthropic](https://www.anthropic.com/team)

```bash
# Create a project environment
python3 -m venv .venv
source .venv/bin/activate
pip install claude-agent-sdk

# Install/update Claude Code through Anthropic's official installer
curl -fsSL https://claude.ai/install.sh | bash

# Interactive, one-time subscription login
claude
# Complete browser login with your Max account
```

For a local, attended harness on the same machine and user account, that `/login` credential is sufficient: subscription OAuth credentials are the default authentication method when no higher-priority credential is present. [docs.anthropic](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)

For an unattended local process, systemd service, cron job, container, or isolated virtual environment, mint an explicit long-lived OAuth token:

```bash
claude setup-token
```

The command opens a browser authorization flow and prints a token; it is not saved by Claude Code. Set it only in the environment that runs your private harness. The documented token lifetime is one year, it requires an eligible paid subscription, and it is restricted to model inference. [docs.anthropic](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)

```bash
export CLAUDE_CODE_OAUTH_TOKEN='paste-token-here'
python agent.py
```

Persist it through a local secret manager, a root-owned systemd `EnvironmentFile`, or a file readable only by your Unix user; never commit it to Git, bake it into an image, or expose it through a web service.

## Avoid API billing

Authentication selection has a specific precedence. `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, and an `apiKeyHelper` all take precedence over `CLAUDE_CODE_OAUTH_TOKEN`; if any is present, your process may use API/gateway credentials instead of consuming Max usage. [docs.anthropic](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)

Before testing, clear conflicting variables:

```bash
unset ANTHROPIC_API_KEY
unset ANTHROPIC_AUTH_TOKEN
unset CLAUDE_CODE_USE_BEDROCK
unset CLAUDE_CODE_USE_VERTEX
unset CLAUDE_CODE_USE_FOUNDRY

export CLAUDE_CODE_OAUTH_TOKEN='...'
python agent.py
```

For interactive CLI verification, run `/status` in `claude`; its login information should show your subscription account rather than an API key. [docs.anthropic](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)

## Minimal Python harness

Use `query()` for isolated jobs such as "inspect this repository and propose a patch." It creates a fresh session by default and yields streamed SDK messages asynchronously. [anthropic](https://www.anthropic.com/team)

```python
# agent.py
import asyncio
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    query,
)

PROJECT = Path.home() / "src" / "my-project"

async def main() -> None:
    options = ClaudeAgentOptions(
        cwd=PROJECT,
        system_prompt=(
            "You are a careful software-engineering agent. "
            "Inspect before modifying. Explain every intended change."
        ),
        max_turns=12,
        allowed_tools=["Read", "Glob", "Grep"],
    )

    prompt = """
    Inspect the repository and identify the most important missing tests.
    Do not modify files. Return a prioritized, concrete test plan.
    """

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text, end="", flush=True)
        elif isinstance(message, ResultMessage):
            print(f"\n\nCompleted: {message.subtype}")

if __name__ == "__main__":
    asyncio.run(main())
```

The SDK supports `cwd`, system prompts, tool configuration, MCP servers, session continuation, hooks, custom permission decisions, maximum turns, and custom in-process MCP tools through `ClaudeAgentOptions`. [anthropic](https://www.anthropic.com/team)

For write-capable workflows, do **not** start with unconditional edit acceptance. Begin with read-only tools, then implement a `can_use_tool` handler that permits writes only within an allowlisted repository or worktree; the SDK provides this callback specifically to approve, deny, or rewrite tool inputs. [anthropic](https://www.anthropic.com/team)

## Persistent agent loop

Use `ClaudeSDKClient` when your harness needs a stateful, multi-turn agent: planning, reviewing tool output, retrying a failed command, and then asking for a patch in the same context. It maintains the conversation session and supports interruption. [anthropic](https://www.anthropic.com/team)

```python
import asyncio
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
)

async def print_response(client: ClaudeSDKClient) -> None:
    async for message in client.receive_response():
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text, end="", flush=True)

async def main() -> None:
    options = ClaudeAgentOptions(
        cwd=Path.home() / "src" / "my-project",
        max_turns=20,
        allowed_tools=["Read", "Glob", "Grep"],
    )

    async with ClaudeSDKClient(options=options) as client:
        await client.query("Map the project architecture. Do not edit files.")
        await print_response(client)

        await client.query(
            "\nNow identify one low-risk refactoring opportunity and "
            "describe the exact files and tests affected. Still do not edit."
        )
        await print_response(client)

if __name__ == "__main__":
    asyncio.run(main())
```

## Local tools

For private harness-specific capabilities—such as querying a local research index, checking a self-hosted Git service, or retrieving structured project metadata—define an in-process MCP tool with `@tool`, wrap it with `create_sdk_mcp_server()`, and expose only the specific tool names you want the agent to invoke. The Python SDK supports typed tool schemas and lets you pass the in-process server through `ClaudeAgentOptions.mcp_servers`. [anthropic](https://www.anthropic.com/team)

Keep secrets out of the model process where possible: rather than give the agent broad shell access plus cloud credentials, create narrow tools such as `get_ci_status(repo)` or `search_notes(query)` that perform only the required operation.

## Operational limits

Your tasks will consume the shared Max subscription allowance alongside Claude web/desktop and Claude Code use. Treat the harness as a personal agent rather than a high-concurrency worker fleet: serialize jobs initially, cap turns, use explicit task queues, and cancel redundant runs when an agent is already working on the same repository. Anthropic's policy language frames Pro/Max use around ordinary, individual usage of Claude Code and the Agent SDK. [code.claude](https://code.claude.com/docs/en/legal-and-compliance)

The documented OAuth-token route fits the private, one-user setup described above. If the harness is later exposed to colleagues, clients, a shared dashboard, or arbitrary external requests, switch to a Console API key and pay-as-you-go API billing instead; Anthropic disallows routing other users' requests through Pro/Max credentials. [code.claude](https://code.claude.com/docs/en/legal-and-compliance)

## Open questions for a Rotaris provider implementation

- Provider contract fit: Rotaris's `BUILTIN_PROVIDERS` model (see [docs/requirements/700-providers-auth.md](../../requirements/700-providers-auth.md)) assumes LiteLLM-routed, API-key or OAuth-token providers reachable through a base URL. The Agent SDK is a local subprocess/runtime, not an HTTP endpoint — needs a distinct execution path rather than a LiteLLM `base_url` override.
- Auth flow: `claude setup-token` is an interactive one-time browser mint, not a device/browser-redirect flow Rotaris can drive itself (cf. SWR-705/SWR-706). Likely surfaced as "run `claude setup-token` yourself, paste the result" rather than a fully automated login.
- Concurrency/rate limits: Max-plan usage is shared with the user's interactive Claude Code/Desktop use; needs the same kind of per-model concurrency cap already used for DeepSeek (`max_parallel`) to avoid starving the user's own interactive sessions.
- Tool surface mismatch: the SDK ships its own tool loop (Read/Glob/Grep/etc.) rather than exposing raw chat completions, so Rotaris's existing persona/tool wiring may not map 1:1 — needs a decision on whether to run the SDK as a sub-agent shim or reimplement tool routing.
