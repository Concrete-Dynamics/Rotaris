import type { DictationConfigView } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { endpointTranscriber } from './endpoint.js';
import { scriptedTranscriber } from './scripted.js';
import type { Transcriber, TranscriptionRefusal } from './port.js';
import { whisperCliTranscriber } from './whisper-cli.js';

export interface SelectDeps {
  readonly env: NodeJS.ProcessEnv;
  /** PD-CONFIG-010: the stored bearer, or null. Read at each press, like the configuration, and never carried in the file. */
  readonly bearer: string | null;
  /** The verification seam's text (`commands/dictation.ts`), which a packaged build cannot be handed. */
  readonly scripted?: string | undefined;
}

/** The client the saved configuration names, chosen at each press (OQ-457). */
export function transcriberFor(config: DictationConfigView, deps: SelectDeps): Result<Transcriber, TranscriptionRefusal> {
  if (deps.scripted !== undefined) return ok(scriptedTranscriber(deps.scripted));
  switch (config.backend) {
    case 'off':
      return err({ code: 'dictation.off', reason: 'Choose a dictation model in Settings › Models.' });
    case 'local':
      return ok(whisperCliTranscriber(config.local_model, { env: deps.env }));
    case 'endpoint': {
      if (config.base_url === null || config.model === null) return err({ code: 'dictation.endpoint-incomplete', reason: 'Dictation by endpoint needs both a base URL and a model. Set them in Settings › Models.' });
      return ok(endpointTranscriber({ baseUrl: config.base_url, model: config.model, bearer: deps.bearer }));
    }
  }
}
