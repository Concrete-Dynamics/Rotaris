import { err, ok, type Result } from '@rotaris/kernel';
import { acceptableLimit, classifyDiscoveryResponse, discover, DISCOVERY_TIMEOUT_MS, DISCOVERY_USER_AGENT, type DiscoveredModel, type DiscoveryError, type FetchLike } from './discovery.js';
import { COPILOT_API_HEADERS } from './flows/copilot.js';
import { CODEX_ORIGINATOR } from './flows/codex.js';
import type { KnownLimitsTable } from './limits.data.js';

/**
 * ADR-0028's discovery registry, the two strategies beside the generic one (REQ-PROVIDER-069): the codex subscription
 * catalogue (REQ-PROVIDER-076) and the Copilot catalogue with its editor identity, its dropping and its annotating
 * (REQ-PROVIDER-070, 073, 074). `claude-code`'s static catalogue is `flows/claude-code.ts`.
 *
 * What discovery learned about a model's route and availability travels in its `capabilities` map — `api_mode`,
 * `availability`, `availability_detail` — which is what the snapshot persists and the configuration layer reads
 * (REQ-PROVIDER-091: "limits, API mode, and pricing carried through from discovery").
 */
export const AVAILABILITY_CODES = ['available', 'policy_disabled', 'no_supported_route'] as const;
export type AvailabilityCode = (typeof AVAILABILITY_CODES)[number];

/** REQ-PROVIDER-075: one actionable sentence per code, the provider's detail after it. */
export function availabilitySentence(code: string | null | undefined, detail: string | null | undefined = null): string | null {
  if (code === null || code === undefined || code === '' || code === 'available') return null;
  const sentence = code === 'policy_disabled' ? "Your provider account has this model switched off. Enable it in the provider's settings, then refresh the model catalog."
    : code === 'no_supported_route' ? 'The provider offers this model only on an endpoint Rotaris cannot send requests to.'
    : 'The provider will not accept requests for this model.';
  const extra = (detail ?? '').trim().replace(/[.!?]+$/, '');
  if (extra.length === 0 || `${extra}.` === sentence || extra === sentence) return sentence;
  return `${sentence} ${extra}.`;
}

/** REQ-PROVIDER-082: only a model recorded as available may fill a slot or be dispatched to. */
export function isAvailable(model: Pick<DiscoveredModel, 'capabilities'>): boolean {
  const code = model.capabilities['availability'];
  return code === undefined || code === null || code === '' || code === 'available';
}

/** REQ-PROVIDER-074: the normalized endpoint set and the route that follows from it. */
export function copilotRoute(endpoints: unknown): 'chat' | 'responses' | null {
  const normalized: string[] = [];
  if (Array.isArray(endpoints)) {
    for (const raw of endpoints) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed.startsWith('/')) continue;
      const path = /^\/v\d+(\/|$)/.test(trimmed) ? trimmed : `/v1${trimmed}`;
      if (!normalized.includes(path)) normalized.push(path);
    }
  }
  if (normalized.length === 0) return 'chat';
  if (normalized.includes('/v1/chat/completions')) return 'chat';
  if (normalized.includes('/v1/responses')) return 'responses';
  return null;
}

/** REQ-PROVIDER-073: the payload key paths, declared once. */
const COPILOT_PATHS = Object.freeze({ capabilityType: ['capabilities', 'type'], policyState: ['policy', 'state'], policyTerms: ['policy', 'terms'], endpoints: ['supported_endpoints'], limits: ['capabilities', 'limits'], vision: ['capabilities', 'supports', 'vision'] });

function at(item: unknown, path: readonly string[]): unknown {
  let v: unknown = item;
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}

export interface StrategyOptions {
  readonly providerId: string;
  readonly displayName: string;
  readonly token: string;
  readonly fetch?: FetchLike;
  readonly knownLimits?: KnownLimitsTable;
}

/** REQ-PROVIDER-070/073/074. `apiBase` is the tenant base the session exchange stored, when it stored one. */
export async function discoverCopilot(opts: StrategyOptions & { readonly modelsUrl: string; readonly apiBase: string | null }): Promise<Result<DiscoveredModel[], DiscoveryError>> {
  let url = opts.modelsUrl;
  if (opts.apiBase) {
    try {
      const declared = new URL(opts.modelsUrl);
      const tenant = new URL(opts.apiBase);
      declared.protocol = tenant.protocol;
      declared.host = tenant.host;
      url = declared.toString();
    } catch { /* an unreadable tenant base leaves the declared endpoint */ }
  }
  const found = await discover({ providerId: opts.providerId, displayName: opts.displayName, modelsUrl: url, token: opts.token, extraHeaders: COPILOT_API_HEADERS, ...(opts.fetch ? { fetch: opts.fetch } : {}), ...(opts.knownLimits ? { knownLimits: opts.knownLimits } : {}) });
  if (!found.ok) return found;
  const kept: DiscoveredModel[] = [];
  for (const m of found.value) {
    const type = at(m.raw, COPILOT_PATHS.capabilityType);
    if (typeof type === 'string' && type !== 'chat') continue;
    const capabilities: Record<string, unknown> = { ...m.capabilities };
    const limits: Record<string, number> = { ...m.limits };
    const declared = at(m.raw, COPILOT_PATHS.limits);
    if (declared !== null && typeof declared === 'object') {
      const d = declared as Record<string, unknown>;
      const input = acceptableLimit(d['max_context_window_tokens']) ?? acceptableLimit(d['max_prompt_tokens']);
      const output = acceptableLimit(d['max_output_tokens']);
      if (input !== null) limits['context_window'] = input;
      if (output !== null) limits['max_output_tokens'] = output;
    }
    const vision = at(m.raw, COPILOT_PATHS.vision);
    if (typeof vision === 'boolean' && capabilities['accepts_image_input'] === undefined) capabilities['accepts_image_input'] = vision;
    const route = copilotRoute(at(m.raw, COPILOT_PATHS.endpoints));
    if (at(m.raw, COPILOT_PATHS.policyState) === 'disabled') {
      capabilities['availability'] = 'policy_disabled';
      const terms = at(m.raw, COPILOT_PATHS.policyTerms);
      if (typeof terms === 'string' && terms.trim().length > 0) capabilities['availability_detail'] = terms.trim();
    } else if (route === null) {
      capabilities['availability'] = 'no_supported_route';
    } else {
      capabilities['availability'] = 'available';
      capabilities['api_mode'] = route;
    }
    kept.push({ ...m, capabilities, limits });
  }
  return ok(kept);
}

export const CODEX_CLIENT_VERSION = '0.144.6';

/** REQ-PROVIDER-076. */
export async function discoverCodex(opts: StrategyOptions & { readonly modelsUrl: string; readonly accountId: string | null }): Promise<Result<DiscoveredModel[], DiscoveryError>> {
  const fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  const headers: Record<string, string> = { Authorization: `Bearer ${opts.token}`, originator: CODEX_ORIGINATOR, 'OpenAI-Beta': 'responses=experimental', 'User-Agent': DISCOVERY_USER_AGENT, Accept: 'application/json' };
  if (opts.accountId) headers['chatgpt-account-id'] = opts.accountId;
  let response: Response;
  let body: string;
  try {
    response = await fetchImpl(`${opts.modelsUrl}?client_version=${CODEX_CLIENT_VERSION}`, { method: 'GET', headers, signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) });
    const refused = classifyDiscoveryResponse(response.status, response.statusText ?? '', opts.displayName);
    if (refused) return err(refused);
    body = await response.text();
  } catch (cause) {
    return err({ kind: 'transport', status: null, message: `Discovery request failed: ${String((cause as Error).message ?? cause)}` });
  }
  let payload: unknown;
  try { payload = JSON.parse(body); } catch (cause) { return err({ kind: 'format', status: null, message: `Invalid response format: ${String((cause as Error).message ?? cause)}` }); }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return err({ kind: 'format', status: null, message: 'Invalid response format: expected JSON object' });
  const p = payload as Record<string, unknown>;
  const items = Array.isArray(p['models']) ? p['models'] : p['data'];
  if (!Array.isArray(items)) return err({ kind: 'format', status: null, message: 'Invalid response format: expected data list' });
  const models: DiscoveredModel[] = [];
  for (const raw of items) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return err({ kind: 'format', status: null, message: 'Invalid response format: expected model objects' });
    const item = raw as Record<string, unknown>;
    const slug = item['slug'];
    if (typeof slug !== 'string' || slug.length === 0) return err({ kind: 'format', status: null, message: 'Invalid response format: expected model slug' });
    if (item['supported_in_api'] === false || item['visibility'] === 'hide') continue;
    const capabilities: Record<string, unknown> = { api_mode: 'responses' };
    const levels: string[] = [];
    if (Array.isArray(item['supported_reasoning_levels'])) {
      for (const level of item['supported_reasoning_levels']) {
        const name: unknown = typeof level === 'string' ? level : level !== null && typeof level === 'object' ? (level as Record<string, unknown>)['effort'] : null;
        if (typeof name === 'string' && name.length > 0 && !levels.includes(name)) levels.push(name);
      }
    }
    if (levels.length > 0) capabilities['reasoning_levels'] = levels;
    if (Array.isArray(item['input_modalities'])) capabilities['accepts_image_input'] = item['input_modalities'].some((m) => typeof m === 'string' && m.toLowerCase() === 'image');
    const limits: Record<string, number> = {};
    const context = acceptableLimit(item['context_window']) ?? acceptableLimit(item['max_context_window']);
    if (context !== null) limits['context_window'] = context;
    models.push({ id: slug, qualifiedId: `${opts.providerId}/${slug}`, displayName: typeof item['display_name'] === 'string' ? item['display_name'] : null, capabilities, limits, pricing: {}, raw: item });
  }
  return ok(models);
}
