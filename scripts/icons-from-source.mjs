// Builds the app icons from public/icons/carrot-source.png: auto-crops to the
// carrot, centers it on a white square, and writes each icon size.
// One-off tool — run with sharp installed: `npm i sharp && node scripts/icons-from-source.mjs`
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../public/icons/carrot-source.png", import.meta.url));
const OUT = new URL("../public/icons/", import.meta.url);

// Find the tight bounding box of non-white / non-transparent pixels.
const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
let minX = width,
  minY = height,
  maxX = -1,
  maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      a = data[i + 3];
    const isBg = a < 8 || (r > 244 && g > 244 && b > 244);
    if (!isBg) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0) throw new Error("carrot-source.png looks blank");

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const cropBuf = await sharp(SRC)
  .extract({ left: minX, top: minY, width: cropW, height: cropH })
  .png()
  .toBuffer();

console.log(`source ${width}x${height}, carrot bbox ${cropW}x${cropH}`);

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function make(name, size, fill) {
  const inner = Math.round(size * fill);
  const carrot = await sharp(cropBuf)
    .resize(inner, inner, { fit: "contain", background: WHITE })
    .toBuffer();
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{ input: carrot, gravity: "center" }])
    .png()
    .toBuffer();
  writeFileSync(new URL(name, OUT), png);
  console.log("wrote", name);
}

await make("icon-192.png", 192, 0.74);
await make("icon-512.png", 512, 0.74);
await make("apple-touch-icon.png", 180, 0.74);
// Maskable: extra margin so the carrot survives the platform's circular mask.
await make("icon-maskable-512.png", 512, 0.56);
