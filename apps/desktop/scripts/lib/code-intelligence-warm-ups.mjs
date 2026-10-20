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
 *
 * Since PD-MCP-004 revision 2 (OQ-362) the module also checks the manifest's other PD-MCP-004 record, the project file the product
 * places for a rename no project file covers (`projectFileRefusals`, below).
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

/**
 * PD-MCP-004 revision 2 (OQ-362, ruled 2026-10-20 under R-072), clause 5's manifest bullet: the binding manifest's project files,
 * checked by the generator against what the pinned runtime answers. A project file is keyed by the capability whose calls it serves
 * (the EDIT tier's symbol rename) and names the runtime's language whose language server reads it (`language`), the names that count
 * as a project file of that server (`covering`) and the name the product writes (`written`). The generator asks the runtime which
 * file-name extensions it serves with that language — as it asks for the extensions it indexes — and records them beside the entry.
 *
 * In a workspace no `tsconfig.json` or `jsconfig.json` covers, the TypeScript language server holds the files open in it alone, the
 * pinned runtime opens the declaring file alone, and a rename stayed in that file after clause 2's search; the product places a
 * `jsconfig.json` of its own at the project root for the call
 * (docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
 *
 * The clause rests on the runtime's language names, so the check is as strict as the warm-up's: a capability that is no capability of
 * the tiers, a language the runtime does not name, or one it names with no extension refuses generation, and so does an entry that
 * names no covering file, writes a name that is not one of them, or carries a key the check does not know. Pure: the generator hands
 * it the tiers and the runtime's answer.
 *
 * @param {Record<string, { language: string, covering: readonly string[], written: string }>} projectFiles by capability
 * @param {Record<string, Record<string, string>>} tiers REQ-MCP-015's tiers, by capability, bound to the runtime's names
 * @param {Record<string, readonly string[] | null>} served by language, the extensions the runtime serves with it; null (or absent)
 *   where the runtime names no such language
 * @returns {string[]}
 */
export function projectFileRefusals(projectFiles, tiers, served) {
  const out = [];
  const isCapability = (capability) => Object.values(tiers).some((map) => Object.prototype.hasOwnProperty.call(map, capability));
  for (const [capability, entry] of Object.entries(projectFiles)) {
    for (const key of Object.keys(entry ?? {})) if (!['language', 'covering', 'written'].includes(key)) out.push(`project file of '${capability}' carries an unknown key '${key}' (PD-MCP-004 revision 2)`);
    if (!isCapability(capability)) out.push(`project file of '${capability}': the capability is no capability of the tiers (PD-MCP-004 revision 2)`);
    const language = entry?.language;
    const extensions = typeof language === 'string' && Object.prototype.hasOwnProperty.call(served, language) ? served[language] : null;
    if (!Array.isArray(extensions)) out.push(`project file of '${capability}': the runtime names no language '${language}' — an upstream rename? (PD-MCP-004 revision 2)`);
    else if (extensions.length === 0) out.push(`project file of '${capability}': the runtime's '${language}' language serves no file-name extension (PD-MCP-004 revision 2)`);
    const covering = Array.isArray(entry?.covering) ? entry.covering.filter((n) => typeof n === 'string' && n !== '') : [];
    if (covering.length === 0) out.push(`project file of '${capability}' names no file that counts as a project file (PD-MCP-004 revision 2)`);
    if (!covering.includes(entry?.written)) out.push(`project file of '${capability}': the name it writes, '${entry?.written}', is not one of the names that count as a project file (PD-MCP-004 revision 2)`);
  }
  return out;
}
