// Generates BucksBuddy app icons: a simple carrot on a solid white background
// (matching the 🥕 on the login screen). No external deps — hand-rolls a PNG via
// zlib. Re-run with: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../public/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const WHITE = [0xff, 0xff, 0xff];
const ORANGE = [0xff, 0x7a, 0x00]; // carrot body
const ORANGE_LT = [0xff, 0xa1, 0x4d]; // glossy highlight
const ORANGE_DK = [0xdd, 0x5e, 0x00]; // ridge marks
const GREEN = [0x4f, 0xb8, 0x6c]; // leaves
const GREEN_DK = [0x2f, 0x8c, 0x4f]; // back leaves

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;

  // Carrot body: a rounded cone (convex sides, wide shoulders, pointed tip).
  const bodyTopY = 0.4 * size;
  const tipY = 0.88 * size;
  const maxHalf = 0.185 * size;
  const bodyHalf = (y) => {
    if (y < bodyTopY || y > tipY) return null;
    const t = (y - bodyTopY) / (tipY - bodyTopY);
    return maxHalf * Math.pow(1 - t, 0.72);
  };

  // Leaf blades fanning up from the shoulders (two depth shades).
  const baseY = bodyTopY + 0.02 * size;
  const blades = [
    { tx: cx, ty: 0.09 * size, hw: 0.055 * size, color: GREEN },
    { tx: cx - 0.085 * size, ty: 0.13 * size, hw: 0.05 * size, color: GREEN },
    { tx: cx + 0.085 * size, ty: 0.13 * size, hw: 0.05 * size, color: GREEN },
    { tx: cx - 0.16 * size, ty: 0.22 * size, hw: 0.045 * size, color: GREEN_DK },
    { tx: cx + 0.16 * size, ty: 0.22 * size, hw: 0.045 * size, color: GREEN_DK },
  ];

  const inBlade = (x, y, b) => {
    const dx = b.tx - cx;
    const dy = b.ty - baseY;
    const len2 = dx * dx + dy * dy;
    const u = ((x - cx) * dx + (y - baseY) * dy) / len2;
    if (u < 0 || u > 1) return false;
    const projx = cx + u * dx;
    const projy = baseY + u * dy;
    return Math.hypot(x - projx, y - projy) <= b.hw * (1 - u);
  };

  // A few short ridge dashes alternating across the body.
  const ridges = [0.2, 0.36, 0.52, 0.68].map((p, idx) => ({
    y: bodyTopY + (tipY - bodyTopY) * p,
    side: idx % 2 === 0 ? -1 : 1,
  }));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let c = WHITE;
      const hw = bodyHalf(y);
      const dx = x - cx;

      if (hw !== null && Math.abs(dx) <= hw) {
        c = ORANGE;
        // glossy highlight band on the left third
        if (dx < -hw + hw * 0.5) c = ORANGE_LT;
        // ridge dashes
        for (const r of ridges) {
          const near = Math.abs(y - r.y) <= 0.012 * size;
          const within =
            r.side < 0
              ? dx > -hw * 0.85 && dx < -hw * 0.15
              : dx > hw * 0.15 && dx < hw * 0.85;
          if (near && within) c = ORANGE_DK;
        }
      } else {
        for (const b of blades) {
          if (inBlade(x, y, b)) {
            c = b.color;
            break;
          }
        }
      }

      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 0xff; // opaque white background
    }
  }
  return px;
}

function encodePng(size, rgba) {
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
  ihdr[8] = 8;
  ihdr[9] = 6;
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
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  const png = encodePng(t.size, draw(t.size));
  writeFileSync(new URL(t.name, OUT), png);
  console.log("wrote", t.name, png.length, "bytes");
}
