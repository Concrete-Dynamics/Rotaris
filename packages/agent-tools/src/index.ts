/**
 * @rotaris/agent-tools — everything that executes on the user's behalf, in
 * the run host and nowhere else (ADR-0002): the permission gate and the
 * approvals wait registry (ADR-0017, ADR-0019), the tool registry's
 * executors (ADR-0016), terminal sessions and the headless emulator
 * (ADR-0020, ADR-0021), confinement (ADR-0022), egress (ADR-0023), evidence
 * and audit (ADR-0024).
 *
 * Skeleton: the package exists so the dependency graph does. The first
 * mechanism to land here is the tool registry table, which is pure and
 * belongs in kernel; the executors follow the registry.
 */
export const AGENT_TOOLS_PACKAGE = '@rotaris/agent-tools' as const;
