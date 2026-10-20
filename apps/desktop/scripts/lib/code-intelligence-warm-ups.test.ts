/**
 * PD-MCP-004 (OQ-273, ruled 2026-10-13 under R-072): the manifest generator refuses a warm-up the pinned runtime's listing
 * does not bear out — a tool it does not list, or an input schema lacking either shared argument — so an upstream rename fails
 * a build and never a rename. The names here are this test's own; the runtime's live in the manifest alone (REQ-MCP-116).
 */
import { describe, expect, it } from 'vitest';
import { projectFileRefusals, warmUpRefusals } from './code-intelligence-warm-ups.mjs';

const tiers = { read: { referencingSymbols: 'refs' }, edit: { renameSymbol: 'rename', replaceInFile: 'replace' } };
const warmUps = { renameSymbol: { tool: 'referencingSymbols', arguments: ['name_path', 'relative_path'] } };
const both = { properties: { name_path: { type: 'string' }, relative_path: { type: 'string' } } };

describe('the manifest generator\'s check of a warm-up (PD-MCP-004)', () => {
  it('holds when both tools are listed with both arguments', () => {
    expect(warmUpRefusals(warmUps, tiers, { names: ['refs', 'rename', 'replace'], schemas: { refs: both, rename: { properties: { ...both.properties, new_name: {} } } } })).toEqual([]);
  });

  it('refuses a warming tool whose schema lacks either argument, and a warmed tool whose schema does', () => {
    for (const missing of ['name_path', 'relative_path']) {
      const lacking = { properties: Object.fromEntries(Object.entries(both.properties).filter(([k]) => k !== missing)) };
      const search = warmUpRefusals(warmUps, tiers, { names: ['refs', 'rename'], schemas: { refs: lacking, rename: both } });
      expect(search).toEqual([`warm-up of 'renameSymbol': 'refs' (referencingSymbols) lists no '${missing}' argument — an upstream rename? (PD-MCP-004)`]);
      const rename = warmUpRefusals(warmUps, tiers, { names: ['refs', 'rename'], schemas: { refs: both, rename: lacking } });
      expect(rename).toEqual([`warm-up of 'renameSymbol': 'rename' (renameSymbol) lists no '${missing}' argument — an upstream rename? (PD-MCP-004)`]);
    }
  });

  it('refuses a tool the server does not list, and a capability the tiers do not hold', () => {
    expect(warmUpRefusals(warmUps, tiers, { names: ['rename'], schemas: { rename: both } })).toEqual([
      "warm-up of 'renameSymbol': 'refs' (referencingSymbols) is not reported by the runtime's tools/list — an upstream rename? (PD-MCP-004)",
    ]);
    expect(warmUpRefusals({ renameSymbol: { tool: 'nowhere', arguments: ['name_path'] } }, tiers, { names: ['refs', 'rename'], schemas: { refs: both, rename: both } })).toEqual([
      "warm-up of 'renameSymbol': the warming capability 'nowhere' is no capability of the tiers (PD-MCP-004)",
    ]);
  });

  it('refuses a warm-up naming no argument, or carrying a key it does not know', () => {
    const server = { names: ['refs', 'rename'], schemas: { refs: both, rename: both } };
    expect(warmUpRefusals({ renameSymbol: { tool: 'referencingSymbols', arguments: [] } }, tiers, server)).toEqual(["warm-up of 'renameSymbol' names no shared argument (PD-MCP-004)"]);
    expect(warmUpRefusals({ renameSymbol: { ...warmUps.renameSymbol, wait: true } as never }, tiers, server)).toEqual(["warm-up of 'renameSymbol' carries an unknown key 'wait' (PD-MCP-004)"]);
  });
});

/**
 * PD-MCP-004 revision 2 (OQ-362, ruled 2026-10-20 under R-072): the manifest records, by capability, the project file the product
 * places for a symbol rename no project file covers — the runtime's language, the extensions the runtime serves with it (read from
 * the runtime, as the indexed extensions are), the names that count as a project file and the one the product writes. The generator
 * refuses a capability of no tier, a language the runtime does not name and a language that serves no extension, so an upstream
 * rename fails a build and never a rename. The language and names here are this test's own.
 */
describe('the manifest generator\'s check of a project file (PD-MCP-004 revision 2)', () => {
  const projectFiles = { renameSymbol: { language: 'scripting', covering: ['a.json', 'b.json'], written: 'b.json' } };

  it('holds when the capability is a tier\'s and the runtime serves the language with at least one extension', () => {
    expect(projectFileRefusals(projectFiles, tiers, { scripting: ['.js', '.ts'] })).toEqual([]);
  });

  it('refuses a capability that is no capability of the tiers', () => {
    expect(projectFileRefusals({ renameEverything: projectFiles.renameSymbol }, tiers, { scripting: ['.js'] })).toEqual([
      "project file of 'renameEverything': the capability is no capability of the tiers (PD-MCP-004 revision 2)",
    ]);
  });

  it('refuses a language the runtime does not name, and one it names with no extension', () => {
    expect(projectFileRefusals(projectFiles, tiers, { scripting: null })).toEqual([
      "project file of 'renameSymbol': the runtime names no language 'scripting' — an upstream rename? (PD-MCP-004 revision 2)",
    ]);
    expect(projectFileRefusals(projectFiles, tiers, {})).toEqual([
      "project file of 'renameSymbol': the runtime names no language 'scripting' — an upstream rename? (PD-MCP-004 revision 2)",
    ]);
    expect(projectFileRefusals(projectFiles, tiers, { scripting: [] })).toEqual([
      "project file of 'renameSymbol': the runtime's 'scripting' language serves no file-name extension (PD-MCP-004 revision 2)",
    ]);
  });

  it('refuses an entry that names no covering file, writes a name that does not count as one, or carries a key it does not know', () => {
    const served = { scripting: ['.js'] };
    expect(projectFileRefusals({ renameSymbol: { ...projectFiles.renameSymbol, covering: [] } }, tiers, served)).toEqual([
      "project file of 'renameSymbol' names no file that counts as a project file (PD-MCP-004 revision 2)",
      "project file of 'renameSymbol': the name it writes, 'b.json', is not one of the names that count as a project file (PD-MCP-004 revision 2)",
    ]);
    expect(projectFileRefusals({ renameSymbol: { ...projectFiles.renameSymbol, written: 'c.json' } }, tiers, served)).toEqual([
      "project file of 'renameSymbol': the name it writes, 'c.json', is not one of the names that count as a project file (PD-MCP-004 revision 2)",
    ]);
    expect(projectFileRefusals({ renameSymbol: { ...projectFiles.renameSymbol, extensions: ['.js'] } as never }, tiers, served)).toEqual([
      "project file of 'renameSymbol' carries an unknown key 'extensions' (PD-MCP-004 revision 2)",
    ]);
  });
});
