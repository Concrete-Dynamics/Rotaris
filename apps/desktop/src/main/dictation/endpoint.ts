import { err, ok } from '@rotaris/kernel';
import { audioExtension, TRANSCRIPTION_TIMEOUT_MS, type Transcriber } from './port.js';

/**
 * The endpoint client (OQ-457): `POST <base_url>/audio/transcriptions`, the OpenAI-compatible shape a local server speaks as
 * readily as a hosted one. `base_url` has the shape a `models:` entry's has (`…/v1`). The bearer is the named provider's, leased
 * in main at each press (OQ-458), and no refusal this writes carries it.
 */
export interface EndpointDeps {
  readonly baseUrl: string;
  readonly model: string;
  readonly bearer: string | null;
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly timeoutMs?: number | undefined;
}

/** A `file` part's type is the recorder's without its parameters: a multipart parser reads `audio/webm;codecs=opus` as a third field on some servers. */
const bareType = (mimeType: string): string => mimeType.split(';')[0]?.trim() || 'application/octet-stream';

export function endpointTranscriber(deps: EndpointDeps): Transcriber {
  const send = deps.fetch ?? globalThis.fetch;
  const url = `${deps.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  return {
    transcribe: async ({ audio, mimeType, language }) => {
      const form = new FormData();
      form.append('file', new Blob([audio.slice()], { type: bareType(mimeType) }), `recording.${audioExtension(mimeType)}`);
      form.append('model', deps.model);
      form.append('response_format', 'json');
      if (language !== null) form.append('language', language);
      let response: Response;
      try {
        response = await send(url, { method: 'POST', body: form, headers: deps.bearer === null ? {} : { Authorization: `Bearer ${deps.bearer}` }, signal: AbortSignal.timeout(deps.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS) });
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'TimeoutError') return err({ code: 'dictation.timeout', reason: `The transcription endpoint did not answer in time (${url}).` });
        return err({ code: 'dictation.unreachable', reason: `The transcription endpoint could not be reached (${url}).` });
      }
      if (!response.ok) return err({ code: 'dictation.endpoint-refused', reason: response.status === 401 || response.status === 403 ? `The transcription endpoint refused the credential (HTTP ${response.status}). Check Settings › Models.` : `The transcription endpoint answered HTTP ${response.status} (${url}).` });
      let body: unknown;
      try { body = await response.json(); }
      catch { return err({ code: 'dictation.no-result', reason: 'The transcription endpoint answered something other than JSON.' }); }
      const text = typeof body === 'object' && body !== null ? (body as { text?: unknown }).text : undefined;
      return typeof text === 'string' ? ok(text.trim()) : err({ code: 'dictation.no-result', reason: 'The transcription endpoint answered without a transcript.' });
    },
  };
}
