from __future__ import annotations

from typing import TYPE_CHECKING, cast

from textual.command import DiscoveryHit, Hit, Provider

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from rotaris_core.tui.app import RotarisTuiApp


@traces(SWR.SWR_1169, SWR.SWR_1161, SWR.SWR_917)
@traces(SWR.SWR_1113, SWR.SWR_1116, SWR.SWR_1119, SWR.SWR_1122)
class RotarisCommandPalette(Provider):
    async def search(self, query: str) -> AsyncIterator[Hit]:
        from rotaris_core.tui.messages import (
            LogoutMessage,
            NewSession,
            PauseRun,
            PopInput,
            SendToBackground,
            SetTheme,
            StashInput,
            StopRun,
            ToggleReasoning,
            ToggleToolEvents,
        )
        from rotaris_core.tui.themes import THEMES

        app = cast("RotarisTuiApp", self.app)
        matcher = self.matcher(query)

        commands: list[tuple[str, object]] = [
            ("Stop current run", StopRun()),
            ("Pause current run", PauseRun()),
            ("New session", NewSession()),
            ("Toggle tool results", ToggleToolEvents()),
            ("Toggle reasoning", ToggleReasoning()),
            ("Send to background", SendToBackground()),
            ("Stash input", StashInput()),
            ("Pop input", PopInput()),
            ("Logout Copilot", lambda: app.post_message(LogoutMessage("copilot"))),
            ("Logout Codex", lambda: app.post_message(LogoutMessage("codex"))),
        ]

        for name, msg in commands:
            score = matcher.match(name)
            if score > 0:
                yield Hit(
                    score,
                    matcher.highlight(name),
                    lambda m=msg: app.post_message(m),
                    help=f"Execute command: {name}",
                )

        # Session picker is an action, not a message
        score = matcher.match("Continue session")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Continue session"),
                app.action_show_session_picker,
                help="Execute command: Continue session",
            )

        if (
            app.current_session is not None
            and app.current_session.execution_status == "paused_message_limit"
        ):
            score = matcher.match("Continue paused session")
            if score > 0:
                yield Hit(
                    score,
                    matcher.highlight("Continue paused session"),
                    app.action_resume_paused_message_limit,
                    help="Open message-limit confirmation for paused session",
                )

        score = matcher.match("MCP Servers")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("MCP Servers"),
                app.action_show_mcp_servers,
                help="Manage MCP server toggles",
            )

        score = matcher.match("Improvement Proposals")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Improvement Proposals"),
                app.action_show_improvement_proposals,
                help="Review post-run improvement proposals",
            )

        score = matcher.match("Startup Models")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Startup Models"),
                app.action_show_startup_models,
                help="Edit persistent startup model defaults",
            )

        score = matcher.match("Runtime Models")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Runtime Models"),
                app.action_show_runtime_models,
                help="Select a runtime provider model for this session",
            )

        score = matcher.match("Provider Settings")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Provider Settings"),
                app.action_show_provider_settings,
                help="Edit provider credentials and connection settings",
            )

        score = matcher.match("Tool result settings")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Tool result settings"),
                app.action_show_tool_result_settings,
                help="Configure tool result display (visibility, line limit)",
            )

        score = matcher.match("Compression settings")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Compression settings"),
                app.action_show_compression_settings,
                help="Configure context compression trigger percentage",
            )

        score = matcher.match("Dev Options")
        if score > 0:
            yield Hit(
                score,
                matcher.highlight("Dev Options"),
                app.action_show_dev_options,
                help="Open developer options and advanced diagnostics toggles",
            )

        for theme_name in THEMES:
            label = f"Theme: {theme_name}"
            score = matcher.match(label)
            if score > 0:
                yield Hit(
                    score,
                    matcher.highlight(label),
                    lambda n=theme_name: app.post_message(SetTheme(n)),
                    help=f"Switch UI theme to {theme_name}",
                )

    async def discover(self) -> AsyncIterator[DiscoveryHit]:
        from rotaris_core.tui.messages import (
            LogoutMessage,
            NewSession,
            PauseRun,
            PopInput,
            SendToBackground,
            SetTheme,
            StashInput,
            StopRun,
            ToggleReasoning,
            ToggleToolEvents,
        )
        from rotaris_core.tui.themes import THEMES

        app = cast("RotarisTuiApp", self.app)

        commands: list[tuple[str, object]] = [
            ("Stop current run", StopRun()),
            ("Pause current run", PauseRun()),
            ("New session", NewSession()),
            ("Toggle tool results", ToggleToolEvents()),
            ("Toggle reasoning", ToggleReasoning()),
            ("Send to background", SendToBackground()),
            ("Stash input", StashInput()),
            ("Pop input", PopInput()),
            ("Logout Copilot", lambda: app.post_message(LogoutMessage("copilot"))),
            ("Logout Codex", lambda: app.post_message(LogoutMessage("codex"))),
        ]

        for name, msg in commands:
            yield DiscoveryHit(
                name,
                lambda m=msg: app.post_message(m),
                help=f"Execute command: {name}",
            )

        yield DiscoveryHit(
            "Continue session",
            app.action_show_session_picker,
            help="Execute command: Continue session",
        )

        if (
            app.current_session is not None
            and app.current_session.execution_status == "paused_message_limit"
        ):
            yield DiscoveryHit(
                "Continue paused session",
                app.action_resume_paused_message_limit,
                help="Open message-limit confirmation for paused session",
            )

        yield DiscoveryHit(
            "MCP Servers",
            app.action_show_mcp_servers,
            help="Manage MCP server toggles",
        )

        yield DiscoveryHit(
            "Improvement Proposals",
            app.action_show_improvement_proposals,
            help="Review post-run improvement proposals",
        )

        yield DiscoveryHit(
            "Startup Models",
            app.action_show_startup_models,
            help="Edit persistent startup model defaults",
        )

        yield DiscoveryHit(
            "Runtime Models",
            app.action_show_runtime_models,
            help="Select a runtime provider model for this session",
        )

        yield DiscoveryHit(
            "Provider Settings",
            app.action_show_provider_settings,
            help="Edit provider credentials and connection settings",
        )

        yield DiscoveryHit(
            "Tool result settings",
            app.action_show_tool_result_settings,
            help="Configure tool result display (visibility, line limit)",
        )

        yield DiscoveryHit(
            "Compression settings",
            app.action_show_compression_settings,
            help="Configure context compression trigger percentage",
        )

        yield DiscoveryHit(
            "Dev Options",
            app.action_show_dev_options,
            help="Open developer options and advanced diagnostics toggles",
        )

        for theme_name in THEMES:
            yield DiscoveryHit(
                f"Theme: {theme_name}",
                lambda n=theme_name: app.post_message(SetTheme(n)),
                help=f"Switch UI theme to {theme_name}",
            )
