const { readFileSync } = require('node:fs');
const { inflateSync } = require('node:zlib');

function decodePng(file) {
  const bytes = readFileSync(file);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`${file}: invalid PNG signature`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  const chunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colourType = data[9]; }
    if (type === 'IDAT') chunks.push(data);
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || (colourType !== 6 && colourType !== 2)) throw new Error(`${file}: unsupported PNG depth/type ${bitDepth}/${colourType}`);
  const channels = colourType === 6 ? 4 : 3;
  const packed = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let source = 0;
  let previous = Buffer.alloc(stride);
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) {
    const filter = packed[source++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[source++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      row[x] = (raw + (filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upLeft))) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = row[from]; pixels[to + 1] = row[from + 1]; pixels[to + 2] = row[from + 2]; pixels[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    previous = row;
  }
  return { width, height, pixels };
}

const at = (png, x, y) => {
  const px = Math.max(0, Math.min(png.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(png.height - 1, Math.round(y)));
  const offset = (py * png.width + px) * 4;
  return [png.pixels[offset], png.pixels[offset + 1], png.pixels[offset + 2], png.pixels[offset + 3]];
};
const key = (colour) => `${colour[0]},${colour[1]},${colour[2]},${colour[3]}`;
const distance = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const linear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (c) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function modalInside(png, rect, dpr) {
  const counts = new Map();
  const left = Math.max(0, Math.floor(rect.x * dpr));
  const top = Math.max(0, Math.floor(rect.y * dpr));
  const right = Math.min(png.width - 1, Math.ceil((rect.x + rect.width) * dpr));
  const bottom = Math.min(png.height - 1, Math.ceil((rect.y + rect.height) * dpr));
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    const colour = at(png, x, y);
    const k = key(colour);
    const entry = counts.get(k) ?? { colour, count: 0 };
    entry.count += 1;
    counts.set(k, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.colour ?? [0, 0, 0, 255];
}

function textContrast(png, text, dpr) {
  const background = modalInside(png, text.rect, dpr);
  let foreground = background;
  let farthest = 0;
  const left = Math.max(0, Math.floor(text.rect.x * dpr));
  const top = Math.max(0, Math.floor(text.rect.y * dpr));
  const right = Math.min(png.width - 1, Math.ceil((text.rect.x + text.rect.width) * dpr));
  const bottom = Math.min(png.height - 1, Math.ceil((text.rect.y + text.rect.height) * dpr));
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    const candidate = at(png, x, y);
    const d = distance(candidate, background);
    if (d > farthest) { farthest = d; foreground = candidate; }
  }
  return { ratio: ratio(foreground, background), foreground, background };
}

function focusContrast(png, control, dpr, width = 2) {
  const rect = control.rect;
  const left = Math.max(0, Math.floor(rect.x * dpr));
  const top = Math.max(0, Math.floor(rect.y * dpr));
  const right = Math.min(png.width - 1, Math.ceil((rect.x + rect.width) * dpr));
  const bottom = Math.min(png.height - 1, Math.ceil((rect.y + rect.height) * dpr));
  const band = Math.max(1, Math.round(width * dpr));
  const inner = at(png, left + band + 1, top + band + 1);
  let best = 1;
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    if (x - left > band && right - x > band && y - top > band && bottom - y > band) continue;
    best = Math.max(best, ratio(at(png, x, y), inner));
  }
  return best;
}

module.exports = { decodePng, textContrast, focusContrast, ratio, at, modalInside };
