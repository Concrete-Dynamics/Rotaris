import { z } from 'zod';
import { ARTIFACT_SECTIONS, ARTIFACT_TAGS } from '@rotaris/contracts';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * REQ-LIBRARY-099/100/101 — the three artifact tools the registry already names (ADR-0016's table), over a
 * port the engine fills. agent-tools declares the port and the engine declares a structurally identical set
 * of operations; neither imports the other, exactly as the delegation tools do.
 *
 * The observations are fixed by the requirements and are written here, character for character:
 * `Published artifact <id> (slug: <slug>).`, `Artifact not found: <ref>`, `<N> artifact(s):` and
 * `- <id> [<slug>] persona=<p> status=<s> tags=[…] — <title>`, and `No artifacts found.`.
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

export interface ArtifactPort {
  write(req: { readonly slug: string; readonly title: string; readonly body: string; readonly tags: readonly string[]; readonly supersedes: string | null }): { readonly ok: true; readonly id: string; readonly slug: string } | { readonly ok: false; readonly error: string };
  read(ref: string, sections: readonly string[]): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };
  list(query: { readonly kind: string | null; readonly persona: string | null; readonly tags: readonly string[]; readonly limit: number; readonly includeSuperseded: boolean }): readonly ArtifactListingEntry[];
}

const writeSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  tags: z.array(z.string()).default([]),
  supersedes: z.string().nullable().default(null),
});

export function artifactWriteTool(port: ArtifactPort): ToolExecutor<z.infer<typeof writeSchema>> {
  return {
    name: 'artifact_write',
    description: `Publish a durable artifact for this session: a report, a plan, a design or any deliverable later agents should read rather than rediscover. The body is Markdown. Tags come from ${ARTIFACT_TAGS.join(', ')}. Pass supersedes with an earlier artifact's id or slug to replace it.`,
    schema: writeSchema,
    label: (a) => `artifact_write ${a.slug}`,
    execute: async (a) => {
      const r = port.write({ slug: a.slug, title: a.title, body: a.body, tags: a.tags, supersedes: a.supersedes });
      // REQ-LIBRARY-089: a refusal is whole — no record, no file, no partial state — and its wording is the requirement's.
      if (!r.ok) return errorObservation(r.error);
      return observation(`Published artifact ${r.id} (slug: ${r.slug}).`);
    },
  };
}

const readSchema = z.object({
  id_or_slug: z.string().min(1),
  sections: z.array(z.enum(ARTIFACT_SECTIONS)).default([]),
});

export function artifactReadTool(port: ArtifactPort): ToolExecutor<z.infer<typeof readSchema>> {
  return {
    name: 'artifact_read',
    description: `Read an artifact published earlier in this session by id or slug. Without sections the full Markdown body comes back; sections filters it to any of ${ARTIFACT_SECTIONS.join(', ')}.`,
    schema: readSchema,
    label: (a) => `artifact_read ${a.id_or_slug}`,
    execute: async (a) => {
      const r = port.read(a.id_or_slug, a.sections);
      if (!r.ok) {
        // REQ-LIBRARY-099: a miss is exactly this observation; every other failure reports itself.
        return errorObservation(r.error.startsWith('not-found:') ? `Artifact not found: ${a.id_or_slug}` : r.error);
      }
      return observation(r.text);
    },
  };
}

const listSchema = z.object({
  kind: z.string().nullable().default(null),
  persona: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(200).default(20),
  include_superseded: z.boolean().default(false),
});

/** REQ-LIBRARY-100: the line format, exactly. */
export function artifactListLine(entry: ArtifactListingEntry): string {
  return `- ${entry.id} [${entry.slug}] persona=${entry.persona} status=${entry.status} tags=[${entry.tags.join(', ')}] — ${entry.title}`;
}

export function artifactListTool(port: ArtifactPort): ToolExecutor<z.infer<typeof listSchema>> {
  return {
    name: 'artifact_list',
    description: 'List the artifacts published in this session, oldest first. Filter by kind, persona or tags (all given tags must be present); limit is 1..200 and defaults to 20. Superseded artifacts are hidden unless include_superseded is true.',
    schema: listSchema,
    label: () => 'artifact_list',
    execute: async (a) => {
      const rows = port.list({ kind: a.kind, persona: a.persona, tags: a.tags, limit: a.limit, includeSuperseded: a.include_superseded });
      if (rows.length === 0) return observation('No artifacts found.');
      return observation([`${rows.length} artifact(s):`, ...rows.map(artifactListLine)].join('\n'));
    },
  };
}
