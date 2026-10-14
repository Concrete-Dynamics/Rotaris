/**
 * PD-MCP-004 (OQ-273, ruled 2026-10-13 under R-072): the manifest generator refuses a warm-up the pinned runtime's listing
 * does not bear out — a tool it does not list, or an input schema lacking either shared argument — so an upstream rename fails
 * a build and never a rename. The names here are this test's own; the runtime's live in the manifest alone (REQ-MCP-116).
 */
import { describe, expect, it } from 'vitest';
import { warmUpRefusals } from './code-intelligence-warm-ups.mjs';

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
