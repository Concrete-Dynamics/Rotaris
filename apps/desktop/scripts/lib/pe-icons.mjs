/**
 * Whether a Windows executable carries an icon, read from its own resources (O-4, first-release-plan.md §4.9) — the
 * evidence `pnpm package` gives that the installer, the packaged executable and the portable carry the owner's icon,
 * rather than "the file exists".
 *
 * Read from the public formats alone: the PE/COFF file's resource directory (Microsoft's PE format documentation, the
 * `.rsrc` section: a three-level tree of type, name and language whose leaves are data entries), the icon file's
 * ICONDIR (`reserved`, `type` 1, `count`, then 16-byte entries ending in the image's size and offset), and a resource
 * group's GRPICONDIR (the same header, 14-byte entries ending in the `RT_ICON` resource id in place of the offset).
 *
 * `iconCarried` compares bytes: every image of the `.ico` must be some `RT_ICON` resource of the executable byte for
 * byte, and one `RT_GROUP_ICON` group must list exactly those images. A tool that re-encoded an image would fail it,
 * which is the point — it proves the file carries THIS icon and not one like it.
 *
 * Plain ESM, loaded by `package.mjs` and the tests.
 */

const RT_ICON = 3;
const RT_GROUP_ICON = 14;

/** The images of an `.ico` file: `{ width, height, bitCount, data }` each, 0 in a dimension byte meaning 256. */
export function readIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an icon file (ICONDIR reserved 0, type 1)');
  const count = buf.readUInt16LE(4);
  const images = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + 16 * i;
    if (at + 16 > buf.length) throw new Error(`icon entry ${i} lies outside the file`);
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    if (offset + size > buf.length) throw new Error(`icon image ${i} lies outside the file`);
    images.push({ width: buf[at] || 256, height: buf[at + 1] || 256, bitCount: buf.readUInt16LE(at + 6), data: buf.subarray(offset, offset + size) });
  }
  return images;
}

/** The resource section of a PE file, located through the optional header's resource data directory (index 2). */
function resourceSection(buf) {
  if (buf.length < 64 || buf.toString('latin1', 0, 2) !== 'MZ') throw new Error('not a PE file (no MZ header)');
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('not a PE file (no PE signature)');
  const sections = buf.readUInt16LE(pe + 6);
  const optionalSize = buf.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const magic = buf.readUInt16LE(optional);
  const directories = optional + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : NaN);
  if (Number.isNaN(directories)) throw new Error(`an optional header of unknown magic 0x${magic.toString(16)}`);
  if (buf.readUInt32LE(optional + (magic === 0x20b ? 108 : 92)) < 3) return null;
  const rva = buf.readUInt32LE(directories + 16);
  if (rva === 0) return null;
  const table = optional + optionalSize;
  for (let i = 0; i < sections; i += 1) {
    const s = table + 40 * i;
    const virtualAddress = buf.readUInt32LE(s + 12);
    const rawSize = buf.readUInt32LE(s + 16);
    const rawPointer = buf.readUInt32LE(s + 20);
    const virtualSize = Math.max(buf.readUInt32LE(s + 8), rawSize);
    if (rva >= virtualAddress && rva < virtualAddress + virtualSize) {
      // Data entries name RVAs; this turns one into a file offset through the same section.
      const toOffset = (r) => {
        if (r < virtualAddress || r >= virtualAddress + rawSize) throw new Error(`resource data at RVA 0x${r.toString(16)} lies outside the resource section`);
        return rawPointer + (r - virtualAddress);
      };
      return { base: toOffset(rva), toOffset };
    }
  }
  throw new Error('the resource directory lies in no section');
}

function directoryEntries(buf, base, at) {
  const count = buf.readUInt16LE(base + at + 12) + buf.readUInt16LE(base + at + 14);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const e = base + at + 16 + 8 * i;
    const name = buf.readUInt32LE(e);
    const target = buf.readUInt32LE(e + 4);
    out.push({ id: name & 0x80000000 ? null : name, subdirectory: (target & 0x80000000) !== 0, offset: target & 0x7fffffff });
  }
  return out;
}

/** Every resource of one type: `{ id, data }` per name, the first language of each (icons carry one). */
function resourcesOfType(buf, section, type) {
  const found = [];
  for (const t of directoryEntries(buf, section.base, 0)) {
    if (t.id !== type || !t.subdirectory) continue;
    for (const n of directoryEntries(buf, section.base, t.offset)) {
      if (!n.subdirectory) continue;
      const [lang] = directoryEntries(buf, section.base, n.offset);
      if (!lang || lang.subdirectory) continue;
      const entry = section.base + lang.offset;
      const at = section.toOffset(buf.readUInt32LE(entry));
      found.push({ id: n.id, data: buf.subarray(at, at + buf.readUInt32LE(entry + 4)) });
    }
  }
  return found;
}

/** The icon groups of a PE file: `{ groups: [{ id, members: [{ width, height, bitCount, size, iconId }] }], icons: Map<id, Buffer> }`. */
export function peIcons(buf) {
  const section = resourceSection(buf);
  if (section === null) return { groups: [], icons: new Map() };
  const icons = new Map(resourcesOfType(buf, section, RT_ICON).map((r) => [r.id, r.data]));
  const groups = resourcesOfType(buf, section, RT_GROUP_ICON).map((r) => {
    const count = r.data.readUInt16LE(4);
    const members = [];
    for (let i = 0; i < count; i += 1) {
      const e = 6 + 14 * i;
      members.push({ width: r.data[e] || 256, height: r.data[e + 1] || 256, bitCount: r.data.readUInt16LE(e + 6), size: r.data.readUInt32LE(e + 8), iconId: r.data.readUInt16LE(e + 12) });
    }
    return { id: r.id, members };
  });
  return { groups, icons };
}

/**
 * Whether the executable carries the icon file's images, byte for byte, as one icon group. Answers
 * `{ carried, group, images: [{ width, height, bitCount, bytes, iconId | null }], why }`: `carried` only when one group's
 * members are exactly the icon's images (each found as an `RT_ICON` of identical bytes, none left over).
 */
export function iconCarried(exeBuf, icoBuf) {
  const images = readIco(icoBuf);
  const { groups, icons } = peIcons(exeBuf);
  const report = (group) => images.map((img) => {
    const member = group?.members.find((m) => icons.get(m.iconId)?.equals(img.data));
    return { width: img.width, height: img.height, bitCount: img.bitCount, bytes: img.data.length, iconId: member ? member.iconId : null };
  });
  for (const group of groups) {
    const matched = report(group);
    if (matched.every((m) => m.iconId !== null) && group.members.length === images.length) return { carried: true, group: group.id, images: matched, why: null };
  }
  const best = groups.map((g) => ({ g, n: report(g).filter((m) => m.iconId !== null).length })).sort((a, b) => b.n - a.n)[0];
  return {
    carried: false,
    group: best ? best.g.id : null,
    images: report(best?.g),
    why: groups.length === 0 ? 'the executable carries no icon group' : `no icon group holds exactly the icon's ${images.length} images byte for byte (best: group ${best.g.id}, ${best.n} of ${images.length}, ${best.g.members.length} members)`,
  };
}
