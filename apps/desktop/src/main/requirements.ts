import type { Actor, CommandOutcome, ProcessReply, RequirementsChanged, RequirementsCommandPayload, StandingDisclosure, WorkspaceServiceRequest } from '@rotaris/contracts';
import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { millis, type Millis } from '@rotaris/kernel';

/**
 * Part AK — main's relay for the `requirements.*` family (spec 08; ADR-0041), and the ONE place an `Actor` is
 * constructed.
 *
 * REQ-CONFIG-198 fixes who counts as a person: "an action arriving through an interactive surface in direct answer
 * to a prompt the product raised for that specific action, with that surface attached to a window", named by "the
 * operating-system account the interactive session was running under". A renderer never sends an actor — the
 * command schema has no field for one — and this relay stamps it from where the command ARRIVED: a window's
 * webContents is a person under the account main runs as; anything else is the system. The workspace named in the
 * command is replaced with the one this instance has open, so a renderer cannot act on another workspace's board
 * (the discipline `composer.readDraft` takes for the draft).
 *
 * Persist before publish (ADR-0041): channel 10 is broadcast only from a reply that carries `changed`, which the
 * service sets after its transaction committed. Nothing here publishes ahead of the store.
 */
export type CommandOrigin = { readonly kind: 'window'; readonly webContentsId: number } | { readonly kind: 'other'; readonly what: string };

export interface RequirementsRelayDeps {
  /** The workspace this instance has open, canonical, or undefined. */
  readonly currentWorkspace: () => string | undefined;
  /** Waits, bounded, for an open in flight (the window paints before the workspace opens — the ADR-0055 note). */
  readonly awaitWorkspace: () => Promise<unknown>;
  /** Sends to the workspace service of `workspaceRoot`; undefined when none is running. */
  readonly request: (workspaceRoot: string, req: WorkspaceServiceRequest, bound: Millis) => Promise<ProcessReply> | undefined;
  /** REQ-TRACE-472: main's standing disclosure (the coordinator's `standingDisclosure`), stamped beside the actor so the queue the service publishes reads what its claim reads (REQ-TRACE-478). */
  readonly disclosure: () => StandingDisclosure;
  /** REQ-CONFIG-198: the operating-system account the interactive session runs under. */
  readonly person: () => string;
  /** Channel 10 to every live window. */
  readonly broadcast: (payload: RequirementsChanged & { readonly v: typeof CONTRACT_SCHEMA_VERSION }) => void;
  readonly log: (message: string) => void;
}

/** The bounds: a board read may run the engine's three passes (REQ-TRACE-501/088 budget them at seconds); everything else is a store read or one transaction. */
const BOUND_BOARD = millis(120_000);
const BOUND_OTHER = millis(30_000);

export function actorFor(origin: CommandOrigin, person: () => string): Actor {
  return origin.kind === 'window' ? { kind: 'user', person: person() } : { kind: 'system' };
}

export function createRequirementsRelay(deps: RequirementsRelayDeps): { handle(command: RequirementsCommandPayload, origin: CommandOrigin): Promise<CommandOutcome> } {
  return {
    async handle(command, origin) {
      await deps.awaitWorkspace();
      const root = deps.currentWorkspace();
      if (root === undefined) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its requirements' };
      const actor = actorFor(origin, deps.person);
      const bound = command.name === 'requirements.board' || command.name === 'requirements.refresh' ? BOUND_BOARD : BOUND_OTHER;
      const pending = deps.request(root, { kind: 'requirements.command', workspaceRoot: root, command: { ...command, workspace: root }, actor, disclosure: deps.disclosure() }, bound);
      if (pending === undefined) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      let r: ProcessReply;
      try { r = await pending; } catch (e) { return { ok: false, code: 'requirements.ask', headline: 'The requirements board could not be read', detail: e instanceof Error ? e.message : String(e) }; }
      if (r.kind !== 'requirements.result') {
        const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
        return { ok: false, code: r.kind === 'refused' ? r.code : 'reply.unexpected', headline: 'The requirements board could not be read', detail };
      }
      if (r.changed !== undefined) {
        deps.broadcast({ v: CONTRACT_SCHEMA_VERSION, workspace: root, generation: r.changed.generation, affected: r.changed.affected });
        deps.log(`requirements: generation ${r.changed.generation} (${r.changed.affected === null ? 'whole board' : r.changed.affected.join(', ')}) after ${command.name} by ${actor.kind === 'user' ? `user ${actor.person}` : 'system'}`);
      }
      return { ok: true, value: r.value };
    },
  };
}
