import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { compareCodePoints, millis, REDACTION_MARK, redact, toIsoUtc, type Clocks, type Millis } from '@rotaris/kernel';
import type { McpHealth, McpListing, McpProvisioning, McpSecretRow, McpSecretsView, McpServerRow, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { resolveUserDirs, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import {
  AGENTS_FILE_NAME, classifyWorkspaceRoot, CODE_INTELLIGENCE_LANGUAGE_SERVERS, CODE_INTELLIGENCE_MARKER_SEGMENTS, CODE_INTELLIGENCE_MEMORY_LISTING_TOOL, CODE_INTELLIGENCE_SERVER_NAME,
  CODE_INTELLIGENCE_SETUP_STEPS, codeIntelligenceLanguageServerStore,
  deriveSetupInvocation, DiagnosticSink, launchedProjectOf, mcpConfigurationForExecutionRoot, narrowAfterUpdate, renderMcpSection, resolvePersonaMcp,
  type Diagnostic, type DropReason, type LoadedConfiguration, type McpResolvedServer, type PersonaMcpSurface,
} from '@rotaris/config';
import { errorObservation, observation, type ToolExecutor } from '@rotaris/agent-tools';
import type { McpGrantEvidence, SessionWriter } from '@rotaris/engine';
import { CALL_TIMEOUT_DEFAULT_MS, HealthProbe, runSetupSteps, SETUP_SHUTDOWN_GRACE_MS, SessionConnections, ToolDiscovery, type Connected, type McpLog, type ServerDescription } from '@rotaris/mcp';

/**
 * The run host's MCP holder — ADR-0034's placement as READ on first execution: every path lives here, in the one
 * process that lives for the application's life and owns every session. REQ-MCP-047 wants one holder of a tool
 * list for the whole application ("there is no second holder of a tool list anywhere"), so the settings
 * category's probes and its listing are answered from THIS process over the `mcp.*` requests, not from a second
 * instantiation in the window's process — ADR-0034 consequence 3 ("two processes may hold different tool lists")
 * is thereby falsified and kept in the ADR beside this reading.
 *
 * What it holds: the discovery memo (per process, invalidated on every configuration load — every run start
 * reloads, REQ-MCP-047), the probe path, the per-session connection registries (closed at shutdown, the one place
 * the engine releases session locks today), the session override of REQ-MCP-094 (never on disk, discarded at
 * exit), the ONE diagnostic sink, and the per-persona surface memo keyed on the versions of its three inputs so the
 * spawn-time evidence and the tool port read literally one resolution (REQ-TOOLS-010, REQ-MCP-065). *Falsified
 * 2026-09-29 (live-run finding D7; the sentence is kept as written):* the key also carries the reserved names, and the
 * evidence reserves none while the port reserves the persona's native tools, so a spawn resolves twice. The two differ
 * only where a server tool collides with a native name and is offered under its prefix; the second resolution now
 * writes no line the first already wrote (`announced`), which is what the doubled log lines were.
 */
/**
 * REQ-MCP-034's isolated-run clause, at the one place a run's MCP configuration is handed on: the configuration a run in
 * `executionRoot` launches its servers from — the loaded one when the run works in the workspace itself, and otherwise the
 * view in which every server REQ-MCP-034's stage bound carries the working tree's root (`mcpConfigurationForExecutionRoot`).
 * The tool port's `ready()` and the discovery `session.start` runs ahead of the run both read it, so discovery and launch
 * agree (REQ-MCP-050). Until 2026-10-03 both handed on the loaded configuration, bound to the anchoring checkout
 * (`docs/defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md`).
 */
export function configurationForExecutionRoot(cfg: LoadedConfiguration, executionRoot: string): LoadedConfiguration {
  const mcp = mcpConfigurationForExecutionRoot(cfg.mcp, cfg.workspaceRoot, executionRoot);
  return mcp === cfg.mcp ? cfg : { ...cfg, mcp };
}

/** The `project <path>` words a launch line carries for a server launched against a project (REQ-MCP-034), or ''. */
function projectWords(description: ServerDescription): string {
  const project = launchedProjectOf(description as McpResolvedServer['description']);
  return project === null ? '' : `project ${project}`;
}

export interface McpHostDeps {
  readonly clocks: Clocks;
  readonly log: (message: string, level?: 'info' | 'warn' | 'debug') => void;
  /**
   * REQ-MCP-044 channel 1: the warning as a transient acknowledgement of kind `warn` (Part V). It rode `notice.publish` with an
   * 8 s `ttlMs` from Part S; REQ-NOTIFY-040 forbids a notice leaving on a timer, and REQ-NOTIFY-011 fixes the transient lifetime
   * once (4200 ms, not this requirement's 8 s — the disagreement is ADR-0049's open question), so the surface is the
   * acknowledgement stack and the lifetime is the stack's. Channel 2, the `mcp_config` issue, is unchanged.
   */
  readonly acknowledge: (a: { kind: 'warn'; title: string; body?: string }) => void;
  /** OQ-22's reading: the run host's own environment, which every stdio child inherits under its server's map. */
  readonly parentEnv: Readonly<Record<string, string>>;
  /**
   * REQ-STARTUP-158 / REQ-STARTUP-007: the version the running desktop reports, read from the one declared place
   * (`@rotaris/platform`'s `installedProductVersion`) — the `clientInfo.version` every server is told on all three paths.
   */
  readonly productVersion: string;
  /**
   * Part AS (ADR-0064): the setup status, pushed on every change. ADR-0064's `code-intelligence-setup`
   * task follows a live setup through this, which is what lets REQ-WORKSPACE-109 show a step "at the
   * moment that step finishes" without main asking on a cadence (SR-3). Optional so the host stays
   * constructible in a test that does not care.
   */
  readonly publishSetup?: ((status: McpSetupStatus) => void) | undefined;
}

export interface McpSessionContext {
  readonly sessionId: string;
  readonly writer: SessionWriter | null;
}

interface SurfaceMemo { readonly key: string; readonly surface: PersonaMcpSurface; readonly diagnostics: readonly Diagnostic[] }


/**
 * REQ-MCP-118 (ESC-32 / IC-7): the disclosure's data, from the manifest and the runtime's home under the per-user data
 * directory (REQ-STARTUP-145) — on every status the host publishes, idle included, so it is readable before any fetch.
 */
function provisioning(): McpProvisioning {
  return {
    store: codeIntelligenceLanguageServerStore(resolveUserDirs().data),
    servers: CODE_INTELLIGENCE_LANGUAGE_SERVERS.map((l) => ({ language: l.language, provisioner: l.provisioner, packages: l.packages.map((p) => ({ name: p.name, version: p.version, source: p.source, license: p.license })) })),
  };
}

function idleSetup(): McpSetupStatus {
  return { provisioning: provisioning(), state: 'idle', steps: CODE_INTELLIGENCE_SETUP_STEPS.map((s) => ({ id: s.id, label: s.label, status: 'pending', detail: '', elapsedMs: null })), outcome: null, message: '', containsCode: null, invocation: '', startedAt: null, applicable: false };
}

/**
 * REQ-MCP-099's contains-code input is REQ-WORKSPACE-098's **classification**, and since ADR-0064 it is
 * computed in exactly one place (`classifyWorkspaceRoot`, `@rotaris/config`).
 *
 * **The falsified reason, kept beside its replacement.** The walk that stood here answered by asking
 * `hasIndexableExtension` — the bundled runtime's own 152-suffix manifest — and skipped `.hg` and
 * `.svn` alongside `.git`. Two things were wrong with that and neither was visible from inside this
 * file. REQ-WORKSPACE-099 fixes the set at exactly 23 entries, overridable per workspace through
 * `project_init.source_extensions`, and says "the same set SHALL apply everywhere classification is
 * decided"; REQ-WORKSPACE-091 then binds the indexing and memory stages to "a workspace classified
 * `non-code` (REQ-WORKSPACE-098)". So a workspace of `main.tf` and `deploy.sh` was indexed for 1800 s
 * under a set this domain does not own. Recorded as
 * `docs/defects/fixed/classification-decided-by-the-runtimes-extension-list.md`.
 */
export function workspaceContainsCode(root: string, agentsFile: string): boolean {
  return classifyWorkspaceRoot(root, agentsFile) === 'code';
}

export class McpHost {
  readonly discovery: ToolDiscovery;
  readonly probe: HealthProbe;
  readonly sink = new DiagnosticSink();
  private readonly overrides = new Set<string>();
  private overrideVersion = 0;
  private configurationVersion = 0;
  private readonly sessions = new Map<string, SessionConnections>();
  private readonly surfaces = new Map<string, SurfaceMemo>();
  /**
   * Live-run finding D7 (R-067): what each persona's resolutions have already written, per surface key WITHOUT the
   * reserved names. The spawn evidence resolves with none reserved and the tool port with the persona's native names, so
   * the one spawn resolves twice; a line the first resolution wrote (the surface line, an unkeyed diagnostic such as
   * REQ-MCP-059's grant count) is not written again by the second. A surface the reserved names changed — a collision
   * offered under its prefix — renders a different surface line, which is written. Cleared with the memo it shadows.
   */
  private readonly announced = new Map<string, Set<string>>();
  private readonly preparing = new Map<string, Promise<void>>();
  private readonly mcpLog: McpLog;

  constructor(private readonly deps: McpHostDeps) {
    // `debug` reached the log as `info` here, so a child's stderr burst was indistinguishable from the product's
    // own findings in the launch log. The wire has carried four levels all along (`process-protocol.ts`).
    this.mcpLog = { info: (m) => deps.log(m), warn: (m) => deps.log(m, 'warn'), debug: (m) => deps.log(m, 'debug') };
    this.discovery = new ToolDiscovery({ clocks: deps.clocks, log: this.mcpLog, parentEnv: deps.parentEnv, clientVersion: deps.productVersion });
    this.probe = new HealthProbe({ clocks: deps.clocks, log: this.mcpLog, parentEnv: deps.parentEnv, clientVersion: deps.productVersion });
  }

  // ---- the sink -------------------------------------------------------------------------------------------------

  /** ONE sink: the scope rules, then the log and — for a user-bound warning — REQ-MCP-044's two channels. */
  deliver(d: Diagnostic, ctx: McpSessionContext | null = null): boolean {
    if (!this.sink.admit(d, ctx?.sessionId ?? '')) return false;
    // A `debug` diagnostic is written at `debug` (REQ-MCP-059, PD-MONITOR-002; A41); it had been folded into `warn`.
    this.deps.log(`mcp: ${d.message}`, d.severity === 'debug' ? 'debug' : d.severity === 'info' ? 'info' : 'warn');
    if (d.channels === 'user' && d.severity === 'warning') {
      this.deps.acknowledge({ kind: 'warn', title: d.message });
      ctx?.writer?.recordIssue({ kind: 'mcp_config', severity: 'warning', actor: 'orchestrator', message: d.message, metadata: { ...(d.server === undefined ? {} : { server: d.server }), ...(d.persona === undefined ? {} : { persona: d.persona }) } });
    }
    return true;
  }

  // ---- configuration and discovery -------------------------------------------------------------------------------

  private lastFingerprint = '';

  /**
   * Every configuration load (each run start, REQ-MCP-047): the memo is invalidated when the merged servers changed or
   * when any memoised discovery had failed — so a server that failed before the reload but answers after it is
   * interrogated afresh and warns no more — and the load-scope diagnostics are delivered. A reload of identical content
   * with every discovery healthy keeps the memo: `session.start` resolves the configuration twice within milliseconds.
   */
  newConfiguration(cfg: LoadedConfiguration): void {
    const fingerprint = JSON.stringify(Object.entries(cfg.mcp.servers).map(([n, s]) => [n, s.entry, s.origin, s.description]));
    if (fingerprint !== this.lastFingerprint || this.discovery.anyFailed()) {
      this.lastFingerprint = fingerprint;
      this.configurationVersion += 1;
      this.discovery.invalidate();
      this.surfaces.clear();
      this.announced.clear();
      this.preparing.clear();
    }
    this.sink.newLoad();
    for (const d of cfg.mcp.diagnostics) this.deliver(d);
  }

  /** REQ-MCP-094 / REQ-MCP-115: the session override, held here for the application's life; discarded at exit by not existing anywhere else. */
  setEnabled(name: string, enabled: boolean): void {
    if (enabled) this.overrides.delete(name); else this.overrides.add(name);
    this.overrideVersion += 1;
    this.surfaces.clear();
    this.announced.clear();
    this.deps.log(`mcp: server '${name}' ${enabled ? 'enabled' : 'disabled'} for this session by the settings toggle (REQ-MCP-094; not persistent)`);
  }
  isOverridden(name: string): boolean {
    return this.overrides.has(name);
  }

  private descriptionOf(server: McpResolvedServer): ServerDescription {
    return server.description as ServerDescription;
  }

  /** The servers any configured persona carries that survive the drop rules — what discovery is run for ahead of a run. */
  private carriedAndLaunchable(cfg: LoadedConfiguration): McpResolvedServer[] {
    const names = new Set<string>();
    for (const p of Object.values(cfg.personas)) for (const s of p.mcp_servers) names.add(s);
    const out: McpResolvedServer[] = [];
    for (const name of names) {
      const s = cfg.mcp.servers[name];
      if (!s || !s.entry.enabled || this.overrides.has(name) || !s.availability.available) continue;
      out.push(s);
    }
    return out;
  }

  /**
   * Discovery for every carried, launchable server, in parallel, each bounded by REQ-MCP-053; kicked off at run start
   * and awaited by the first tool port's `ready()`. Memoised per configuration version and override version.
   */
  prepare(cfg: LoadedConfiguration, workspaceRoot: string): Promise<void> {
    const key = `${workspaceRoot}|${this.configurationVersion}|${this.overrideVersion}`;
    const known = this.preparing.get(key);
    if (known) return known;
    const started = this.deps.clocks.monotonic.now();
    const servers = this.carriedAndLaunchable(cfg);
    const p = Promise.all(servers.map(async (s) => {
      const project = projectWords(this.descriptionOf(s));
      const r = await this.discovery.discover({ name: s.name, description: this.descriptionOf(s), workspaceRoot, context: project });
      // A success is this line's; a failure is `ToolDiscovery`'s one REQ-MCP-048 warning, which carries the project, the
      // detail and the time. Until 2026-10-03 this line said the failure again at info 1 ms after the warning, the child's whole standard
      // error in both (`docs/defects/fixed/one-mcp-discovery-failure-is-logged-twice-its-stderr-breaking-each-record.md`).
      if (!r.memoised && !r.failed) this.deps.log(`mcp: discovery of '${s.name}'${project === '' ? '' : ` (${project})`} listed ${r.tools.length} tool(s) in ${r.elapsedMs.toFixed(0)} ms`);
    })).then(() => { this.deps.log(`mcp: discovery for ${servers.length} server(s) finished in ${(this.deps.clocks.monotonic.now() - started).toFixed(0)} ms`); });
    this.preparing.set(key, p);
    return p;
  }

  // ---- the persona surface (one resolution, two readers) --------------------------------------------------------

  private availabilityOf(cfg: LoadedConfiguration, name: string): { available: boolean; detail?: string } {
    const s = cfg.mcp.servers[name];
    if (!s) return { available: false, detail: 'not configured' };
    if (s.availability.available) return { available: true };
    return { available: false, detail: s.availability.detail };
  }

  /** REQ-TOOLS-010 / REQ-MCP-061: the surface for a persona, memoised on the versions of its inputs; the same object feeds the prompt, the callable set and the spawn evidence. */
  surfaceFor(cfg: LoadedConfiguration, workspaceRoot: string, role: string, ctx: McpSessionContext | null, reserved: ReadonlySet<string> = new Set()): PersonaMcpSurface {
    const base = `${workspaceRoot}|${role}|${this.configurationVersion}|${this.overrideVersion}|${this.discovery.version}`;
    const key = `${base}|${[...reserved].sort(compareCodePoints).join(',')}`;
    const memo = this.surfaces.get(key);
    if (memo) return memo.surface;
    const entry = cfg.personas[role];
    const r = resolvePersonaMcp({
      persona: role, carried: entry?.mcp_servers ?? [], grants: entry?.mcp_tools ?? null, genericTools: entry?.tools ?? [],
      servers: Object.fromEntries(Object.entries(cfg.mcp.servers).map(([n, s]) => [n, s.entry])), origins: cfg.mcp.origins,
      sessionDisabled: this.overrides, availability: (n) => this.availabilityOf(cfg, n), reservedNames: reserved,
      discovered: (n) => { const s = cfg.mcp.servers[n]; if (!s) return null; const d = this.discovery.peek({ name: n, description: this.descriptionOf(s), workspaceRoot }); return d ? { tools: d.tools, failed: d.failed } : null; },
    });
    let said = this.announced.get(base);
    if (!said) { said = new Set(); this.announced.set(base, said); }
    for (const d of r.diagnostics) {
      if (d.key === '' && said.has(d.message)) continue;
      if (d.key === '') said.add(d.message);
      this.deliver(d, ctx);
    }
    // REQ-MCP-041's detailed line, once per server per process, beside the per-persona warning.
    for (const dropped of r.value.dropped) {
      if (dropped.reason !== 'unavailable') continue;
      const s = cfg.mcp.servers[dropped.name];
      if (s) this.deliver({ severity: 'info', scope: 'process', key: `mcp.unavailable-detail.${dropped.name}`, channels: 'log', message: `unavailable — raw command '${s.entry.command ?? ''}', resolved '${s.resolved?.command ?? ''}' [${(s.resolved?.args ?? []).join(' ')}] was not found on PATH (REQ-MCP-041)`, server: dropped.name });
    }
    this.surfaces.set(key, { key, surface: r.value, diagnostics: r.diagnostics });
    const line = `mcp: surface for ${role} — callable ${r.value.active.map((a) => `${a.name}[${a.tools.map((t) => t.callable).join(',')}]`).join(' ') || '(none)'}; dropped ${r.value.dropped.map((d) => `${d.name}:${d.reason}`).join(' ') || '(none)'}; section ${JSON.stringify(renderMcpSection(r.value))}`;
    if (!said.has(line)) { said.add(line); this.deps.log(line); }
    return r.value;
  }

  // ---- the session's executors ----------------------------------------------------------------------------------

  connectionsFor(sessionId: string, workspaceRoot: string, ctx: McpSessionContext): SessionConnections {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = new SessionConnections({
        clocks: this.deps.clocks, log: this.mcpLog, workspaceRoot, parentEnv: this.deps.parentEnv, clientVersion: this.deps.productVersion,
        // REQ-MCP-069: once per server per session, through both channels.
        unreachable: (server, detail) => { this.deliver({ severity: 'warning', scope: 'session', key: `mcp.unreachable.${server}`, channels: 'user', message: `MCP server '${server}' became unreachable: ${redact(detail)}; the call failed and later calls will try again (REQ-MCP-069)`, server }, ctx); },
        // REQ-MCP-071 (ADR-0035, Part T): the binding probe's tool from the manifest; a failure warns through REQ-MCP-044 and changes nothing else.
        codeIntelligenceMemoryTool: CODE_INTELLIGENCE_MEMORY_LISTING_TOOL, codeIntelligenceServerName: CODE_INTELLIGENCE_SERVER_NAME,
        // REQ-MCP-034: the connected line names the project the description it LAUNCHED carried, so the log shows the binding in force.
        launchNote: (_server, description) => projectWords(description),
        probeFailed: (server, detail) => { this.deliver({ severity: 'warning', scope: 'session', key: `mcp.binding-probe.${server}`, channels: 'user', message: `MCP server '${server}' did not answer its project-memory listing: ${redact(detail)}. Its symbol-level tools remain usable but may not be pointed at this project (REQ-MCP-071)`, server }, ctx); },
      });
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  /**
   * The executors for one persona's active servers — ADR-0016: a tool OUTSIDE the registry, no facets; the ONE gate
   * decides every dispatch. Each executor is named by its callable name and dispatches the server-reported name to the
   * session's shared connection, demanded on first use (REQ-MCP-066), under the entry's allowance (REQ-MCP-003).
   */
  executorsFor(args: { cfg: LoadedConfiguration; workspaceRoot: string; role: string; surface: PersonaMcpSurface; ctx: McpSessionContext; remove: (callable: string) => void; log: (m: string) => void }): ToolExecutor[] {
    const { cfg, workspaceRoot, surface, ctx } = args;
    const connections = this.connectionsFor(ctx.sessionId, workspaceRoot, ctx);
    const out: ToolExecutor[] = [];
    const subscribed = new Set<string>();
    for (const server of surface.active) {
      const resolved = cfg.mcp.servers[server.name];
      if (!resolved) continue;
      const description = this.descriptionOf(resolved);
      const timeoutMs: Millis = millis((server.entry.request_timeout ?? CALL_TIMEOUT_DEFAULT_MS / 1_000) * 1_000);
      let connectTime = [...server.tools];
      const grant = cfg.personas[args.role]?.mcp_tools?.[server.name];
      // REQ-MCP-060: on the first connection this port makes, watch the list; recompute by the same decision and only narrow.
      const watch = (c: Connected) => {
        if (subscribed.has(server.name)) return;
        subscribed.add(server.name);
        c.onToolsChanged((tools) => {
          const kept = narrowAfterUpdate(server.name, server.entry, tools, grant, connectTime);
          const now = new Set(kept.map((t) => t.callable));
          for (const t of connectTime) if (!now.has(t.callable)) { args.remove(t.callable); args.log(`mcp: '${t.callable}' withdrawn from ${args.role}'s callable set after ${server.name} changed its tool list (REQ-MCP-060); the prompt is not re-rendered`); }
          connectTime = kept;
        });
      };
      for (const tool of server.tools) {
        out.push({
          name: tool.callable,
          description: tool.description === '' ? `Tool ${tool.reported} of MCP server ${server.name}.` : tool.description,
          schema: z.record(z.string(), z.unknown()),
          parameters: { ...tool.inputSchema },
          label: (a) => `${tool.callable} ${Object.keys(a as Record<string, unknown>).sort(compareCodePoints).join(' ')}`.trim(),
          execute: async (a, tctx) => {
            const started = this.deps.clocks.monotonic.now();
            try {
              const c = await connections.connect(server.name, description);
              watch(c);
              const r = await connections.call(server.name, description, tool.reported, a as Record<string, unknown>, timeoutMs, tctx.signal);
              return r.isError ? errorObservation(r.text, { outcomeKind: 'mcp', failureKind: 'tool_error' }) : observation(r.text, { outcomeKind: 'mcp' });
            } catch (cause) {
              const text = String(cause instanceof Error ? cause.message : cause);
              const elapsed = this.deps.clocks.monotonic.now() - started;
              if (/timeout|timed out/i.test(text) && elapsed >= timeoutMs * 0.9) return errorObservation(`MCP server '${server.name}' did not answer '${tool.callable}' within its allowance of ${timeoutMs / 1_000} s; the call failed and was not retried (REQ-MCP-003).`, { outcomeKind: 'mcp', failureKind: 'timeout' });
              return errorObservation(`The call to '${tool.callable}' on MCP server '${server.name}' failed: ${redact(text)}`, { outcomeKind: 'mcp', failureKind: 'execution_error' });
            }
          },
        } as ToolExecutor);
      }
    }
    return out;
  }

  /** REQ-MCP-101 / REQ-TOOLS-010: the section from the same surface. */
  section(surface: PersonaMcpSurface): string {
    return renderMcpSection(surface);
  }

  // ---- the settings category ------------------------------------------------------------------------------------

  /** REQ-MCP-091: every configured server, disabled ones included, with the masked line and the origin. */
  list(cfg: LoadedConfiguration): McpListing {
    const rows: McpServerRow[] = Object.values(cfg.mcp.servers).sort((a, b) => compareCodePoints(a.name, b.name)).map((s) => {
      const line = s.entry.type === 'stdio' ? [s.entry.command ?? '', ...s.entry.args].join(' ').trim() : s.entry.url ?? '';
      return {
        name: s.name, type: s.entry.type, line: redact(line), origin: s.origin, enabled: s.entry.enabled, overridden: this.overrides.has(s.name),
        available: s.availability.available, availabilityDetail: s.availability.available ? '' : s.availability.detail, unresolved: [...s.unresolved],
        expectedKeys: Object.keys(s.entry.env).sort(compareCodePoints),
      };
    });
    return { configFile: join(cfg.workspaceRoot, WORKSPACE_SCOPE_DIR, AGENTS_FILE_NAME), rows };
  }

  /** REQ-MCP-092: one probe; an unavailable server short-circuits to unreachable with the PATH text, without connecting. */
  async probeOne(cfg: LoadedConfiguration, name: string): Promise<McpHealth> {
    const s = cfg.mcp.servers[name];
    if (!s) return { state: 'unreachable', detail: `'${name}' is not a configured server` };
    if (!s.availability.available) return { state: 'unreachable', detail: s.availability.detail, elapsedMs: 0 };
    const r = await this.probe.probe(name, this.descriptionOf(s));
    return r.state === 'healthy' ? { state: 'healthy', toolCount: r.toolCount, elapsedMs: r.elapsedMs } : { state: 'unreachable', detail: redact(r.detail), elapsedMs: r.elapsedMs };
  }

  /** REQ-MCP-109: the read side — every value the one mask (REQ-MCP-081, REQ-TOOLS-171's marker), scope named, code-point order. */
  secrets(cfg: LoadedConfiguration, server: string | null): McpSecretsView {
    const servers = Object.keys(cfg.mcp.servers).sort(compareCodePoints);
    const rows: McpSecretRow[] = cfg.mcp.secrets
      .filter((e) => server === null || e.server === server)
      .map((e) => ({ server: e.server, key: e.key, masked: REDACTION_MARK, scope: e.scope === 'workspace' ? 'Workspace' as const : 'Global' as const }))
      .sort((a, b) => compareCodePoints(a.server, b.server) || compareCodePoints(a.key, b.key));
    const expected = server === null ? [] : Object.keys(cfg.mcp.servers[server]?.entry.env ?? {}).sort(compareCodePoints).map((key) => ({ key, satisfied: cfg.mcp.secrets.some((e) => e.server === server && e.key === key) }));
    return { servers, rows, expected, server };
  }

  // ---- REQ-MCP-099 / REQ-MCP-112: the code-intelligence project setup (ADR-0035, Part T) ---------------------------

  private setup: { status: McpSetupStatus; abort: AbortController | null } = { status: idleSetup(), abort: null };
  /**
   * The setup under way, from its start until its finished status is set, with the signal its host's shutdown fires
   * (`endSetup`). Null while no setup runs.
   */
  private setupRun: { readonly ended: Promise<void>; readonly shutdown: AbortController } | null = null;

  /** Part AS: the ONE place `setup` is assigned, so every change reaches the push of ADR-0064 and none can be forgotten. */
  private setSetup(next: { status: McpSetupStatus; abort: AbortController | null }): void {
    this.setup = next;
    this.deps.publishSetup?.(next.status);
  }

  /**
   * REQ-WORKSPACE-090 (Part AS): the applicability of `code-intelligence-setup`, judged by the one
   * availability rule REQ-MCP-037 fixes — a `code_intelligence` entry exists and is launchable here.
   * `availability` already carries that verdict for every surface (`remote`, `builtin`, `on-path`
   * against `empty-command`, `not-on-path`), so no second rule is stated.
   */
  setupApplicable(cfg: LoadedConfiguration): boolean {
    return cfg.mcp.servers[CODE_INTELLIGENCE_SERVER_NAME]?.availability.available === true;
  }

  setupStatus(cfg: LoadedConfiguration | null = null): McpSetupStatus {
    return { ...this.setup.status, applicable: cfg === null ? this.setup.status.applicable : this.setupApplicable(cfg) };
  }

  /** REQ-MCP-112: cancellable at any point; the step in flight is terminated (REQ-MCP-099's ask, grace, tree kill) and the rest are not attempted. */
  cancelSetup(): McpSetupStatus {
    if (this.setup.abort && this.setup.status.state === 'running') { this.setup.abort.abort(); this.deps.log('mcp setup: cancellation requested'); }
    return this.setup.status;
  }

  /**
   * REQ-WORKSPACE-092/109: the run host's shutdown ends the setup under way, and returns once its step — and everything
   * the step started — has gone. Before, `shutdown` never reached the setup: the host exited with the step still running,
   * and at an orderly quit the step and what it had launched outlived the application (measured 2026-10-01 on the built
   * app: both still running 5 s after it exited;
   * `docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).
   * The step is asked to terminate and force-killed after `SETUP_SHUTDOWN_GRACE_MS`, a cancellation already under way
   * included — REQ-MCP-099's 5 s grace is not given at a close, the build's reading of OQ-172. `dispatch`'s `shutdown`
   * calls this and awaits it before the stores close (pinned in `dispatch.test.ts` and `workspace-proof` 8f).
   */
  async endSetup(): Promise<void> {
    const run = this.setupRun;
    if (run === null) return;
    this.deps.log('mcp setup: ended by the run host\'s shutdown');
    run.shutdown.abort();
    await run.ended;
  }

  /**
   * REQ-MCP-112: one run at a time, re-runnable on demand, never blocking the interface (the steps run on this process's
   * event loop while the request returns at once; the category polls the status). REQ-MCP-099: the invocation derived from
   * the configured `code_intelligence` entry (REQ-MCP-036) — a remote or launch-less entry is the non-retryable
   * "not a local launch" failure and no substitute command is tried; the contains-code walk once per run.
   */
  startSetup(cfg: LoadedConfiguration, workspaceRoot: string): { ok: true; status: McpSetupStatus } | { ok: false; reason: string } {
    if (this.setup.status.state === 'running') return { ok: false, reason: 'A code-intelligence setup is already running for this workspace; wait for it to finish or cancel it first.' };
    const server = cfg.mcp.servers[CODE_INTELLIGENCE_SERVER_NAME];
    const steps = (): McpSetupStep[] => CODE_INTELLIGENCE_SETUP_STEPS.map((s) => ({ id: s.id, label: s.label, status: 'pending', detail: '', elapsedMs: null }));
    const startedAt = toIsoUtc(this.deps.clocks.wall.instant());
    const applicable = this.setupApplicable(cfg);
    if (!server) {
      this.setSetup({ status: { provisioning: provisioning(), state: 'finished', steps: steps().map((s) => ({ ...s, status: 'not-attempted', detail: 'not attempted: no code_intelligence server is configured' })), outcome: 'unavailable', message: `No server named '${CODE_INTELLIGENCE_SERVER_NAME}' is configured, so there is no code-intelligence runtime to set this workspace up for.`, containsCode: null, invocation: '', startedAt, applicable }, abort: null });
      return { ok: true, status: this.setup.status };
    }
    const invocation = deriveSetupInvocation(server.entry, server.resolved);
    if (!invocation.ok) {
      this.deps.log(`mcp setup: refused — ${invocation.reason}`, 'warn');
      this.setSetup({ status: { provisioning: provisioning(), state: 'finished', steps: steps().map((s) => ({ ...s, status: 'not-attempted', detail: 'not attempted: no setup command could be derived' })), outcome: 'unavailable', message: `Setup is not available: ${invocation.reason}. This is not retried.`, containsCode: null, invocation: '', startedAt, applicable }, abort: null });
      return { ok: true, status: this.setup.status };
    }
    const containsCode = workspaceContainsCode(workspaceRoot, cfg.files.workspace.agents);
    const markerPresent = existsSync(join(workspaceRoot, ...CODE_INTELLIGENCE_MARKER_SEGMENTS));
    const abort = new AbortController();
    const line = `${invocation.command} ${invocation.args.join(' ')}`.trim();
    this.setSetup({ status: { provisioning: provisioning(), state: 'running', steps: steps(), outcome: null, message: '', containsCode, invocation: line, startedAt, applicable }, abort });
    this.deps.log(`mcp setup: started for ${workspaceRoot} — invocation '${line}', contains code ${containsCode}, marker ${markerPresent ? 'present' : 'absent'}`);
    const description = server.description as ServerDescription;
    const env = { ...this.deps.parentEnv, ...(description.transport === 'stdio' ? description.env : {}) };
    const shutdown = new AbortController();
    const ended = runSetupSteps({
      invocation, workspaceRoot, steps: CODE_INTELLIGENCE_SETUP_STEPS, creationStepId: 'create', markerPresent, containsCode, env,
      clocks: this.deps.clocks, log: this.mcpLog, signal: abort.signal,
      shutdown: { signal: shutdown.signal, graceMs: SETUP_SHUTDOWN_GRACE_MS },
      onStep: (step, all) => {
        this.setSetup({ ...this.setup, status: { ...this.setup.status, steps: all.map((s) => ({ id: s.id as McpSetupStep['id'], label: s.label, status: s.status, detail: s.detail, elapsedMs: s.elapsedMs, ...(s.stopped === undefined ? {} : { stopped: s.stopped }), ...(s.skipped === undefined ? {} : { skipped: s.skipped }), ...(s.output === undefined ? {} : { output: s.output }), ...(s.startError === undefined ? {} : { startError: s.startError }) })) } });
        this.deps.log(`mcp setup: ${step.id} ${step.status}${step.detail ? ` — ${step.detail.slice(0, 200)}` : ''}${step.elapsedMs === null ? '' : ` (${step.elapsedMs.toFixed(0)} ms)`}`);
      },
    }).then((report) => {
      const message = report.outcome === 'completed'
        ? (containsCode ? 'Every step succeeded: the workspace is set up for code intelligence.' : 'The project was created; indexing and the memory store were skipped because the workspace contains no code.')
        : report.outcome === 'cancelled' ? 'The setup was cancelled; the workspace is only partly set up.' : 'A step failed, so the workspace is only partly set up.';
      this.setSetup({ status: { ...this.setup.status, state: 'finished', outcome: report.outcome, message }, abort: null });
      this.deps.log(`mcp setup: ${report.outcome} — ${message}`);
    }, (cause: unknown) => {
      this.setSetup({ status: { ...this.setup.status, state: 'finished', outcome: 'failed', message: `The setup stopped unexpectedly: ${String(cause instanceof Error ? cause.message : cause)}` }, abort: null });
    });
    const run = { ended, shutdown };
    this.setupRun = run;
    void ended.then(() => { if (this.setupRun === run) this.setupRun = null; });
    return { ok: true, status: this.setup.status };
  }

  // ---- lifetime -------------------------------------------------------------------------------------------------

  pidsFor(sessionId: string): Record<string, number | null> {
    const s = this.sessions.get(sessionId);
    if (!s) return {};
    return Object.fromEntries([...s.connected().entries()].map(([name, c]) => [name, c.pid()]));
  }

  async closeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    this.sink.endSession(sessionId);
    await s.closeAll();
  }

  /** REQ-MCP-053/066: at exit nothing outstanding is waited for beyond its bound and every connection is closed. */
  async closeAll(): Promise<void> {
    const all = [...this.sessions.keys()];
    await Promise.all([...all.map((id) => this.closeSession(id)), this.discovery.closeAll()]);
  }
}

/**
 * REQ-MCP-065 / REQ-MCP-114: the MCP evidence of an agent's grant — every server its persona carries with its fate, and under
 * each carried server the tools the agent can call there: `granted(server, callable)` answers which survived what the surface
 * does not know of (the plan gate, a collision with a native name). Read from the surface its tool port resolved, after the
 * controls, so the record lists what the agent could call. Until 2026-10-01 this was `McpHost.evidenceFor`, resolved for the
 * spawn with no names reserved and before any control
 * (`docs/defects/fixed/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`).
 *
 * A server whose tool discovery failed stays among the surface's `active` servers, because the persona prompt still lists
 * it bare (REQ-MCP-048, REQ-MCP-101), but its fate here is `dropped` for `discovery-failed` with nothing granted under it:
 * REQ-MCP-114 names tool discovery having failed (REQ-MCP-042) among the drop reasons. Until 2026-10-03 every active server
 * was recorded `connected`, and a dead code-intelligence server read "connected / No tools granted" in the inspector
 * (`docs/defects/fixed/an-mcp-server-whose-tool-discovery-failed-reads-as-connected.md`).
 */
export function grantEvidence(surface: PersonaMcpSurface, granted: (server: string, callable: string) => boolean = () => true): McpGrantEvidence {
  const carried = surface.active.filter((a) => !a.discoveryFailed);
  return {
    granted: Object.fromEntries(carried.map((a) => [a.name, a.tools.map((t) => t.callable).filter((c) => granted(a.name, c))])),
    servers: [
      ...surface.active.map((a) => a.discoveryFailed
        ? { name: a.name, transport: a.entry.type, origin: a.origin, fate: 'dropped' as const, reason: 'discovery-failed' satisfies DropReason }
        : { name: a.name, transport: a.entry.type, origin: a.origin, fate: 'connected' as const }),
      ...surface.dropped.map((d) => ({ name: d.name, transport: d.transport, origin: d.origin ?? '', fate: 'dropped' as const, reason: d.reason })),
    ],
  };
}
