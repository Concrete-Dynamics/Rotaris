import { UPDATE_STATE_NONE, type UpdateState } from '@rotaris/contracts';
import type { NoticePatch, NoticeStore } from '../notices.js';
import { hashMismatchSentence } from './install.js';
import { UPDATE_FACES, updatedToTitle, type Face } from './updater.js';

/**
 * VERIFICATION ONLY — the face seam the title-bar brief §11 and the notice-banner brief §11 name (R-117). The development
 * host cannot run the update path (`updater-proof`: no check, no request), and REQ-STARTUP-111 forbids moving the endpoint,
 * so the update's surfaces are reached in a built application by publishing the updater's OWN faces (`UPDATE_FACES`) into
 * the notice store and the same channel-17 publisher the title-bar indicator reads. It never touches the feed, the
 * download, the pending update or the apply, and it changes nothing the updater holds: a press of the indicator's or the
 * notice's action reaches the real updater, which answers that nothing runs.
 *
 * Reached only from the driver (`driver.ts`'s `updateFace` op), which main starts only under `__ROTARIS_SEAMS__` and
 * `ROTARIS_DRIVER`; a packaged bundle holds neither (`electron.vite.config.ts`).
 */
export const UPDATE_FACE_NAMES = ['offer', 'downloading', 'downloading-unsized', 'ready', 'failed', 'refused', 'acknowledgement', 'none'] as const;
export type UpdateFaceName = (typeof UPDATE_FACE_NAMES)[number];

export interface FaceSeamDeps {
  readonly notices: Pick<NoticeStore, 'report' | 'update' | 'current' | 'acknowledge'>;
  readonly publishState: (state: UpdateState) => void;
}

export interface FaceSeam {
  /** Publish one face; answers the notice it now stands on (or null) and the indicator's state as published. */
  show(name: string, version?: string): Promise<{ readonly face: UpdateFaceName; readonly noticeId: number | null; readonly state: UpdateState }>;
}

const SAMPLE_SUMMARY = '';
const SAMPLE_ASSET = 'Rotaris-0.2.0-linux-x64.AppImage';

export function createFaceSeam(deps: FaceSeamDeps): FaceSeam {
  /** The update notice the seam published last: a later face changes it in place while it is current, as the updater does. */
  let noticeId: number | null = null;
  const put = async (face: Face): Promise<number> => {
    const patch: NoticePatch = { severity: face.severity, title: face.title, message: face.message, detail: face.detail, persistent: face.persistent, action: face.action, progress: face.progress };
    if (noticeId !== null && deps.notices.current()?.id === noticeId && await deps.notices.update(noticeId, patch)) return noticeId;
    const published = await deps.notices.report({
      severity: face.severity, title: face.title, message: face.message, detail: face.detail, persistent: face.persistent,
      ...(face.action === null ? {} : { action: face.action }),
      ...(face.progress === null ? {} : { progress: face.progress }),
    });
    return published.id;
  };
  return {
    async show(name, version = '0.2.0') {
      if (!(UPDATE_FACE_NAMES as readonly string[]).includes(name)) throw new Error(`unknown update face ${JSON.stringify(name)}; one of ${UPDATE_FACE_NAMES.join(', ')}`);
      const face = name as UpdateFaceName;
      let state: UpdateState = { ...UPDATE_STATE_NONE, noticeId };
      switch (face) {
        case 'offer':
          deps.publishState(state);
          noticeId = await put(UPDATE_FACES.offer({ version, summary: SAMPLE_SUMMARY }));
          break;
        case 'downloading':
        case 'downloading-unsized': {
          const measured = face === 'downloading' ? '41%' : '1024 MB';
          state = { phase: 'downloading', version, measured, noticeId };
          deps.publishState(state);
          noticeId = await put(UPDATE_FACES.downloading(version, measured, face === 'downloading' ? 41 : null));
          state = { ...state, noticeId };
          break;
        }
        case 'ready':
          state = { phase: 'ready', version, inPlace: true, noticeId };
          deps.publishState(state);
          noticeId = await put(UPDATE_FACES.installedInPlace(version));
          state = { ...state, noticeId };
          break;
        case 'failed':
          deps.publishState(state);
          noticeId = await put(UPDATE_FACES.failure(`could not download ${SAMPLE_ASSET}: HTTP 503`));
          break;
        case 'refused':
          deps.publishState(state);
          noticeId = await put(UPDATE_FACES.refused(hashMismatchSentence(SAMPLE_ASSET, 'a'.repeat(64), 'b'.repeat(64))));
          break;
        case 'acknowledgement':
          deps.notices.acknowledge('ok', updatedToTitle(version));
          return { face, noticeId, state };
        case 'none':
          break;
      }
      deps.publishState(state);
      return { face, noticeId, state };
    },
  };
}
