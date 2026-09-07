import type { ArtifactSection } from '@rotaris/contracts';
import type { ArtifactStore } from './store.js';

/**
 * The engine-owned artifact operations the `artifact_write`, `artifact_read` and `artifact_list` executors
 * call (REQ-LIBRARY-099/100/101). agent-tools declares a structurally identical port and the run-host root
 * hands one to the other; neither package imports the other — the same seam `DelegationOps` uses.
 *
 * Every operation is bound to the CALLING agent: a publish records its canonical instance name as
 * `created_by` (REQ-LIBRARY-093, never the persona), and a read records it as a consumer
 * (REQ-LIBRARY-096/099).
 */
export interface ArtifactListingEntry {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly persona: string;
  readonly tags: readonly string[];
}

export interface ArtifactOps {
  write(req: { readonly slug: string; readonly title: string; readonly body: string; readonly tags: readonly string[]; readonly supersedes: string | null }): { readonly ok: true; readonly id: string; readonly slug: string } | { readonly ok: false; readonly error: string };
  read(ref: string, sections: readonly string[]): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };
  list(query: { readonly kind: string | null; readonly persona: string | null; readonly tags: readonly string[]; readonly limit: number; readonly includeSuperseded: boolean }): readonly ArtifactListingEntry[];
}

export interface ActingAgent {
  /** REQ-LIBRARY-093: the canonical instance name, never the persona. */
  readonly canonicalName: string;
  readonly persona: string;
  readonly conversationId?: string | null | undefined;
}

const SECTION_NAMES: readonly string[] = ['summary', 'key_findings', 'snippets', 'highlights', 'files'];

/** REQ-LIBRARY-099/100/101 rendered as operations; the tool executors own the wording of the observations. */
export function artifactOps(store: ArtifactStore, agent: ActingAgent): ArtifactOps {
  return {
    write(req) {
      const r = store.publish({
        slug: req.slug, title: req.title, body: req.body, tags: req.tags, supersedes: req.supersedes,
        createdBy: agent.canonicalName, persona: agent.persona, conversationId: agent.conversationId ?? null,
      });
      return r.ok ? { ok: true, id: r.value.id, slug: r.value.slug } : { ok: false, error: r.error.reason };
    },
    read(ref, sections) {
      const record = store.lookup(ref);
      // REQ-LIBRARY-099: a miss is the observation `Artifact not found: <ref>`, worded by the executor.
      if (!record) return { ok: false, error: `not-found:${ref}` };
      const wanted = sections.filter((s) => SECTION_NAMES.includes(s)) as ArtifactSection[];
      if (wanted.length > 0) {
        // REQ-LIBRARY-099: every successful read marks the reader a consumer — a filtered read is a read.
        store.markConsumed(record.id, agent.canonicalName);
        return { ok: true, text: store.sections(record, wanted) };
      }
      const body = store.body(record.id);
      if (!body.ok) return { ok: false, error: body.error.reason };
      store.markConsumed(record.id, agent.canonicalName);
      return { ok: true, text: body.value.text };
    },
    list(query) {
      return store.list({
        ...(query.kind === null ? {} : { kind: query.kind }),
        ...(query.persona === null ? {} : { persona: query.persona }),
        tags: query.tags, limit: query.limit, includeSuperseded: query.includeSuperseded,
      }).map((r) => ({ id: r.id, slug: r.slug, title: r.title, kind: r.kind, status: r.status, persona: r.sourcePersona ?? '', tags: r.tags }));
    },
  };
}
