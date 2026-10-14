/**
 * PD-MCP-004 (OQ-273, ruled 2026-10-13 under R-072): the binding manifest's warm-ups, checked by the manifest generator
 * (`apps/desktop/scripts/code-intelligence/manifest.mjs`) against what the pinned runtime's server lists.
 *
 * A warm-up is keyed by the capability it warms (the EDIT tier's symbol rename) and names the capability whose tool the
 * product sends first (the READ tier's referencing-symbol search) and the arguments the two share, which the product copies
 * from the warmed call. The pinned runtime answers a rename before its language server has loaded the project, so the first
 * rename of a server session renamed the declaring file alone; the search waits for that loading
 * (docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
 *
 * The warm-up rests on the runtime's internals, so the check is strict: a capability that is no capability of the tiers, a
 * tool the server does not list, or an argument either tool's listed input schema lacks refuses generation, and an upstream
 * rename fails a build rather than a rename. Pure: the generator hands it the tiers and the server's listing.
 */

/**
 * The refusals for `warmUps`, or `[]` when every warm-up holds.
 *
 * @param {Record<string, { tool: string, arguments: readonly string[] }>} warmUps by warmed capability; `tool` is a capability too
 * @param {Record<string, Record<string, string>>} tiers REQ-MCP-015's tiers, by capability, bound to the runtime's names
 * @param {{ names: readonly string[], schemas: Record<string, { properties?: Record<string, unknown> }> }} server what `tools/list` answered
 * @returns {string[]}
 */
export function warmUpRefusals(warmUps, tiers, server) {
  const out = [];
  const nameOf = (capability) => {
    for (const map of Object.values(tiers)) if (Object.prototype.hasOwnProperty.call(map, capability)) return map[capability];
    return undefined;
  };
  for (const [warmed, warmUp] of Object.entries(warmUps)) {
    const keys = Object.keys(warmUp ?? {});
    for (const key of keys) if (key !== 'tool' && key !== 'arguments') out.push(`warm-up of '${warmed}' carries an unknown key '${key}' (PD-MCP-004)`);
    const pair = [['warmed', warmed, nameOf(warmed)], ['warming', warmUp?.tool, nameOf(warmUp?.tool)]];
    const args = Array.isArray(warmUp?.arguments) ? warmUp.arguments : [];
    if (args.length === 0) out.push(`warm-up of '${warmed}' names no shared argument (PD-MCP-004)`);
    for (const [role, capability, name] of pair) {
      if (name === undefined) { out.push(`warm-up of '${warmed}': the ${role} capability '${capability}' is no capability of the tiers (PD-MCP-004)`); continue; }
      if (!server.names.includes(name)) { out.push(`warm-up of '${warmed}': '${name}' (${capability}) is not reported by the runtime's tools/list — an upstream rename? (PD-MCP-004)`); continue; }
      const properties = server.schemas[name]?.properties ?? {};
      for (const arg of args) {
        if (!Object.prototype.hasOwnProperty.call(properties, arg)) out.push(`warm-up of '${warmed}': '${name}' (${capability}) lists no '${arg}' argument — an upstream rename? (PD-MCP-004)`);
      }
    }
  }
  return out;
}
