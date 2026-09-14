import type { SlashCommand, SlashRegistry } from './types.js';

/**
 * REQ-CHAT-022 — registration semantics: registration order is preserved; names are lowercased on registration;
 * registering a name that already exists REPLACES the earlier command, in the position the earlier one held (the
 * order is the order names were first registered, which is what "preserved" is read to mean); lookup is
 * case-insensitive. Filter matching ranks name-prefix matches ahead of name-substring matches ahead of
 * description-substring matches, preserving registration order within each rank; an empty filter lists every command.
 */
export function createSlashRegistry(): SlashRegistry {
  const order: string[] = [];
  const byName = new Map<string, SlashCommand>();
  const normalise = (name: string): string => name.trim().replace(/^\//, '').toLowerCase();
  return {
    register(command) {
      const name = normalise(command.name);
      if (!byName.has(name)) order.push(name);
      byName.set(name, command.name === name ? command : { ...command, name });
    },
    /**
     * REQ-CHAT-034 (ADR-0063): "After a skill rescan, the catalogue MUST list exactly the rescanned set." A
     * registry that can only replace cannot meet that — a skill deleted from disk would keep its command —
     * so removal is here rather than in the registrar, and it is the only way a name leaves the catalogue.
     * Removing frees the name: a later registration takes the position a new registration takes, not the one
     * the removed command held, because the order is "the order names were FIRST registered" and this name
     * is no longer one of them.
     */
    unregister(name) {
      const key = normalise(name);
      if (!byName.delete(key)) return false;
      order.splice(order.indexOf(key), 1);
      return true;
    },
    lookup(name) {
      return byName.get(normalise(name));
    },
    list() {
      return order.map((name) => byName.get(name)!);
    },
    filter(text) {
      const needle = normalise(text);
      const all = order.map((name) => byName.get(name)!);
      if (needle === '') return all;
      const prefix: SlashCommand[] = [];
      const substring: SlashCommand[] = [];
      const description: SlashCommand[] = [];
      for (const command of all) {
        if (command.name.startsWith(needle)) prefix.push(command);
        else if (command.name.includes(needle)) substring.push(command);
        else if (command.description.toLowerCase().includes(needle)) description.push(command);
      }
      return [...prefix, ...substring, ...description];
    },
  };
}
