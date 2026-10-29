import type { AdoptionOutcome, AdoptionView, DetectionResult, ProcessReply, ServiceAsk } from '@rotaris/contracts';
import { ADOPTION_DETECTION_MAX } from '@rotaris/contracts';
import { millis, toIsoUtc, type Clocks, type Millis } from '@rotaris/kernel';
import { adopt, compareAdoption, type Interpretation } from '@rotaris/workspace';

/**
 * Domain 22 (PD-TRACE-001) — the adoption assistant's home in the workspace service, the one I/O owner
 * (REQ-ADOPT-028). `requirements.adoption` is the comparison on opening: a read that writes nothing, consults no model
 * and moves no generation (REQ-ADOPT-022). `requirements.adopt` is the strip's button: the run asks main for the
 * interpretation — main forwards it to the run host, where the model resolves — and validates, executes and writes
 * here (REQ-ADOPT-013 to REQ-ADOPT-021). Neither moves the board's generation: the board reads the identifier blocks of
 * REQ-TRACE-008, which the assistant never writes (REQ-ADOPT-029).
 */
/** REQ-ADOPT-027's 180 s, and the margin main's forward and the host's configuration take. */
export const INTERPRET_ASK_BOUND: Millis = millis(200_000);

export function adoptionView(workspaceRoot: string): AdoptionView {
  return compareAdoption(workspaceRoot);
}

export function interpretVia(ask: (request: ServiceAsk, bound: Millis) => Promise<ProcessReply>, workspaceRoot: string): (detection: DetectionResult) => Promise<Interpretation> {
  return async (detection) => {
    let json = JSON.stringify(detection);
    // The channel's bound (ADOPTION_DETECTION_MAX): samples go first, the counts and reasons stay.
    if (json.length > ADOPTION_DETECTION_MAX) json = JSON.stringify({ ...detection, annotations: detection.annotations.map((a) => ({ ...a, samples: [] })), candidates: detection.candidates.map((c) => ({ ...c, samples: c.samples.slice(0, 1) })) });
    if (json.length > ADOPTION_DETECTION_MAX) return { ok: false, reason: 'the detection result is too large to send for interpretation' };
    let reply: ProcessReply;
    try { reply = await ask({ kind: 'adoption.interpret', workspaceRoot, detection: json }, INTERPRET_ASK_BOUND); } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    if (reply.kind === 'adoption.interpreted') return { ok: true, text: reply.text };
    if (reply.kind === 'refused') return { ok: false, reason: [reply.headline, reply.detail].filter(Boolean).join(': ') };
    return { ok: false, reason: `unexpected reply ${reply.kind}` };
  };
}

export async function adoptionRun(workspaceRoot: string, mode: 'run' | 'record', writeLayout: boolean, ask: (request: ServiceAsk, bound: Millis) => Promise<ProcessReply>, clocks: Clocks, log: (message: string, level?: 'info' | 'warn') => void): Promise<AdoptionOutcome> {
  return adopt(workspaceRoot, { mode, writeLayout }, { interpret: interpretVia(ask, workspaceRoot), now: () => toIsoUtc(clocks.wall.instant()), log: (m) => log(m) });
}
