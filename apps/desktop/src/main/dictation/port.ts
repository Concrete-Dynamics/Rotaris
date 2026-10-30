import type { Result } from '@rotaris/kernel';

/**
 * The transcription port (OQ-455, OQ-457): audio in, text out. Main holds the child processes and the credentials (ADR-0030),
 * so it holds this; a test or the verification seam fills it without a microphone, a model or a network.
 */
export interface TranscriptionRequest {
  readonly audio: Uint8Array;
  /** What the renderer's recorder produced, such as `audio/webm;codecs=opus`. */
  readonly mimeType: string;
  /** A language tag the configuration names, or null for the model's own detection. */
  readonly language: string | null;
}

/** A refusal states what to do about it: the composer shows `reason` as it stands. */
export interface TranscriptionRefusal {
  readonly code: string;
  readonly reason: string;
}

export interface Transcriber {
  transcribe(request: TranscriptionRequest): Promise<Result<string, TranscriptionRefusal>>;
}

/** 5 minutes of recording (OQ-455) on a slow CPU: a transcription past this is cut and reported, never left running. */
export const TRANSCRIPTION_TIMEOUT_MS = 10 * 60_000;

/** What a recorder's type names, for the file a client hands on. A type this does not know is left to the decoder to sniff. */
export function audioExtension(mimeType: string): string {
  const type = mimeType.split(';')[0]?.trim().toLowerCase();
  switch (type) {
    case 'audio/webm': return 'webm';
    case 'audio/ogg': return 'ogg';
    case 'audio/mp4': return 'm4a';
    case 'audio/wav': return 'wav';
    default: return 'audio';
  }
}
