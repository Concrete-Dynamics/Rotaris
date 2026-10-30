import type { DictationConfigView } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { endpointTranscriber } from './endpoint.js';
import { scriptedTranscriber } from './scripted.js';
import type { Transcriber, TranscriptionRefusal } from './port.js';
import { whisperCliTranscriber } from './whisper-cli.js';

export interface SelectDeps {
  readonly env: NodeJS.ProcessEnv;
  /** OQ-458: the bearer a signed-in provider holds, or null. Called only for an endpoint that names one. */
  readonly bearerOf: (providerId: string) => string | null;
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
      const bearer = config.provider === null ? null : deps.bearerOf(config.provider);
      if (config.provider !== null && bearer === null) return err({ code: 'dictation.not-signed-in', reason: `Sign in to ${config.provider} to use it for dictation, or clear the provider in Settings › Models.` });
      return ok(endpointTranscriber({ baseUrl: config.base_url, model: config.model, bearer }));
    }
  }
}
