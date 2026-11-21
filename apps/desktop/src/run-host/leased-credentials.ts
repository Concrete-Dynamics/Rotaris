import { millis, type TimerHandle, type Timers } from '@rotaris/kernel';

/**
 * ADR-0030 / REQ-PROVIDER-068 — what main last leased this process, per sign-in provider: the bearer, the request
 * headers that provider's API needs (REQ-PROVIDER-070/076), and which of them carry an expiry. One credential store
 * stands behind every workspace, so the latest answer for a provider is the truth for every run that names it: a run
 * reads its bearer per request through `overlay`, and so sends the renewed one the moment main has it.
 *
 * The keep-fresh check asks main again at least every 60 seconds, for as long as a run lasts and only for the
 * credentials that carry an expiry. It asks nothing when no run is live — no refresh happens after a run ends — and a
 * failed ask is a warning that leaves the next check standing.
 */
export const KEEP_FRESH_INTERVAL_MS = 60_000;
/** A lease may renew a credential at its provider before it answers (REQ-PROVIDER-067), so it is given longer than a read. */
export const LEASE_ASK_MS = 45_000;

export interface LeaseAnswer {
  readonly bearers: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly renewable?: readonly string[];
}

export class LeasedCredentials {
  private readonly bearers = new Map<string, string>();
  private readonly headers = new Map<string, Readonly<Record<string, string>>>();
  private readonly renewable = new Set<string>();
  private timer: TimerHandle | null = null;
  private asking = false;

  /** Takes one lease answer for the providers that were asked about: what it resolved is kept, what it did not is forgotten. */
  absorb(asked: readonly string[], answer: LeaseAnswer | null): void {
    if (answer === null) return;
    for (const id of asked) {
      const bearer = answer.bearers[id];
      if (bearer === undefined || bearer.length === 0) { this.bearers.delete(id); this.headers.delete(id); this.renewable.delete(id); continue; }
      this.bearers.set(id, bearer);
      const extra = answer.headers?.[id];
      if (extra) this.headers.set(id, extra); else this.headers.delete(id);
      if (answer.renewable?.includes(id)) this.renewable.add(id); else this.renewable.delete(id);
    }
  }

  /** A run's own lease with every bearer main has renewed since laid over it. A provider the run was never leased stays absent. */
  overlay(run: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    let out: Record<string, string> | null = null;
    for (const id of Object.keys(run)) {
      const latest = this.bearers.get(id);
      if (latest !== undefined && latest !== run[id]) { out ??= { ...run }; out[id] = latest; }
    }
    return out ?? run;
  }

  headersFor(provider: string): Readonly<Record<string, string>> | undefined { return this.headers.get(provider); }

  /** REQ-PROVIDER-068: starts the check. `ask` re-leases the named providers from main; `runsLive` says whether any run lasts. */
  keepFresh(timers: Timers, runsLive: () => boolean, ask: (providers: readonly string[]) => Promise<LeaseAnswer | null>, warn: (m: string) => void): void {
    this.timer?.cancel();
    this.timer = timers.every(millis(KEEP_FRESH_INTERVAL_MS), () => {
      if (this.asking || this.renewable.size === 0 || !runsLive()) return;
      const ids = [...this.renewable].sort();
      this.asking = true;
      void ask(ids)
        .then((answer) => { if (answer === null) warn('credential lease: the keep-fresh check got no answer from main; it is asked again at the next check'); else this.absorb(ids, answer); })
        .catch((e: Error) => warn(`credential lease: the keep-fresh check failed (${e.message}); it is asked again at the next check`))
        .finally(() => { this.asking = false; });
    });
  }

  stop(): void { this.timer?.cancel(); this.timer = null; }
}
