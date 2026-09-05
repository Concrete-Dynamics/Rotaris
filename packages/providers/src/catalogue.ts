import { err, failure, ok, type Failure, type Result } from '@rotaris/kernel';

/**
 * ADR-0028 — the provider catalogue is a frozen array of six records (REQ-PROVIDER-001/002/005/006),
 * validated by `validateCatalog()` in a build-time test AND at process start (REQ-PROVIDER-003). Absence is
 * the type's answer (`null`), never a placeholder string (REQ-PROVIDER-005: `claude-code` declares neither
 * URL). Nothing in the running product writes any attribute here.
 *
 * Built in Part K with ONE authenticator registered (`api-key`) and one discoverer (generic HTTP); the
 * device-code and browser-PKCE flows are owed and a sign-in to a provider needing one ends in
 * REQ-PROVIDER-012's failure outcome naming the method.
 */
export const PROVIDER_IDS = ['concrete-cloud', 'copilot', 'codex', 'openai-compatible', 'claude-code', 'deepseek'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const CONNECTION_MODES = ['hosted-cloud', 'direct', 'local-sdk', 'custom'] as const;
export type ConnectionMode = (typeof CONNECTION_MODES)[number];

/** REQ-PROVIDER-148: the three machine-readable tokens. */
export const SIGN_IN_METHODS = ['device-code', 'browser-pkce', 'api-key'] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/** REQ-PROVIDER-148: one label per token, used identically everywhere; none names a command. */
export const METHOD_LABELS: Readonly<Record<SignInMethod, string>> = Object.freeze({
  'device-code': 'Code shown here, entered at the provider',
  'browser-pkce': 'Sign in on a browser page',
  'api-key': 'Paste an API key',
});
/** REQ-PROVIDER-118/140: a provider that resolves to no method. */
export const MANAGED_BY_CONFIGURATION = 'Authentication is managed by model configuration.';

export interface CatalogueEntry {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly signInMethod: SignInMethod;
  /** REQ-PROVIDER-002/005: declared outright; `null` is absence, not emptiness. */
  readonly discoveryUrl: string | null;
  readonly discoveryAuthScheme: 'Bearer' | null;
  readonly baseUrl: string | null;
  readonly connectionMode: ConnectionMode;
  readonly operator: string | null;
  readonly privacyUrl: string | null;
  readonly available: boolean;
  readonly unavailabilityReason: string | null;
}

export const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  Object.freeze<CatalogueEntry>({
    id: 'concrete-cloud', displayName: 'Rotaris Cloud (recommended)', signInMethod: 'browser-pkce',
    discoveryUrl: 'https://rotaris.ai/v1/models', discoveryAuthScheme: 'Bearer', baseUrl: 'https://rotaris.ai/v1',
    connectionMode: 'hosted-cloud', operator: 'Concrete Dynamics UG (haftungsbeschränkt)', privacyUrl: 'https://rotaris.ai/privacy',
    available: false, unavailabilityReason: 'Rotaris Cloud is coming soon.',
  }),
  Object.freeze<CatalogueEntry>({
    id: 'copilot', displayName: 'GitHub Copilot', signInMethod: 'device-code',
    discoveryUrl: 'https://api.githubcopilot.com/models', discoveryAuthScheme: 'Bearer', baseUrl: 'https://api.githubcopilot.com',
    connectionMode: 'direct', operator: 'GitHub', privacyUrl: null, available: true, unavailabilityReason: null,
  }),
  Object.freeze<CatalogueEntry>({
    id: 'codex', displayName: 'OpenAI Codex', signInMethod: 'browser-pkce',
    discoveryUrl: 'https://chatgpt.com/backend-api/codex/models', discoveryAuthScheme: 'Bearer', baseUrl: 'https://chatgpt.com/backend-api/codex',
    connectionMode: 'direct', operator: 'OpenAI', privacyUrl: null, available: true, unavailabilityReason: null,
  }),
  Object.freeze<CatalogueEntry>({
    id: 'openai-compatible', displayName: 'OpenAI-compatible', signInMethod: 'api-key',
    discoveryUrl: 'https://api.openai.com/v1/models', discoveryAuthScheme: 'Bearer', baseUrl: 'https://api.openai.com/v1',
    connectionMode: 'custom', operator: null, privacyUrl: null, available: true, unavailabilityReason: null,
  }),
  Object.freeze<CatalogueEntry>({
    id: 'claude-code', displayName: 'Claude Code (subscription)', signInMethod: 'api-key',
    discoveryUrl: null, discoveryAuthScheme: null, baseUrl: null,
    connectionMode: 'local-sdk', operator: null, privacyUrl: null, available: true, unavailabilityReason: null,
  }),
  Object.freeze<CatalogueEntry>({
    id: 'deepseek', displayName: 'DeepSeek', signInMethod: 'api-key',
    discoveryUrl: 'https://api.deepseek.com/models', discoveryAuthScheme: 'Bearer', baseUrl: 'https://api.deepseek.com/v1',
    connectionMode: 'direct', operator: 'DeepSeek', privacyUrl: null, available: true, unavailabilityReason: null,
  }),
]);

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const h = new URL(url).hostname;
    return h.length > 0 ? h : null;
  } catch {
    return null;
  }
}

/** REQ-PROVIDER-004: empty for local-sdk and custom; the hostname of the default base URL otherwise. */
export function destinationHost(entry: CatalogueEntry): string | null {
  if (entry.connectionMode === 'local-sdk' || entry.connectionMode === 'custom') return null;
  return hostOf(entry.baseUrl);
}

/** REQ-PROVIDER-003: every violation an error; a build that violates any is rejected. */
export function validateCatalog(entries: readonly CatalogueEntry[] = CATALOGUE): Result<void, string[]> {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (entries.length !== PROVIDER_IDS.length) problems.push(`the catalogue must hold exactly ${PROVIDER_IDS.length} entries, holds ${entries.length}`);
  entries.forEach((e, i) => {
    if (e.id !== PROVIDER_IDS[i]) problems.push(`entry ${i} must be ${PROVIDER_IDS[i] ?? '?'}, is ${e.id} (REQ-PROVIDER-001 fixes the order)`);
    if (seen.has(e.id)) problems.push(`${e.id}: duplicate identifier`);
    seen.add(e.id);
    if (!(CONNECTION_MODES as readonly string[]).includes(e.connectionMode)) problems.push(`${e.id}: no connection mode`);
    if (e.connectionMode === 'hosted-cloud' || e.connectionMode === 'direct') {
      if (destinationHost(e) === null) problems.push(`${e.id}: a ${e.connectionMode} entry must yield a destination host from its default base URL`);
      if (e.discoveryUrl !== null && e.discoveryAuthScheme !== 'Bearer') problems.push(`${e.id}: a discovery endpoint's authorization scheme is Bearer`);
    }
    if (e.connectionMode === 'local-sdk' && (e.discoveryUrl !== null || e.baseUrl !== null)) problems.push(`${e.id}: a local-sdk entry declares neither a discovery endpoint nor a default base URL`);
    if (e.connectionMode === 'custom' && e.operator !== null) problems.push(`${e.id}: a custom-mode entry must not declare a fixed operator`);
    if (!e.available && (e.unavailabilityReason === null || e.unavailabilityReason.length === 0)) problems.push(`${e.id}: an unavailable entry must supply a reason`);
    if (e.discoveryUrl !== null && e.discoveryAuthScheme === null) problems.push(`${e.id}: a declared discovery endpoint declares its authorization scheme`);
  });
  return problems.length === 0 ? ok(undefined) : err(problems);
}

/** REQ-PROVIDER-007: an unknown id is an error; no aliases (REQ-PROVIDER-009). */
export function lookupProvider(id: string): Result<CatalogueEntry, Failure> {
  const e = CATALOGUE.find((c) => c.id === id);
  return e ? ok(e) : err(failure('provider.unknown', `Unknown provider: ${id}`, `Known providers: ${PROVIDER_IDS.join(', ')}`));
}

export const INSTANCE_PREFIX = 'openai-compatible--' as const;
export function isInstanceId(id: string): boolean {
  return id.startsWith(INSTANCE_PREFIX) && id.length > INSTANCE_PREFIX.length;
}

/** REQ-PROVIDER-051: the label lowercased, every run of non-alphanumerics one `-`, trimmed. */
export function instanceSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const LABEL_EMPTY = 'Label must contain at least one letter or number.';
export function instanceId(label: string): Result<string, string> {
  const slug = instanceSlug(label);
  return slug.length === 0 ? err(LABEL_EMPTY) : ok(`${INSTANCE_PREFIX}${slug}`);
}

/** REQ-PROVIDER-053: trim, strip trailing slashes, require scheme + host, drop a trailing `/models`. */
export const BASE_URL_EMPTY = 'API base URL must not be empty.';
export const BASE_URL_SHAPE = 'API base URL must include a scheme and hostname.';
export function normalizeBaseUrl(raw: string): Result<string, string> {
  let s = raw.trim().replace(/\/+$/, '');
  if (s.length === 0) return err(BASE_URL_EMPTY);
  let parsed: URL;
  try { parsed = new URL(s); } catch { return err(BASE_URL_SHAPE); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.hostname.length === 0) return err(BASE_URL_SHAPE);
  if (/\/models$/i.test(s)) s = s.replace(/\/models$/i, '').replace(/\/+$/, '');
  if (s.length === 0) return err(BASE_URL_SHAPE);
  return ok(s);
}
export function modelsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

/**
 * REQ-PROVIDER-008/009: the fixed mapping; an instance is api-key; an id outside the mapping resolves
 * (api-key) only when the stored credential is tagged with the family `openai-compatible`, else none.
 */
export function signInMethodFor(id: string, storedFamily: string | null = null): SignInMethod | null {
  const entry = CATALOGUE.find((c) => c.id === id);
  if (entry) return entry.signInMethod;
  if (isInstanceId(id)) return 'api-key';
  return storedFamily === 'openai-compatible' ? 'api-key' : null;
}

/** REQ-PROVIDER-117: the destination hint by connection mode. */
export function destinationHint(entry: CatalogueEntry): string {
  switch (entry.connectionMode) {
    case 'custom': return 'Custom endpoint — model traffic is sent to the base URL you enter below.';
    case 'local-sdk': return 'Rotaris invokes the Claude Agent SDK installed locally; traffic goes through that SDK.';
    case 'hosted-cloud': return `Rotaris-managed cloud service — destination: ${destinationHost(entry) ?? ''}.`;
    default: return `Direct provider API — ${entry.operator ?? ''}, destination: ${destinationHost(entry) ?? ''}.`;
  }
}

/** The display name for any id the product may list (REQ-PROVIDER-140/143): catalogue, snapshot label, or the bare id. */
export function displayNameFor(id: string, snapshotName: string | null = null): string {
  const entry = CATALOGUE.find((c) => c.id === id);
  if (entry) return entry.displayName;
  return snapshotName ?? id;
}
