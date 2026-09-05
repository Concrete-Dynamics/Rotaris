import { err, ok, type Result } from '@rotaris/kernel';
import { lookupKnownLimits, type KnownLimitsTable } from './limits.data.js';

/**
 * REQ-PROVIDER-069/071/072 — generic HTTP discovery: GET the models endpoint with `Authorization: Bearer`
 * and `User-Agent: rotaris/discovery`, 10 s default timeout; the error mapping is TOTAL (no status is left
 * unclassified, none silently treated as success); each model captured with its qualified id, display
 * name, capabilities (the image-input declaration of 149 from the payload where it reports one), limits
 * (078's key ladder, 079/080's known-limits back-fill) and the raw item. Pricing is mapped only for the
 * hosted provider (072), which this build does not sign in to, so every entry carries none.
 *
 * The codex and claude-code strategies of the discovery registry (ADR-0028) are owed; this is the one
 * discoverer, keyed by "every other provider".
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DiscoveredModel {
  readonly id: string;
  /** `<provider-or-instance id>/<id>` (REQ-PROVIDER-072). */
  readonly qualifiedId: string;
  readonly displayName: string | null;
  readonly capabilities: Readonly<Record<string, unknown>> & { readonly accepts_image_input?: boolean };
  readonly limits: Readonly<Record<string, number>>;
  readonly pricing: Readonly<Record<string, unknown>>;
  readonly raw: unknown;
}

export type DiscoveryErrorKind = 'transport' | 'auth' | 'server' | 'format' | 'refused' | 'rate-limited';
export interface DiscoveryError {
  readonly kind: DiscoveryErrorKind;
  readonly message: string;
  readonly status: number | null;
}

export interface DiscoverOptions {
  readonly providerId: string;
  readonly displayName: string;
  readonly modelsUrl: string;
  readonly token: string;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly knownLimits?: KnownLimitsTable;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

export const DISCOVERY_TIMEOUT_MS = 10_000;
export const DISCOVERY_USER_AGENT = 'rotaris/discovery';

/** REQ-PROVIDER-078: the fixed key orders and the acceptability predicate. */
export const INPUT_LIMIT_KEYS = ['context_tokens', 'max_input_tokens', 'context_window', 'max_context_window_tokens', 'max_context_tokens', 'context_length', 'max_prompt_tokens', 'input_tokens', 'token_limit', 'max_tokens'] as const;
export const OUTPUT_LIMIT_KEYS = ['output_tokens', 'max_output_tokens', 'max_completion_tokens'] as const;

export function acceptableLimit(v: unknown): number | null {
  if (typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 && Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^[0-9][0-9_,]*$/.test(v)) {
    const n = Number(v.replace(/[_,]/g, ''));
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

function firstAcceptable(sources: readonly unknown[], keys: readonly string[]): number | null {
  for (const key of keys) {
    for (const src of sources) {
      if (src === null || typeof src !== 'object') continue;
      const n = acceptableLimit((src as Record<string, unknown>)[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

/** REQ-PROVIDER-149: the payload's own declaration where it makes one; absent otherwise (never inferred from the name). */
function imageInputOf(item: Record<string, unknown>): boolean | null {
  const caps = item['capabilities'];
  if (caps && typeof caps === 'object' && typeof (caps as Record<string, unknown>)['accepts_image_input'] === 'boolean') return (caps as Record<string, unknown>)['accepts_image_input'] as boolean;
  const arch = item['architecture'];
  const modalities = (arch && typeof arch === 'object' ? (arch as Record<string, unknown>)['input_modalities'] : undefined) ?? item['input_modalities'];
  if (Array.isArray(modalities)) return modalities.some((m) => typeof m === 'string' && m.toLowerCase() === 'image');
  return null;
}

export function modelOfItem(item: Record<string, unknown>, providerId: string, known?: KnownLimitsTable): DiscoveredModel | null {
  const id = item['id'];
  if (typeof id !== 'string' || id.length === 0) return null;
  const display = typeof item['display_name'] === 'string' ? item['display_name'] : typeof item['name'] === 'string' ? item['name'] : null;
  const limits: Record<string, number> = {};
  const sources = [item, item['limits'], item['top_provider']];
  const input = firstAcceptable(sources, INPUT_LIMIT_KEYS);
  const output = firstAcceptable(sources, OUTPUT_LIMIT_KEYS);
  const qualifiedId = `${providerId}/${id}`;
  // REQ-PROVIDER-080: the known table fills gaps only.
  const back = known ? lookupKnownLimits(known, providerId, id) : null;
  const inputFinal = input ?? back?.input ?? null;
  const outputFinal = output ?? back?.output ?? null;
  if (inputFinal !== null) limits['context_window'] = inputFinal;
  if (outputFinal !== null) limits['max_output_tokens'] = outputFinal;
  const image = imageInputOf(item);
  const capabilities: Record<string, unknown> = {};
  if (image !== null) capabilities['accepts_image_input'] = image;
  return { id, qualifiedId, displayName: display, capabilities, limits, pricing: {}, raw: item };
}

/** REQ-PROVIDER-071's total mapping over an HTTP outcome. */
export function classifyDiscoveryResponse(status: number, reasonPhrase: string, displayName: string): DiscoveryError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return { kind: 'auth', status, message: `Authentication failed for ${displayName}: ${status}` };
  if (status >= 500) return { kind: 'server', status, message: `Discovery request failed: ${reasonPhrase.length > 0 ? reasonPhrase : `HTTP ${status}`}` };
  if (status === 429) return { kind: 'rate-limited', status, message: `The provider refused the catalog request with HTTP 429: it is rate limiting requests, so the catalog can be read again later.` };
  return { kind: 'refused', status, message: `The provider refused the catalog request with HTTP ${status}, for a reason other than authentication.` };
}

export function parseDiscoveryPayload(body: string): Result<Record<string, unknown>[], DiscoveryError> {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (cause) {
    return err({ kind: 'format', status: null, message: `Invalid response format: ${String((cause as Error).message ?? cause)}` });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return err({ kind: 'format', status: null, message: 'Invalid response format: expected JSON object' });
  const data = (payload as Record<string, unknown>)['data'];
  if (!Array.isArray(data)) return err({ kind: 'format', status: null, message: 'Invalid response format: expected data list' });
  for (const item of data) if (item === null || typeof item !== 'object' || Array.isArray(item)) return err({ kind: 'format', status: null, message: 'Invalid response format: expected model objects' });
  return ok(data as Record<string, unknown>[]);
}

export async function discover(opts: DiscoverOptions): Promise<Result<DiscoveredModel[], DiscoveryError>> {
  const fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  const headers: Record<string, string> = { Authorization: `Bearer ${opts.token}`, 'User-Agent': DISCOVERY_USER_AGENT, Accept: 'application/json', ...(opts.extraHeaders ?? {}) };
  let response: Response;
  try {
    response = await fetchImpl(opts.modelsUrl, { method: 'GET', headers, signal: AbortSignal.timeout(opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS) });
  } catch (cause) {
    return err({ kind: 'transport', status: null, message: `Discovery request failed: ${String((cause as Error).message ?? cause)}` });
  }
  const refused = classifyDiscoveryResponse(response.status, response.statusText ?? '', opts.displayName);
  if (refused) return err(refused);
  let body: string;
  try {
    body = await response.text();
  } catch (cause) {
    return err({ kind: 'transport', status: null, message: `Discovery request failed: ${String((cause as Error).message ?? cause)}` });
  }
  const items = parseDiscoveryPayload(body);
  if (!items.ok) return items;
  const models: DiscoveredModel[] = [];
  for (const item of items.value) {
    const m = modelOfItem(item, opts.providerId, opts.knownLimits);
    if (m) models.push(m);
  }
  return ok(models);
}
