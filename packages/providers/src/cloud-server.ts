import { readFileSync } from 'node:fs';
import { err, failure, ok, type Failure, type Result, type Timers } from '@rotaris/kernel';
import { NO_RETRY, replaceDocument, type RetryLadder } from '@rotaris/platform';
import { CLOUD_DEFAULT_API_BASE, CLOUD_DEFAULT_ISSUER, normalizeIssuer, type CloudServerChoice } from './flows/cloud.js';
import { normalizeBaseUrl } from './catalogue.js';

/**
 * PD-PROVIDER-004 — the Rotaris Cloud server the user chose, kept as `rotaris-cloud-server.json` in the per-user
 * configuration directory: `{ "api_base": …, "issuer": … }`, each half optional, an absent half meaning the production
 * default. It names two public URLs and holds no credential. A file that cannot be read states nothing.
 */
export const CLOUD_SERVER_FILE = 'rotaris-cloud-server.json';

export interface CloudServerStoreDeps { readonly path: string; readonly timers: Timers; readonly ladder?: RetryLadder; readonly warn: (m: string) => void }

export class CloudServerStore {
  constructor(private readonly deps: CloudServerStoreDeps) {}

  read(): CloudServerChoice | null {
    let raw: string;
    try { raw = readFileSync(this.deps.path, 'utf8'); } catch { return null; }
    try {
      const v: unknown = JSON.parse(raw);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      const o = v as Record<string, unknown>;
      return { apiBase: typeof o['api_base'] === 'string' ? o['api_base'] : null, issuer: typeof o['issuer'] === 'string' ? o['issuer'] : null };
    } catch (cause) {
      this.deps.warn(`${CLOUD_SERVER_FILE} is unreadable and ignored: ${String((cause as Error).message ?? cause)}`);
      return null;
    }
  }

  /** Validates and stores the choice; a half equal to the production default, or empty, is stored as absent. */
  async write(choice: CloudServerChoice): Promise<Result<CloudServerChoice, Failure>> {
    const keep = (raw: string | null | undefined, normalize: (s: string) => Result<string, string>, fallback: string): Result<string | null, Failure> => {
      if (typeof raw !== 'string' || raw.trim().length === 0) return ok(null);
      const n = normalize(raw);
      if (!n.ok) return err(failure('cloud-server.invalid', n.error));
      return ok(n.value === fallback ? null : n.value);
    };
    const api = keep(choice.apiBase, normalizeBaseUrl, CLOUD_DEFAULT_API_BASE);
    if (!api.ok) return api;
    const issuer = keep(choice.issuer, normalizeIssuer, CLOUD_DEFAULT_ISSUER);
    if (!issuer.ok) return issuer;
    const stored: CloudServerChoice = { apiBase: api.value, issuer: issuer.value };
    const doc = JSON.stringify({ ...(api.value !== null ? { api_base: api.value } : {}), ...(issuer.value !== null ? { issuer: issuer.value } : {}) }, null, 2) + '\n';
    const w = await replaceDocument(this.deps.path, doc, { mode: 0o644, ladder: this.deps.ladder ?? NO_RETRY, timers: this.deps.timers, createParent: true });
    return w.ok ? ok(stored) : err(w.error);
  }
}
