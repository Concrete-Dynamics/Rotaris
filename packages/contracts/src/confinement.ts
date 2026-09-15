import { z } from 'zod';

/**
 * ADR-0022's availability verdict on the wire (REQ-SANDBOX-071): `available`, a backend name, one
 * sentence of reason and one of remediation, both empty when available. Those four fields are the
 * complete answer the confinement service gives, and every surface that reports availability
 * presents that same text — the settings label (REQ-SANDBOX-116), the launch dialog
 * (REQ-SANDBOX-119/120), the run-refusal record (REQ-SANDBOX-126) and the application log — so the
 * guidance a user sees never differs by surface.
 */
export const BACKEND_NAMES = ['seatbelt', 'bubblewrap', 'unavailable'] as const;
export type BackendNameValue = (typeof BACKEND_NAMES)[number];

export const ConfinementVerdictSchema = z.object({
  available: z.boolean(),
  backend: z.enum(BACKEND_NAMES),
  reason: z.string(),
  remediation: z.string(),
});
export type ConfinementVerdict = z.infer<typeof ConfinementVerdictSchema>;

/**
 * REQ-SANDBOX-130's plain disclosure, in the product's own words, for a host that can confine
 * NOTHING. One fact, the same on both surfaces that carry it — the settings runtime section and the
 * per-session launch dialog — and both carry it whatever `runtime.sandbox_mode` is set to, `off`
 * included, that being the shipped default and therefore the state nearly every such user is in.
 *
 * It is text and leans on neither colour nor a control's disabled appearance (REQ-SHELL-149). It
 * names what would change the answer, and it does NOT present the host as misconfigured or as
 * needing repair, because it is neither: this is a stated limit of the product on this platform,
 * and telling a user to fix something that is not broken teaches them to ignore the notice.
 */
export const NO_CONFINEMENT_DISCLOSURE = 'This host cannot confine anything: every command an agent runs executes with the same operating-system privileges as the account running Rotaris, reaching whatever that account can read and whatever it can write, and no value of the sandbox mode changes that here. That is a stated limit of the product on this platform, not a fault to fix; the answer changes only when the workspace runs on a host Rotaris can confine.';

/** REQ-SANDBOX-072: the reason, then the remediation on its own line; a generic line when neither exists. */
export function confinementMessage(verdict: ConfinementVerdict): string {
  if (verdict.reason === '') return 'No OS-level confinement can be used on this host.';
  return verdict.remediation === '' ? verdict.reason : `${verdict.reason}\n${verdict.remediation}`;
}

/**
 * REQ-TOOLS-085's grammar, as a message. The authoritative compiler lives in `@rotaris/agent-tools`
 * (`compileHostPattern`) because it also canonicalises through `node:net`, which the renderer has
 * no access to. What both sides must agree on is the RULE and the WORDING — REQ-SANDBOX-114 fixes
 * the control's problem message as "describing the wildcard restriction and showing the supported
 * form `*.example.com`" — so the sentence is defined once, here, and the compiler throws it.
 */
export function hostPatternProblem(pattern: string): string | null {
  const p = pattern.trim().toLowerCase();
  if (p === '') return null;
  const rest = p.startsWith('*.') ? p.slice(2) : p;
  if (!rest.includes('*') && rest !== '') return null;
  return `Host pattern '${pattern}' is not supported: the only wildcard form is a single leading '*.' as in '*.example.com'`;
}

/**
 * REQ-SANDBOX-050 / REQ-TOOLS-116: absoluteness is decided by SPELLING rather than by the host
 * performing the check, so `/opt/cache` and `C:\Builds\cache` are both accepted in the same file on
 * either platform and one configuration file serves a mixed fleet.
 */
export function writableRootProblem(entry: string, key = 'runtime.sandbox_writable_roots'): string | null {
  const trimmed = entry.trim();
  if (trimmed === '') return null;
  const absolute = trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\');
  return absolute ? null : `${key}: '${trimmed}' is not absolute; an absolute path is required.`;
}
