## The Initialize project button refuses an already running setup

When a project opens, its background initialization may start the code-intelligence setup before the user opens MCP Settings. The settings card reads status once on mount and polls only while its local status is `running`. If that first read sees `idle`, pressing **Initialize project** after the background run starts receives `mcp.setup.running`; the card still shows "Not started" and the refusal, though setup is progressing. The built code-intelligence proof reproduced this order.

REQ-WORKSPACE-083 starts applicable background tasks on open. REQ-MCP-112 correctly refuses a second concurrent setup run, and requires its progress and outcome to be readable. On the `mcp.setup.running` refusal the settings action now reads the current setup status and follows that run. Other refusals retain their reason. The built proof checks the card's three completed steps and final outcome.

The project-switch failure was also observed before the 2026-09-29 initialization repairs on `main`: its coordinator now cancels the outgoing workspace's run and starts the replacement after that setup ends. See ADR-0064's seventh round and the workspace-switch tests in `initialization.test.ts`.
