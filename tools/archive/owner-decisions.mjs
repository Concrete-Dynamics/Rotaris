// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091): its types are owed, and the list only shrinks.
// The archive's second kind (R-092; `docs/README.md`, "The archive"; `docs/architecture/hardening.md` §6 row 3): a
// ruled escalation (ESC-n), structural ruling (SR-n) or gate decision (GD-n) of the owner-decisions register whose
// ruling the specification has absorbed is history, and it moves whole from its live part to the part's mirror under
// `docs/archive/architecture/owner-decisions/`, leaving one index line where it stood.
//
// What qualifies, as code (`qualifies`), and why each half:
//
//   ruled    the entry, its struck text read away, says it was decided or ruled (`**Decided`, `Ruled`, `RULED`,
//            `Decided:`), or it stands under a section heading that says so ("… — ruled 2026-08-31", "… — CLOSED"),
//            and nothing in it says it is still the owner's to rule ("open — the owner's to rule", "not yet ruled").
//   landed   for every identifier its heading names, the specification (`docs/spec/**`) carries the ruling: a
//            sentence there names the identifier and is not one that says the ruling is unmade or open ("still
//            unmade", "never applied", "raises"); or the entry's ruling is a directive (`PD-…`) whose identifier the
//            specification names, which is how a directive's back-pointer lands (`docs/product/README.md`). The
//            specification's own back-pointers are the evidence, rather than the entry's words, because the
//            register's entries were written when ruled and rarely say when the amendment round made them; the
//            specification's rounds name every ruling they applied (`docs/spec/README.md`).
//
// A ruling the specification has not absorbed stays live: a gate decision about the process (GD-6's bounded
// authorization, GD-8's spikes, GD-10's first-execution rule) is cited by no requirement and stays where agents read
// it. Entries under other headings (an OQ ruled in the register, "Sources", "Consequences to carry") are not this
// kind's and stay.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CONTINUED, archiveOrder, archivePathOf, partsOf } from '../record-parts.mjs';
import { dateIn, hasId, rebase, relativeLink, slashed, within } from './text.mjs';

/** The register this kind archives, relative to the repository root. */
export const OWNER_DECISIONS = 'docs/architecture/owner-decisions.md';

/**
 * The identifiers a heading or a sentence names, ranges expanded: `ESC-22, ESC-24 and ESC-27 to ESC-31` names seven.
 * @param {string} text
 * @returns {string[]}
 */
export function idsIn(text) {
  /** @type {string[]} */
  const out = [];
  const flat = text.replace(/\s+/g, ' ');
  for (const m of flat.matchAll(/\b(ESC|SR|GD)-(\d+)(?: (?:to|–|—) (?:\1-)?(\d+)\b)?/g)) {
    const from = Number(m[2]);
    const to = m[3] === undefined ? from : Number(m[3]);
    for (let n = from; n <= Math.max(from, Math.min(to, from + 60)); n++) out.push(`${m[1]}-${n}`);
  }
  return [...new Set(out)];
}

/** The identifiers an entry's heading names: those written before its first ` — `. */
export function headingIds(/** @type {string} */ heading) {
  const head = heading.replace(/^#+\s*/, '');
  const cut = head.indexOf(' — ');
  const ids = cut < 0 ? '' : head.slice(0, cut);
  return /^(?:ESC|SR|GD)-\d+/.test(ids) ? idsIn(ids) : [];
}

/**
 * The entries of one part of the register: each `### ` heading that names identifiers of this kind, from the
 * anchors right above it to the line before the next heading of level three or above or a `---` rule, its trailing
 * blank lines left out; with the `## ` section it stands under.
 * @param {string} text
 * @returns {{ ids: string[], heading: string, section: string, anchor: number, start: number, end: number, body: string }[]}
 */
export function entriesOf(text) {
  const lines = text.split('\n');
  /** @type {ReturnType<typeof entriesOf>} */
  const out = [];
  let section = '';
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {0,3}(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    if (/^## /.test(line)) section = line.slice(3);
    if (!/^### /.test(line)) continue;
    const ids = headingIds(line);
    if (ids.length === 0) continue;
    let anchor = i;
    for (let k = i - 1; k >= 0; k--) {
      if (lines[k].trim() === '') continue;
      if (/^<a (?:id|name)="[^"]+"><\/a>\s*$/.test(lines[k])) anchor = k;
      else break;
    }
    let end = i + 1;
    while (end < lines.length && !/^#{1,3} /.test(lines[end]) && !/^---\s*$/.test(lines[end])) end++;
    while (end > i + 1 && lines[end - 1].trim() === '') end--;
    out.push({ ids, heading: line.slice(4), section, anchor, start: i, end, body: lines.slice(i, end).join('\n') });
  }
  return out;
}

/** The text with struck passages read away: what an entry says now. */
const unstruck = (/** @type {string} */ text) => text.replace(/~~[\s\S]*?~~/g, '');

const RULED = /\*\*(?:Decided|Ruled|RULED)\b|\bRULED\b|\bDecided:|\bRuled 20\d\d-\d\d-\d\d/;
const SECTION_RULED = /\bruled\b|\bCLOSED\b/i;
const NOT_RULED = /\bopen — the owner's to rule\b|\bnot yet ruled\b|\bNot ruled here\b|\bthe owner's to rule\b/i;

/** Whether an entry is ruled (see the header). */
export function isRuled(/** @type {{ heading: string, section: string, body: string }} */ entry) {
  const text = unstruck(entry.body);
  if (NOT_RULED.test(text)) return false;
  return RULED.test(text) || /\bruled\b/i.test(entry.heading) || SECTION_RULED.test(entry.section);
}

/** A sentence of the specification that names a ruling without carrying it. */
const UNMADE = /\b(?:still unmade|not yet (?:made|applied|ruled)|(?:is|was|were|are) never (?:made|applied)|raises|is open|stays open|awaits)\b/i;
/**
 * The words with which the specification says it carries a ruling: a round applied it, a requirement was amended
 * under it or gained a clause by it, the round's sweep checked it against the corpus, or nothing was owed.
 */
const LANDING = /\b(?:applied|apply|amended|amendment|withdrew|withdrawn|nothing is owed|discharged|closes|closed|adds|added|swept|follow-through|under)\b/i;

/**
 * What the specification carries: each identifier of this kind a sentence of it names, with that sentence (the first
 * one, as the evidence a dry run prints), and every directive identifier it names.
 * @param {string} root
 * @returns {{ rulings: Map<string, string>, directives: Set<string> }}
 */
export function specificationCarries(root) {
  /** @type {Map<string, string>} */
  const rulings = new Map();
  /** @type {Set<string>} */
  const directives = new Set();
  const walk = (/** @type {string} */ dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.md')) {
        const text = readFileSync(full, 'utf8');
        for (const m of text.matchAll(/\bPD-[A-Z]+-\d+\b/g)) directives.add(m[0]);
        const paragraphs = text.replace(/^[ \t]*(?:>[ \t]?)+/gm, '').split(/\n[ \t]*\n|\n(?=#{1,6} )|(?<=^#{1,6} [^\n]*)\n/m);
        const sentences = paragraphs.flatMap((p) => p.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/));
        for (const sentence of sentences) {
          const said = unstruck(sentence);
          if (!/\b(?:ESC|SR|GD)-\d/.test(said) || UNMADE.test(said) || !LANDING.test(said)) continue;
          for (const id of idsIn(said)) if (!rulings.has(id)) rulings.set(id, `${slashed(root, full)}: ${sentence.slice(0, 200)}`);
        }
      }
    }
  };
  walk(join(root, 'docs', 'spec'));
  // A withdrawn or superseded requirement's text archived by `spec.mjs` is still the specification's, verbatim.
  const archived = join(root, 'docs', 'archive', 'spec');
  if (existsSync(archived)) walk(archived);
  return { rulings, directives };
}

/**
 * Whether an entry's ruling has landed (see the header), with the evidence for each identifier.
 * @param {{ ids: string[], body: string }} entry
 * @param {ReturnType<typeof specificationCarries>} spec
 * @returns {{ landed: boolean, evidence: string[] }}
 */
export function hasLanded(entry, spec) {
  const named = [...unstruck(entry.body).matchAll(/\bPD-[A-Z]+-\d+\b/g)].map((m) => m[0]).filter((d) => spec.directives.has(d));
  /** @type {string[]} */
  const evidence = [];
  for (const id of entry.ids) {
    const seen = spec.rulings.get(id);
    if (seen !== undefined) evidence.push(`${id}: ${seen}`);
    else if (named.length > 0) evidence.push(`${id}: its ruling is ${named.join(', ')}, which the specification names`);
    else return { landed: false, evidence: [`${id}: no sentence of docs/spec/ carries it`] };
  }
  return { landed: true, evidence };
}

/** Whether an entry qualifies: ruled, and landed. */
export function qualifies(/** @type {ReturnType<typeof entriesOf>[number]} */ entry, /** @type {ReturnType<typeof specificationCarries>} */ spec) {
  return isRuled(entry) && hasLanded(entry, spec).landed;
}

// ---------------------------------------------------------------- the index line

/** The index line a moved entry leaves: `- ESC-1 — <title>; ruled <date>; [archived](…#esc-1)`. */
export const INDEX_LINE = /^- (?:ESC|SR|GD)-\d+.* — .*\[archived\]\([^)\s]*#[a-z0-9-]+\)\s*$/;

/** The title an index line gives an entry: its heading after the identifiers, markup dropped, at most about 140 characters. */
export function titleOf(/** @type {string} */ heading) {
  const cut = heading.indexOf(' — ');
  let title = (cut < 0 ? heading : heading.slice(cut + 3))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/~~|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (title.length > 140) {
    const head = title.slice(0, 140);
    title = `${head.slice(0, Math.max(head.lastIndexOf(' '), 60))} …`;
  }
  if (((title.match(/`/g) ?? []).length % 2) === 1) title = title.replace(/`/g, '');
  return title;
}

/**
 * The index line a moved entry leaves. A title that only says the entry was ruled ("ruled 2026-09-02", "…, ruled") gives
 * up that clause to the state, which says it once.
 * @param {string} label the identifiers, as the heading writes them
 * @param {string} title
 * @param {string | undefined} date
 * @param {string} link
 */
export function indexLine(label, title, date, link) {
  const own = title.replace(/(?:^|,\s*|\s+—\s+)ruled(?:\s+20\d\d-\d\d-\d\d)?$/i, '').trim();
  return `- ${label} — ${own === '' ? '' : `${own}; `}ruled${date ? ` ${date}` : ''}; [archived](${link})`;
}

/**
 * When an entry says it was ruled: the date its heading gives ("… — ruled 2026-09-02"), else the first date within 200
 * characters of its ruling words, else its section's.
 */
export function ruledOn(/** @type {{ heading: string, section: string, body: string }} */ entry) {
  const head = /\bruled (20\d\d-\d\d-\d\d)/i.exec(entry.heading)?.[1];
  if (head !== undefined) return head;
  const text = unstruck(entry.body);
  const m = RULED.exec(text);
  return (m ? dateIn(text.slice(m.index, m.index + 200)) : undefined) ?? dateIn(entry.section);
}

// ---------------------------------------------------------------- the archive files

/** The archive's files for a live part, in order: the part's own name, then its continuations. */
function chainOf(/** @type {string} */ livePart, /** @type {import('./text.mjs').Tree} */ tree) {
  const mirror = /** @type {string} */ (archivePathOf(livePart));
  const base = basename(mirror);
  return tree
    .list(dirname(mirror))
    .filter((name) => name === base || CONTINUED.exec(name)?.[1] + '.md' === base)
    .sort(archiveOrder)
    .map((name) => join(dirname(mirror), name));
}

/** The opening of an archive file of this kind. */
export function archiveHeader(/** @type {string} */ livePart, /** @type {string} */ liveText, /** @type {string} */ file, /** @type {string} */ index, /** @type {number} */ k) {
  const h1 = /^# (.*)$/m.exec(liveText)?.[1] ?? basename(livePart, '.md');
  const lead = 'Product-owner decisions on the architecture record — ';
  const title = `Archived owner decisions — ${h1.startsWith(lead) ? h1.slice(lead.length) : h1}`;
  const number = /^(\d+)-/.exec(basename(livePart))?.[1] ?? basename(livePart, '.md');
  const readme = join(dirname(dirname(index)), 'README.md');
  const first = join(dirname(file), basename(/** @type {string} */ (archivePathOf(livePart))));
  return [
    `# ${title}${k > 1 ? `, continued (${k})` : ''}`,
    '',
    `The ruled escalations, structural rulings and gate decisions of [part ${number}](${relativeLink(file, livePart)}) of ` +
      `[the owner decisions](${relativeLink(file, index)}) whose ruling the specification carries, each moved here whole, ` +
      'under its own anchor, by `pnpm archive:migrate` (`tools/archive/owner-decisions.mjs`); the part keeps one index ' +
      `line for each. Only the script writes here ([the archive](${relativeLink(file, readme)}#the-archive)).` +
      (k > 1 ? ` Continues [the first file](${relativeLink(file, first)}).` : ''),
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- the run

/**
 * The entries of the live register that qualify, with the part each stands in and the evidence that it landed.
 * @param {string} root
 */
export function qualifying(root) {
  const index = join(root, ...OWNER_DECISIONS.split('/'));
  const spec = specificationCarries(root);
  return partsOf(index).flatMap((part) =>
    entriesOf(readFileSync(part, 'utf8'))
      .filter((e) => qualifies(e, spec))
      .map((e) => ({ ids: e.ids, part: slashed(root, part), evidence: hasLanded(e, spec).evidence })),
  );
}

/**
 * Move every qualifying entry of the register into the tree; returns what moved.
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 * @param {{ lines: number, bytes: number }} budget
 * @returns {{ kind: 'owner-decision', id: string, from: string, to: string }[]}
 */
export function planOwnerDecisions(root, tree, budget) {
  const index = join(root, ...OWNER_DECISIONS.split('/'));
  const parts = partsOf(index);
  if (parts.length === 0) return [];
  const spec = specificationCarries(root);
  /** @type {ReturnType<typeof planOwnerDecisions>} */
  const moves = [];
  for (const part of parts) {
    const text = tree.read(part);
    const lines = text.split('\n');
    const moving = entriesOf(text).filter((e) => qualifies(e, spec));
    if (moving.length === 0) continue;
    /** @type {Map<number, { end: number, line: string }>} */
    const replaced = new Map();
    for (const e of moving) {
      const chain = chainOf(part, tree);
      const first = /** @type {string} */ (archivePathOf(part));
      let file = chain.at(-1) ?? first;
      let current = tree.exists(file) ? tree.read(file) : archiveHeader(part, text, file, index, 1);
      const own = lines.slice(e.anchor, e.end).join('\n');
      /** The anchor the entry is reached by in `intoText`: its own, else its first identifier's, made unique there. */
      const anchorIn = (/** @type {string} */ intoText) => {
        const base = e.ids[0].toLowerCase();
        if (hasId(own, base)) return base;
        let k = 1;
        while (hasId(intoText, k === 1 ? base : `${base}-${k}`)) k++;
        return k === 1 ? base : `${base}-${k}`;
      };
      const block = (/** @type {string} */ into, /** @type {string} */ intoText) => {
        const moved = rebase(own, part, into, tree);
        const id = anchorIn(intoText);
        return hasId(moved, id) ? moved : `<a id="${id}"></a>\n\n${moved}`;
      };
      const append = (/** @type {string} */ into, /** @type {string} */ b) => `${into.replace(/\s*$/, '')}\n\n${b}\n`;
      let next = append(current, block(file, current));
      if (!within(next, budget) && current.includes('\n### ')) {
        file = join(dirname(first), basename(first, '.md') + `-continued-${chain.length + 1}.md`);
        current = archiveHeader(part, text, file, index, chain.length + 1);
        next = append(current, block(file, current));
      }
      if (!within(next, budget)) {
        throw new Error(`${slashed(root, part)}: ${e.ids.join(', ')} alone passes the document budget in ${slashed(root, file)}; ` +
          'the entry is not cut in two, so split it by hand and record the debt (docs/README.md, "The document budget")');
      }
      tree.write(file, next);
      const label = e.heading.slice(0, Math.max(0, e.heading.indexOf(' — '))).trim();
      moves.push({ kind: 'owner-decision', id: label, from: slashed(root, part), to: slashed(root, file) });
      const date = ruledOn(e);
      const link = `${relativeLink(part, file)}#${anchorIn(current)}`;
      replaced.set(e.anchor, { end: e.end, line: indexLine(label, titleOf(e.heading), date, link) });
    }
    /** @type {string[]} */
    let out = [];
    for (let i = 0; i < lines.length; i++) {
      const r = replaced.get(i);
      if (r) {
        out.push(r.line);
        i = r.end - 1;
      } else out.push(lines[i]);
    }
    out = tighten(out);
    out = withArchived(out, part);
    tree.write(part, out.join('\n'));
    archivedRow(index, part, out, tree);
  }
  return moves;
}

/** Index lines that follow one another stand as one list. */
function tighten(/** @type {string[]} */ lines) {
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    if (INDEX_LINE.test(line)) {
      let k = out.length;
      while (k > 0 && out[k - 1].trim() === '') k--;
      if (k > 0 && k < out.length && INDEX_LINE.test(out[k - 1])) out.length = k;
    }
    out.push(line);
  }
  return out;
}

/** The identifiers a part's index lines name, in order. */
function archivedIn(/** @type {string[]} */ lines) {
  return lines.filter((l) => INDEX_LINE.test(l)).map((l) => /^- (.*?) — /.exec(l)?.[1] ?? '');
}

/** The part's opening sentence, "… which indexes every part.", followed by what is archived. */
function withArchived(/** @type {string[]} */ lines, /** @type {string} */ part) {
  const archived = archivedIn(lines);
  const marker = 'which indexes every part.';
  const at = lines.findIndex((l, i) => i < 10 && l.includes(marker));
  if (at < 0 || archived.length === 0) return lines;
  const link = relativeLink(part, /** @type {string} */ (archivePathOf(part)));
  const next = [...lines];
  next[at] = `${lines[at].slice(0, lines[at].indexOf(marker) + marker.length)} Archived in [the archive](${link}), one index line each here: ${archived.join('; ')}.`;
  return next;
}

/** The part's row in the register's index, its last cell followed by what is archived. */
function archivedRow(/** @type {string} */ index, /** @type {string} */ part, /** @type {string[]} */ lines, /** @type {import('./text.mjs').Tree} */ tree) {
  const archived = archivedIn(lines);
  if (archived.length === 0) return;
  const target = relativeLink(index, part);
  const rows = tree.read(index).split('\n');
  const at = rows.findIndex((r) => r.startsWith('| ') && r.includes(`](${target})`));
  if (at < 0) return;
  const link = relativeLink(index, /** @type {string} */ (archivePathOf(part)));
  const row = rows[at].replace(/ — archived in \[the archive\]\([^)]*\): .*? \|\s*$/, ' |');
  rows[at] = row.replace(/ \|\s*$/, ` — archived in [the archive](${link}): ${archived.join('; ')} |`);
  tree.write(index, rows.join('\n'));
}
