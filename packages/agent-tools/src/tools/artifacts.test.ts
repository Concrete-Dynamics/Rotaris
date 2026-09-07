import { describe, expect, it } from 'vitest';
import { artifactListLine, artifactListTool, artifactReadTool, artifactWriteTool, type ArtifactListingEntry, type ArtifactPort } from './artifacts.js';
import type { ToolContext } from './types.js';

/** REQ-LIBRARY-099/100/101: the three observations, word for word. */
const CTX = {} as ToolContext;
const entry = (over: Partial<ArtifactListingEntry> = {}): ArtifactListingEntry => ({ id: 'art_ABCDEFGH', slug: 'the-plan', title: 'The Plan', kind: 'agent_published', status: 'published', persona: 'planner', tags: ['planning', 'research'], ...over });

function portWith(over: Partial<ArtifactPort> = {}): ArtifactPort {
  return {
    write: () => ({ ok: true, id: 'art_ABCDEFGH', slug: 'the-plan' }),
    read: () => ({ ok: true, text: 'the body' }),
    list: () => [entry()],
    ...over,
  };
}

describe('agent-tools/artifacts — the three tools (REQ-LIBRARY-099/100/101)', () => {
  it('REQ-LIBRARY-101: a publish replies `Published artifact <id> (slug: <slug>).`', async () => {
    const o = await artifactWriteTool(portWith()).execute({ slug: 'the-plan', title: 'The Plan', body: 'b', tags: [], supersedes: null }, CTX);
    expect(o).toMatchObject({ text: 'Published artifact art_ABCDEFGH (slug: the-plan).', isError: false });
  });

  it('REQ-LIBRARY-089: a refused publish carries the refusal as an error observation, unchanged', async () => {
    const port = portWith({ write: () => ({ ok: false, error: 'Invalid tag(s): Nope. Valid tags are: research, planning, implementation, review, verification, errors' }) });
    const o = await artifactWriteTool(port).execute({ slug: 's', title: 't', body: 'b', tags: ['Nope'], supersedes: null }, CTX);
    expect(o.isError).toBe(true);
    expect(o.text).toBe('Invalid tag(s): Nope. Valid tags are: research, planning, implementation, review, verification, errors');
  });

  it('REQ-LIBRARY-099: a read returns the body, and a miss is `Artifact not found: <ref>`', async () => {
    expect((await artifactReadTool(portWith()).execute({ id_or_slug: 'the-plan', sections: [] }, CTX)).text).toBe('the body');
    const missing = await artifactReadTool(portWith({ read: () => ({ ok: false, error: 'not-found:ghost' }) })).execute({ id_or_slug: 'ghost', sections: [] }, CTX);
    expect(missing).toMatchObject({ text: 'Artifact not found: ghost', isError: true });
  });

  it('REQ-LIBRARY-100: the listing renders `<N> artifact(s):` plus one line per record, or `No artifacts found.`', async () => {
    expect(artifactListLine(entry())).toBe('- art_ABCDEFGH [the-plan] persona=planner status=published tags=[planning, research] — The Plan');
    const o = await artifactListTool(portWith()).execute({ kind: null, persona: null, tags: [], limit: 20, include_superseded: false }, CTX);
    expect(o.text).toBe('1 artifact(s):\n- art_ABCDEFGH [the-plan] persona=planner status=published tags=[planning, research] — The Plan');
    const empty = await artifactListTool(portWith({ list: () => [] })).execute({ kind: null, persona: null, tags: [], limit: 20, include_superseded: false }, CTX);
    expect(empty.text).toBe('No artifacts found.');
  });
});
