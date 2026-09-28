import { clipValue, isSecretLookingName, redact } from '@rotaris/kernel';
import { type Decision, type DecisionSource, type PermissionPreset, presetRank, resolvePreset } from '@rotaris/contracts';
import { isRemoteUrl } from './egress.js';
import { canonicalToolName, META_TOOL_NAMES, NETWORK_CLASS, READ_ONLY_CLASS } from './registry.js';
import { decompose, escalationMatcherFires, patternMatcherFires, pipeToShellMatcherFires, type Segment, tokenizePattern } from './scanner.js';
import { resolveInWorkspace } from './tools/fence.js';

/**
 * ADR-0017: the policy is an immutable ordered value whose matchers are compiled once at build.
 * Building is a pure function of (preset, egress, workspace root) and is the ONLY step that can fail
 * (REQ-TOOLS-034's pattern error, REQ-TOOLS-019's four validity checks). Evaluating is a pure function
 * `(policy, approvals, request, env) → Decision` under the one `try` of REQ-TOOLS-020; session
 * approvals are scanned most-recent-first BEFORE the policy (REQ-TOOLS-023), which is what lets them
 * survive replacement. Replacement is an atomic pointer swap on `PolicyContext` (REQ-TOOLS-025).
 */

// ---- requests and renderings ---------------------------------------------------------------

export interface PermissionRequest {
  readonly toolName: string;
  readonly persona: string;
  readonly args: Readonly<Record<string, unknown>>;
  /** REQ-TOOLS-015: at most one, selected by argument name alone, pre-redaction. */
  readonly commandFacet: string | null;
}

/** REQ-TOOLS-015: `command` if a string, else `url` if a string, else none. */
export function permissionRequest(toolName: string, persona: string, args: Readonly<Record<string, unknown>> | null): PermissionRequest {
  const a = args ?? {};
  const facet = typeof a['command'] === 'string' ? (a['command'] as string) : typeof a['url'] === 'string' ? (a['url'] as string) : null;
  return { toolName, persona, args: a, commandFacet: facet };
}

/** REQ-TOOLS-016: `<tool>: <redacted facet>` or `<tool>(<sorted keys>)`; no argument value beyond the facet. */
export function requestSummary(req: PermissionRequest): string {
  if (req.commandFacet !== null) return `${req.toolName}: ${redact(req.commandFacet)}`;
  return `${req.toolName}(${Object.keys(req.args).sort().join(', ')})`;
}

/** REQ-TOOLS-057: sorted `key=value` lines, secret keys masked outright, values redacted and clipped; empty with a facet. */
export function argumentSummary(req: PermissionRequest): string {
  if (req.commandFacet !== null) return '';
  return Object.keys(req.args).sort().map((k) => {
    const v = req.args[k];
    const rendered = typeof v === 'string' ? v : JSON.stringify(v) ?? '';
    return `${k}=${isSecretLookingName(k) ? '***' : clipValue(redact(rendered))}`;
  }).join('\n');
}

/** REQ-TOOLS-017: compact JSON, keys sorted by code point, numbers in shortest round-trip form; strings as themselves. */
export function canonicalArgument(value: unknown): string {
  if (typeof value === 'string') return value;
  const enc = (v: unknown): string => {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(enc).join(',')}]`;
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${enc(o[k])}`).join(',')}}`;
    }
    return JSON.stringify(String(v));
  };
  return enc(value);
}

export function canonicalArguments(args: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(args).sort()) out[k] = canonicalArgument(args[k]);
  return out;
}

// ---- rules -----------------------------------------------------------------------------------

export type PathScope = 'inside_workspace' | 'outside_workspace';

export type CommandMatcher =
  | { readonly kind: 'pattern'; readonly compiled: readonly (readonly string[])[] }
  | { readonly kind: 'escalation' }
  | { readonly kind: 'pipe-to-shell' }
  /** The fetch pair: fires on a URL facet whose host is outside / inside the local machine. */
  | { readonly kind: 'remote-host' }
  | { readonly kind: 'local-host' };

export interface Rule {
  readonly id: string;
  readonly description: string;
  readonly outcome: Decision;
  readonly tools?: ReadonlySet<string>;
  readonly personas?: ReadonlySet<string>;
  readonly pathScope?: PathScope;
  readonly command?: CommandMatcher;
  readonly args?: Readonly<Record<string, string>>;
}

export interface Policy {
  readonly presetName: string;
  readonly defaultDecision: Decision;
  readonly rules: readonly Rule[];
}

/** REQ-TOOLS-039: the nine starter rules, fixed ids, five denies then four asks. */
const STARTER_PATTERNS = {
  'starter:deny-recursive-delete': ['rm -rf *', 'rm -fr *', 'rm -Rf *', 'rm -r -f *', 'rm -f -r *', 'rmdir /s *', 'rmdir /S *', 'rd /s *', 'rd /S *', 'del /f *', 'del /F *'],
  'starter:deny-privilege-escalation': ['sudo *', 'doas *', 'su *', 'runas *'],
  'starter:deny-force-push': ['git push --force *', 'git push -f *', 'git push --delete *'],
  'starter:deny-package-publish': ['npm publish *', 'yarn publish *', 'pnpm publish *', 'uv publish *', 'twine upload *', 'cargo publish *', 'gh release create *'],
  'starter:ask-history-rewrite': ['git reset --hard *', 'git clean -fd *', 'git clean -df *', 'git checkout -- *', 'git rebase *', 'git filter-branch *'],
  'starter:ask-dependency-install': ['pip install *', 'uv pip install *', 'uv add *', 'npm install *', 'npm i *', 'yarn add *', 'pnpm add *', 'cargo install *', 'brew install *', 'apt-get install *'],
  'starter:ask-container-control': ['docker *', 'podman *', 'kubectl *', 'systemctl *', 'Remove-Item *'],
} as const;

/** REQ-TOOLS-094: the closed network-command catalogue — a set, no precedence. */
export const NETWORK_COMMAND_PATTERNS: readonly string[] = [
  'curl *', 'wget *', 'http *', 'https *', 'ssh *', 'scp *', 'sftp *', 'rsync *', 'nc *', 'ncat *', 'telnet *', 'ftp *',
  'git push *', 'git pull *', 'git fetch *', 'git clone *', 'git remote *', 'git ls-remote *', 'git submodule update *', 'gh *',
  'pip install *', 'pip download *', 'pip index *', 'pip3 install *', 'pip3 download *', 'uv add *', 'uv sync *', 'uv lock *', 'uv pip install *', 'uv tool install *', 'uv publish *', 'poetry add *', 'poetry install *',
  'npm install *', 'npm i *', 'npm ci *', 'npm update *', 'npm audit *', 'npm publish *', 'npx *', 'yarn add *', 'yarn install *', 'yarn up *', 'yarn publish *', 'pnpm add *', 'pnpm install *', 'pnpm update *', 'pnpm publish *', 'pnpm dlx *',
  'cargo add *', 'cargo fetch *', 'cargo install *', 'cargo update *', 'cargo publish *', 'go get *', 'go install *', 'go mod download *', 'go mod tidy *',
  'brew install *', 'brew update *', 'brew upgrade *', 'brew fetch *', 'apt install *', 'apt update *', 'apt upgrade *', 'apt-get install *', 'apt-get update *', 'apt-get upgrade *', 'docker pull *', 'docker push *',
];

const compile = (patterns: readonly string[]): CommandMatcher => ({ kind: 'pattern', compiled: patterns.map(tokenizePattern) });

function starterRules(): Rule[] {
  const p = STARTER_PATTERNS;
  return [
    { id: 'starter:deny-recursive-delete', description: 'recursive delete', outcome: 'deny', command: compile(p['starter:deny-recursive-delete']) },
    { id: 'starter:deny-privilege-escalation', description: 'privilege escalation', outcome: 'deny', command: compile(p['starter:deny-privilege-escalation']) },
    { id: 'starter:deny-force-push', description: 'force push', outcome: 'deny', command: compile(p['starter:deny-force-push']) },
    { id: 'starter:deny-package-publish', description: 'package publish', outcome: 'deny', command: compile(p['starter:deny-package-publish']) },
    { id: 'starter:deny-pipe-to-shell', description: 'pipe to shell', outcome: 'deny', command: { kind: 'pipe-to-shell' } },
    { id: 'starter:ask-unreadable-command', description: 'a command whose effect cannot be read from the command line alone', outcome: 'ask', command: { kind: 'escalation' } },
    { id: 'starter:ask-history-rewrite', description: 'history rewrite', outcome: 'ask', command: compile(p['starter:ask-history-rewrite']) },
    { id: 'starter:ask-dependency-install', description: 'dependency install', outcome: 'ask', command: compile(p['starter:ask-dependency-install']) },
    { id: 'starter:ask-container-control', description: 'container control', outcome: 'ask', command: compile(p['starter:ask-container-control']) },
  ];
}

const lower = (names: Iterable<string>): ReadonlySet<string> => new Set([...names].map((n) => n.toLowerCase()));

/** REQ-TOOLS-041: the four families in their fixed order; REQ-TOOLS-042/043/044/045 per preset. */
export function buildPolicy(input: { readonly preset: string | undefined | null; readonly workspaceRoot: string }): Policy {
  const { preset } = resolvePreset(input.preset);
  const rules: Rule[] = [];
  const supervised = preset !== 'autonomous';
  if (supervised) {
    rules.push(
      { id: `${preset}:fetch-remote-host`, description: 'network egress to an outside host', outcome: 'ask', tools: lower(NETWORK_CLASS), command: { kind: 'remote-host' } },
      { id: `${preset}:fetch-local-host`, description: 'network access confined to this machine', outcome: 'allow', tools: lower(NETWORK_CLASS), command: { kind: 'local-host' } },
    );
  }
  const starters = starterRules();
  rules.push(...(supervised ? starters : starters.filter((r) => r.outcome === 'deny')));
  if (preset === 'restricted') {
    rules.push({ id: 'restricted:network-command', description: 'a command that reaches the network', outcome: 'deny', command: compile(NETWORK_COMMAND_PATTERNS) });
    rules.push({ id: 'restricted:read-outside-workspace', description: 'a read-only tool reaching outside the workspace', outcome: 'ask', tools: lower(READ_ONLY_CLASS), pathScope: 'outside_workspace' });
    rules.push({ id: 'restricted:read-only-tool', description: 'a read-only tool', outcome: 'allow', tools: lower(READ_ONLY_CLASS) });
  } else if (preset === 'ask') {
    rules.push({ id: 'ask:network-command', description: 'a command that reaches the network', outcome: 'ask', command: compile(NETWORK_COMMAND_PATTERNS) });
    rules.push({ id: 'ask:read-only-tool', description: 'a read-only tool', outcome: 'allow', tools: lower(READ_ONLY_CLASS) });
  }
  const defaultDecision: Decision = preset === 'restricted' ? 'deny' : preset === 'ask' ? 'ask' : 'allow';
  const policy: Policy = Object.freeze({ presetName: preset, defaultDecision, rules: Object.freeze(rules) });
  validatePolicy(policy);
  return policy;
}

/** REQ-TOOLS-019: the four validity conditions; an invalid policy never decides a call. */
export function validatePolicy(policy: Policy): void {
  if (policy.presetName.trim() === '') throw new Error('Policy is invalid: the preset name is empty');
  const seen = new Set<string>();
  for (const r of policy.rules) {
    if (r.id.trim() === '') throw new Error('Policy is invalid: a rule id is empty');
    if (seen.has(r.id)) throw new Error(`Policy is invalid: two rules carry the id '${r.id}'`);
    seen.add(r.id);
    if (!['allow', 'ask', 'deny'].includes(r.outcome)) throw new Error(`Policy is invalid: rule '${r.id}' has outcome '${String(r.outcome)}'`);
  }
  if (!['allow', 'ask', 'deny'].includes(policy.defaultDecision)) throw new Error(`Policy is invalid: default decision '${String(policy.defaultDecision)}'`);
}

/** REQ-TOOLS-029: the rule-less default for a call belonging to no run; every decision under it is warned. */
export const UNRESTRICTED_POLICY: Policy = Object.freeze({ presetName: 'unrestricted', defaultDecision: 'allow' as const, rules: [] });

// ---- session approvals -----------------------------------------------------------------------

export interface SessionApproval {
  /** `session:allow:<n>`, numbered from 1 in grant order. */
  readonly id: string;
  readonly toolName: string;
  readonly persona: string;
  /** Byte-identical, pre-redaction; null when the approved call had none. */
  readonly commandFacet: string | null;
  /** REQ-TOOLS-024: the exact argument set when the approved call had no facet. */
  readonly args: Readonly<Record<string, string>> | null;
  /**
   * PD-TOOLS-004: for an approved call of the public `write_file` / `haet_edit` (as `EvaluationEnv.publicTool` answers)
   * carrying REQ-TOOLS-018's path keys, the set of paths they resolved to when the grant was made (sorted, distinct), or
   * `unresolvable` when one of them did not resolve. Null for every other approval — a server's own `write_file`
   * included — which REQ-TOOLS-024 alone matches.
   */
  readonly paths: readonly string[] | 'unresolvable' | null;
  /** REQ-TOOLS-024: `Approved for this session: <request summary>`. */
  readonly description: string;
}

/** What resolving a request's path arguments needs: REQ-TOOLS-018's root and the injected real-path resolver. */
export type PathResolution = Pick<EvaluationEnv, 'workspaceRoot' | 'resolvePath'>;

/** What making a session approval needs: the path resolution, and which names the surface serves with the public tool. */
export type GrantEnv = Pick<EvaluationEnv, 'workspaceRoot' | 'resolvePath' | 'publicTool'>;

/**
 * PD-TOOLS-004: the two tools whose session approval covers a path, compared case-insensitively, `haet` folded into
 * `haet_edit` — and only as the PUBLIC tools of those names. An MCP or plugin tool offered under the same callable
 * name (a server's own `write_file`, on a persona whose public set lacks one) keeps REQ-TOOLS-024's exact match, as
 * the directive says every MCP and plugin tool does; `env.publicTool` is what tells the two apart.
 */
const PATH_SCOPED_APPROVAL_TOOLS: ReadonlySet<string> = new Set(['write_file', 'haet_edit']);

function approvalToolOf(toolName: string): string {
  return canonicalToolName(toolName.toLowerCase());
}

/**
 * PD-TOOLS-004: the set of paths a request's REQ-TOOLS-018 path arguments resolve to — relative paths against the
 * workspace root, then through the resolver — or `none` when the request carries none of those keys. Fail-closed as
 * REQ-TOOLS-018 is: a value that is neither a string nor a list of strings, or a path the resolver cannot resolve
 * (null, or a throw), makes the whole request `unresolvable`.
 *
 * Deliberately stricter than `pathArguments`, which the path scope reads and which skips a value that is not a string:
 * a value the policy cannot read may still name a file the tool writes, so an approval refuses to guess which paths it
 * covers rather than leave one out (reading 3 of PD-TOOLS-004's first execution).
 */
export function resolvedPathSet(args: Readonly<Record<string, unknown>>, env: PathResolution): readonly string[] | 'none' | 'unresolvable' {
  const raw: string[] = [];
  let carried = false;
  for (const k of PATH_KEYS) {
    if (!Object.hasOwn(args, k)) continue;
    carried = true;
    const v = args[k];
    if (typeof v === 'string') raw.push(v);
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) raw.push(...(v as string[]));
    else return 'unresolvable';
  }
  if (!carried) return 'none';
  const out = new Set<string>();
  for (const p of raw) {
    let real: string | null;
    try {
      real = env.resolvePath(resolveInWorkspace(env, p));
    } catch {
      real = null;
    }
    if (real === null) return 'unresolvable';
    out.add(real);
  }
  return [...out].sort();
}

/** PD-TOOLS-004: whether this call is the public `write_file` / `haet_edit` (alias folded), whose approval covers a path. */
function pathScopedCall(req: PermissionRequest, env: Pick<EvaluationEnv, 'publicTool'>): boolean {
  return PATH_SCOPED_APPROVAL_TOOLS.has(approvalToolOf(req.toolName)) && env.publicTool(req.toolName);
}

export function sessionApprovalFor(n: number, req: PermissionRequest, env: GrantEnv): SessionApproval {
  const scoped = pathScopedCall(req, env) ? resolvedPathSet(req.args, env) : 'none';
  return {
    id: `session:allow:${n}`,
    toolName: req.toolName.toLowerCase(),
    persona: req.persona,
    commandFacet: req.commandFacet,
    args: req.commandFacet === null ? canonicalArguments(req.args) : null,
    paths: scoped === 'none' ? null : scoped,
    description: `Approved for this session: ${requestSummary(req)}`,
  };
}

/**
 * PD-TOOLS-004 over REQ-TOOLS-024. A path-scoped approval matches a later call of the same tool (alias folded) from
 * the same persona whose path arguments resolve to exactly its set, whatever the rest of the arguments — the
 * `write_file` operation included. A later call with an unresolvable path never matches; one carrying no path key,
 * or one that is not the public tool (`laterPaths` answers `none` for it), falls back to REQ-TOOLS-024's exact
 * match. Every other approval is REQ-TOOLS-024's, unchanged.
 */
function approvalMatches(a: SessionApproval, req: PermissionRequest, laterPaths: () => readonly string[] | 'none' | 'unresolvable'): boolean {
  if (a.paths !== null && approvalToolOf(a.toolName) === approvalToolOf(req.toolName) && a.persona === req.persona) {
    const later = laterPaths();
    if (later !== 'none') return a.paths !== 'unresolvable' && later !== 'unresolvable' && sameStrings(a.paths, later);
  }
  return exactApprovalMatches(a, req);
}

/** REQ-TOOLS-024: same tool (case-insensitive), same persona, and the identical facet or the exact argument set. */
function exactApprovalMatches(a: SessionApproval, req: PermissionRequest): boolean {
  if (a.toolName !== req.toolName.toLowerCase() || a.persona !== req.persona) return false;
  if (a.commandFacet !== null) return req.commandFacet === a.commandFacet;
  if (req.commandFacet !== null) return false;
  return sameArguments(a.args ?? {}, canonicalArguments(req.args));
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sameArguments(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => a[k] === b[k]);
}

// ---- evaluation ------------------------------------------------------------------------------

export interface DecisionRecord {
  readonly decision: Decision;
  readonly ruleId: string;
  readonly source: DecisionSource;
  readonly reason: string;
  /** The matched rule's description, for the approval payload and the audit. */
  readonly description: string;
}

export interface EvaluationEnv {
  /** ADR-0017 c.3: derived from the same presenter fact ADR-0019 uses, read at decision time. */
  readonly attended: boolean;
  readonly workspaceRoot: string;
  /** Resolves a path to its real path (following links); null = unresolvable → outside (REQ-TOOLS-018). */
  readonly resolvePath: (p: string) => string | null;
  /**
   * PD-TOOLS-004: whether the surface serves this callable name with the public tool of that name (REQ-TOOLS-001),
   * rather than with an MCP or plugin tool offered under it. Only the public `write_file` and `haet_edit` have their
   * session approvals scoped by path; the name alone cannot say which one a call reached.
   */
  readonly publicTool: (toolName: string) => boolean;
}

const PATH_KEYS = ['path', 'file_path', 'filename', 'paths', 'base_path', 'dir', 'directory'] as const;

function pathArguments(args: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const k of PATH_KEYS) {
    const v = args[k];
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') out.push(x);
  }
  return out;
}

function isInside(root: string, real: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const r = norm(root);
  const p = norm(real);
  return p === r || p.startsWith(`${r}/`);
}

function pathScopeMatches(scope: PathScope, req: PermissionRequest, env: EvaluationEnv): boolean {
  const paths = pathArguments(req.args);
  if (paths.length === 0) return false;
  const root = env.resolvePath(env.workspaceRoot) ?? env.workspaceRoot;
  for (const p of paths) {
    let real: string | null;
    try {
      /*
       * REQ-TOOLS-018: "Relative paths resolve against the workspace root." The path is joined to the root first —
       * the join the fence and `resolvedPathSet` make — and then handed to the resolver for its real path. Until
       * 2026-09-28 the raw argument went to the resolver, and the run host's is `realPathOf`, relative to the PROCESS
       * directory: a workspace-relative read under `restricted` landed "outside" unless main happened to start inside
       * the workspace (`docs/defects/fixed/path-scope-resolves-a-relative-path-against-the-process-directory.md`).
       * The unit tests did not see it because they injected a resolver that joined the root itself.
       */
      real = env.resolvePath(resolveInWorkspace(env, p));
    } catch {
      real = null;
    }
    const inside = real !== null && isInside(root, real);
    if (scope === 'outside_workspace' && !inside) return true;
    if (scope === 'inside_workspace' && !inside) return false;
  }
  return scope === 'inside_workspace';
}

function commandMatches(m: CommandMatcher, facet: string | null, segments: () => readonly Segment[]): boolean {
  if (facet === null) return false;
  switch (m.kind) {
    case 'pattern': return patternMatcherFires(m.compiled, segments());
    case 'escalation': return escalationMatcherFires(segments());
    case 'pipe-to-shell': return pipeToShellMatcherFires(segments());
    case 'remote-host': return isRemoteUrl(facet);
    case 'local-host': return !isRemoteUrl(facet);
    default: return false;
  }
}

/**
 * A rule's `tools` set names PUBLIC tools — REQ-TOOLS-007's read-only and network classes, over which REQ-TOOLS-043's
 * `ask:read-only-tool`, `restricted`'s two read rules and REQ-TOOLS-045's fetch pair are written. A call the surface
 * serves with an MCP or plugin tool is in neither class whatever the tool is called (REQ-TOOLS-001 as ADR-0016 reads
 * it: a tool outside the registry carries no declaration and nothing is inferred from its name), so such a rule does
 * not fire for it and the preset's default decides. A server's own `read_file`, offered under that plain name to a
 * persona whose public set lacks one, was allowed by `ask:read-only-tool` wherever its arguments pointed until
 * 2026-09-28 (`docs/defects/fixed/an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md`).
 */
function toolSetHolds(tools: ReadonlySet<string>, req: PermissionRequest, env: Pick<EvaluationEnv, 'publicTool'>): boolean {
  if (!tools.has(req.toolName.toLowerCase()) && !tools.has(canonicalToolName(req.toolName).toLowerCase())) return false;
  return env.publicTool(req.toolName);
}

function ruleFires(rule: Rule, req: PermissionRequest, env: EvaluationEnv, segments: () => readonly Segment[]): boolean {
  if (rule.tools && !toolSetHolds(rule.tools, req, env)) return false;
  if (rule.personas && !rule.personas.has(req.persona)) return false;
  if (rule.pathScope && !pathScopeMatches(rule.pathScope, req, env)) return false;
  if (rule.command && !commandMatches(rule.command, req.commandFacet, segments)) return false;
  if (rule.args && !sameArguments(rule.args, canonicalArguments(req.args))) return false;
  return true;
}

/** REQ-TOOLS-020: never raises; any exception yields the fail-closed record. */
export function evaluate(policy: Policy, approvals: readonly SessionApproval[], req: PermissionRequest, env: EvaluationEnv): DecisionRecord {
  try {
    if (META_TOOL_NAMES.has(req.toolName.toLowerCase())) {
      return { decision: 'allow', ruleId: 'builtin:meta-tool', source: 'builtin', reason: `'${req.toolName}' is a loop-control tool and is never gated.`, description: 'loop-control tool' };
    }
    validatePolicy(policy);
    let laterPaths: readonly string[] | 'none' | 'unresolvable' | undefined;
    const pathsOfReq = () => { laterPaths ??= pathScopedCall(req, env) ? resolvedPathSet(req.args, env) : 'none'; return laterPaths; };
    for (let i = approvals.length - 1; i >= 0; i -= 1) {
      const a = approvals[i] as SessionApproval;
      if (approvalMatches(a, req, pathsOfReq)) {
        return { decision: 'allow', ruleId: a.id, source: 'session-rule', reason: `Rule '${a.id}' (${a.description}) resolved '${req.toolName}' to allow.`, description: a.description };
      }
    }
    let cached: readonly Segment[] | null = null;
    const segments = () => { cached ??= decompose(req.commandFacet ?? ''); return cached; };
    for (const rule of policy.rules) {
      if (ruleFires(rule, req, env, segments)) {
        return { decision: rule.outcome, ruleId: rule.id, source: 'rule', reason: `Rule '${rule.id}' (${rule.description}) resolved '${req.toolName}' to ${rule.outcome}.`, description: rule.description };
      }
    }
    return { decision: policy.defaultDecision, ruleId: `preset:${policy.presetName}`, source: 'preset', reason: `No rule matched; permission mode '${policy.presetName}' defaults to ${policy.defaultDecision}.`, description: `permission mode '${policy.presetName}' default` };
  } catch (cause) {
    const to: Decision = env.attended ? 'ask' : 'deny';
    return { decision: to, ruleId: 'failclosed:unresolvable-policy', source: 'fail-closed', reason: `The permission policy could not be resolved (${String(cause instanceof Error ? cause.message : cause)}); failing closed to ${to}.`, description: 'fail-closed' };
  }
}

/** REQ-TOOLS-025: an atomic pointer swap; an in-flight decision keeps the old value. */
export class PolicyContext {
  private policy: Policy;
  private approvals: SessionApproval[] = [];
  private grants = 0;
  constructor(policy: Policy) {
    this.policy = policy;
  }
  get current(): Policy {
    return this.policy;
  }
  replace(policy: Policy): void {
    validatePolicy(policy);
    this.policy = policy;
  }
  /**
   * REQ-TOOLS-023: grants outlive replacement; ids numbered from 1 in grant order. PD-TOOLS-004: a path-scoped grant
   * resolves its paths here, once, so it covers the paths the user approved and not wherever a link points later.
   */
  grant(req: PermissionRequest, env: GrantEnv): SessionApproval {
    this.grants += 1;
    const a = sessionApprovalFor(this.grants, req, env);
    this.approvals.push(a);
    return a;
  }
  get sessionApprovals(): readonly SessionApproval[] {
    return this.approvals;
  }
  evaluate(req: PermissionRequest, env: EvaluationEnv): DecisionRecord {
    return evaluate(this.policy, this.approvals, req, env);
  }
  /** REQ-TOOLS-176: an explicit discard. */
  discard(): void {
    this.approvals = [];
    this.grants = 0;
  }
}

// ---- mode selection and downgrade ------------------------------------------------------------

/** REQ-TOOLS-048: pin over override, unless the override is at least as restrictive as the pin. */
export function selectRequestedMode(input: { readonly pin?: string | null; readonly override?: string | null; readonly runtime?: string | null }): PermissionPreset {
  const pin = input.pin?.trim() ? resolvePreset(input.pin).preset : null;
  const override = input.override?.trim() ? resolvePreset(input.override).preset : null;
  if (pin && override) return presetRank(override) <= presetRank(pin) ? override : pin;
  if (pin) return pin;
  if (override) return override;
  return resolvePreset(input.runtime).preset;
}

export interface DowngradeInput {
  readonly requested: PermissionPreset;
  readonly attended: boolean;
  readonly sandboxed: boolean;
  readonly allowUnsandboxedAutonomous: boolean;
}

/** PD-TOOLS-002: the requested mode always applies — no downgrade, on any agent, for the whole run. The input fields above are retained (inert) so callers keep compiling; they have no effect. */
export function effectiveMode(input: DowngradeInput): { readonly effective: PermissionPreset; readonly downgraded: boolean; readonly reason: string } {
  return { effective: input.requested, downgraded: false, reason: '' };
}
