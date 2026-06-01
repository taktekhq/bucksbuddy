// Generates simple BucksBuddy app icons (carrot-orange rounded square with a
// white "$"). No external deps — hand-rolls a PNG via zlib. Re-run with:
//   node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../public/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [0xff, 0x7a, 0x00]; // carrot
const FG = [0xff, 0xff, 0xff]; // white

// 5x7 bitmap font for "$" rendered as a thick glyph via simple rects instead.
function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : Math.floor(size * 0.22);
  // safe zone inset for maskable so the glyph isn't clipped by the mask
  const pad = maskable ? Math.floor(size * 0.32) : Math.floor(size * 0.26);

  const inRounded = (x, y) => {
    if (radius === 0) return true;
    const minX = radius,
      maxX = size - radius,
      minY = radius,
      maxY = size - radius;
    if (x >= minX && x <= maxX) return true;
    if (y >= minY && y <= maxY) return true;
    const cx = x < minX ? minX : maxX;
    const cy = y < minY ? minY : maxY;
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };

  // "$" geometry: a vertical bar + two horizontal-ish strokes.
  const gx0 = pad,
    gx1 = size - pad;
  const gw = gx1 - gx0;
  const cx = size / 2;
  const stroke = Math.max(2, Math.floor(gw * 0.18));
  const half = stroke / 2;

  const isGlyph = (x, y) => {
    const t = pad,
      b = size - pad;
    const h = b - t;
    const topBar = t,
      midBar = t + h * 0.5,
      botBar = b;
    // vertical stem (the two little nubs of a $ pass through, slight overshoot)
    if (Math.abs(x - cx) <= half && y >= t - stroke * 0.8 && y <= b + stroke * 0.8)
      return true;
    // the S body: three horizontal bars
    for (const by of [topBar, midBar, botBar]) {
      if (Math.abs(y - by) <= half && x >= gx0 && x <= gx1) return true;
    }
    // upper-left vertical (top → middle) and lower-right vertical (middle → bottom)
    if (Math.abs(x - gx0) <= half && y >= topBar && y <= midBar) return true;
    if (Math.abs(x - gx1) <= half && y >= midBar && y <= botBar) return true;
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = inRounded(x, y);
      const glyph = inside && isGlyph(x, y);
      const c = glyph ? FG : BG;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = inside ? 0xff : 0x00;
    }
  }
  return px;
}

function encodePng(size, rgba) {
  // raw image data with filter byte 0 per scanline
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
];

for (const t of targets) {
  const png = encodePng(t.size, draw(t.size, t.maskable));
  writeFileSync(new URL(t.name, OUT), png);
  console.log("wrote", t.name, png.length, "bytes");
}
