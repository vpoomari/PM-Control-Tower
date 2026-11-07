// Slice the diverse 3D avatar contact sheet (10 cols x 8 rows = 80 avatars)
// into public/avatars/avatar-01.png … avatar-80.png. Run once: node scripts/slice-avatars.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/vinod/Downloads/Diverse 3D Avatar Contact Sheet.png";
const OUT = "public/avatars";
const COLS = 10;
const ROWS = 8;
const SIZE = 160; // square output, avatar crops

if (!fs.existsSync(SRC)) {
  console.error(`Source sheet not found: ${SRC}`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const { width: W, height: H } = await sharp(SRC).metadata();
const cw = Math.floor(W / COLS);
const ch = Math.floor(H / ROWS);

let n = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    n += 1;
    const name = `avatar-${String(n).padStart(2, "0")}.png`;
    await sharp(SRC)
      .extract({ left: c * cw, top: r * ch, width: cw, height: ch })
      .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, name));
  }
}
console.log(`Sliced ${n} avatars from ${W}x${H} sheet (cell ${cw}x${ch}) -> ${OUT}`);
