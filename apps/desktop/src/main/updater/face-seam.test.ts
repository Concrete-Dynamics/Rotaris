import { describe, expect, it } from 'vitest';
import { UpdateStateSchema, type UpdateState } from '@rotaris/contracts';
import { createNoticeStore } from '../notices.js';
import { createFaceSeam, UPDATE_FACE_NAMES } from './face-seam.js';
import { CANCEL_DOWNLOAD, INSTALLED_TITLE, NOT_INSTALLED_TITLE, offerTitle, REFUSED_MESSAGE, updatedToTitle } from './updater.js';

/** The verification-only face seam (R-117): the updater's own faces, into the notice store and channel 17, nothing else. */
function seam() {
  const states: UpdateState[] = [];
  const acks: string[] = [];
  const notices = createNoticeStore({ broadcast: () => undefined, pushAcknowledgement: (a) => { acks.push(a.title); }, record: async () => true, log: () => undefined, focusedSession: () => 's1' });
  return { states, acks, notices, seam: createFaceSeam({ notices, publishState: (s) => { states.push(s); } }) };
}

describe('the update face seam — the title-bar and notice-banner briefs §11', () => {
  it('publishes each face the updater draws, and the indicator state that goes with it', async () => {
    const h = seam();
    expect((await h.seam.show('offer')).state.phase).toBe('none');
    expect(h.notices.current()).toMatchObject({ title: offerTitle('0.2.0') });
    const down = await h.seam.show('downloading');
    expect(down.state).toEqual({ phase: 'downloading', version: '0.2.0', measured: '41%', noticeId: 1 });
    expect(h.notices.current()).toMatchObject({ id: 1, progress: 41, action: { label: CANCEL_DOWNLOAD } });
    await h.seam.show('ready');
    expect(h.notices.current()).toMatchObject({ id: 1, title: INSTALLED_TITLE });
    expect(h.notices.current()?.progress).toBeUndefined();
    await h.seam.show('refused');
    expect(h.notices.current()).toMatchObject({ title: NOT_INSTALLED_TITLE, message: REFUSED_MESSAGE });
    await h.seam.show('acknowledgement', '0.3.0');
    await h.notices.settled();
    expect(h.acks).toEqual([updatedToTitle('0.3.0')]);
    for (const state of h.states) expect(UpdateStateSchema.safeParse(state).success).toBe(true);
    expect(UPDATE_FACE_NAMES).toContain('downloading-unsized');
  });

  it('refuses a face it does not know', async () => {
    await expect(seam().seam.show('installing')).rejects.toThrow(/unknown update face/);
  });
});
