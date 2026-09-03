import type { Millis, MonotonicClock, WorkspaceId } from '@rotaris/kernel';
import { Budget } from '@rotaris/kernel';

/**
 * ADR-0058 step 3b / ADR-0002 consequence 11(c) — the run host's refusal of
 * new runs for a workspace is a LEASE the run host expires by itself.
 *
 * Spike 22 measured the dual failure: kill the workspace service after the
 * run host has closed, and the run host stays closed and refuses every launch
 * for ever, with the store held by nobody. A workspace service that has died
 * releases the workspace by doing nothing — the only behaviour available to a
 * process that is gone. IC-1 E3b re-admitted runs 10/10 on expiry.
 */
export class RefusalLease {
  private leases = new Map<WorkspaceId, Budget>();

  constructor(private readonly clock: MonotonicClock) {}

  refuse(id: WorkspaceId, leaseMs: Millis): void {
    this.leases.set(id, Budget.begin(this.clock.now(), leaseMs));
  }

  /** Renewed while a restore is genuinely running. */
  renew(id: WorkspaceId, leaseMs: Millis): boolean {
    if (!this.leases.has(id)) return false;
    this.leases.set(id, Budget.begin(this.clock.now(), leaseMs));
    return true;
  }

  release(id: WorkspaceId): void {
    this.leases.delete(id);
  }

  /** True while a lease is held and unexpired. An expired lease is dropped on the read. */
  isRefusing(id: WorkspaceId): boolean {
    const b = this.leases.get(id);
    if (!b) return false;
    if (b.expired(this.clock.now())) {
      this.leases.delete(id);
      return false;
    }
    return true;
  }
}
