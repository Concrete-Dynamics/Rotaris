import { clipValue, isSecretLookingName, redact } from '@rotaris/kernel';
import { type Decision, type DecisionSource, type PermissionPreset, presetRank, resolvePreset } from '@rotaris/contracts';
import { isRemoteUrl } from './egress.js';
import { canonicalToolName, META_TOOL_NAMES, NETWORK_CLASS, READ_ONLY_CLASS } from './registry.js';
import { decompose, escalationMatcherFires, patternMatcherFires, pipeToShellMatcherFires, type Segment, tokenizePattern } from './scanner.js';

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
  /** REQ-TOOLS-024: `Approved for this session: <request summary>`. */
  readonly description: string;
}

export function sessionApprovalFor(n: number, req: PermissionRequest): SessionApproval {
  return {
    id: `session:allow:${n}`,
    toolName: req.toolName.toLowerCase(),
    persona: req.persona,
    commandFacet: req.commandFacet,
    args: req.commandFacet === null ? canonicalArguments(req.args) : null,
    description: `Approved for this session: ${requestSummary(req)}`,
  };
}

function approvalMatches(a: SessionApproval, req: PermissionRequest): boolean {
  if (a.toolName !== req.toolName.toLowerCase() || a.persona !== req.persona) return false;
  if (a.commandFacet !== null) return req.commandFacet === a.commandFacet;
  if (req.commandFacet !== null) return false;
  return sameArguments(a.args ?? {}, canonicalArguments(req.args));
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
      real = env.resolvePath(p);
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

function ruleFires(rule: Rule, req: PermissionRequest, env: EvaluationEnv, segments: () => readonly Segment[]): boolean {
  if (rule.tools && !rule.tools.has(req.toolName.toLowerCase()) && !rule.tools.has(canonicalToolName(req.toolName).toLowerCase())) return false;
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
    for (let i = approvals.length - 1; i >= 0; i -= 1) {
      const a = approvals[i] as SessionApproval;
      if (approvalMatches(a, req)) {
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
  /** REQ-TOOLS-023: grants outlive replacement; ids numbered from 1 in grant order. */
  grant(req: PermissionRequest): SessionApproval {
    this.grants += 1;
    const a = sessionApprovalFor(this.grants, req);
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
