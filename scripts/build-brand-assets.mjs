// Builds combined Czarnikow × Optinus brand assets into public/brand/
// Run: node scripts/build-brand-assets.mjs
import sharp from "sharp";

const B = "public/brand/";

async function main() {
  const cz = await sharp(B + "czarnikow.png").resize({ width: 128, height: 128 }).png().toBuffer();
  const op = await sharp(B + "optinus-light.png").resize({ height: 128 }).png().toBuffer();
  const opW = Math.round((675 * 128) / 96);

  const xSvg = Buffer.from(
    `<svg width="44" height="44" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#2aaade" stroke-width="7" stroke-linecap="round">
        <line x1="9" y1="9" x2="35" y2="35"/>
        <line x1="35" y1="9" x2="9" y2="35"/>
      </g>
    </svg>`,
  );

  const pad = 20, gap = 26;
  const W = pad + 128 + gap + 44 + gap + opW + pad;
  const H = 128 + pad * 2;

  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: cz, left: pad, top: pad },
      { input: xSvg, left: pad + 128 + gap, top: pad + 42 },
      { input: op, left: pad + 128 + gap + 44 + gap, top: pad },
    ])
    .png()
    .toFile(B + "czarnikow-x-optinus.png");

  // App icon: Czarnikow square + Optinus ring as corner badge
  const czBase = await sharp(B + "czarnikow-favicon-200.png").resize({ width: 128, height: 128 }).png().toBuffer();
  const circle = Buffer.from(
    `<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="96" cy="96" r="27" fill="#ffffff"/>
    </svg>`,
  );
  const ring = await sharp(B + "optinus-favicon.png").trim({ threshold: 10 }).resize({ height: 34 }).png().toBuffer();
  const rm = await sharp(ring).metadata();

  await sharp(czBase)
    .composite([
      { input: circle, left: 0, top: 0 },
      { input: ring, left: 96 - Math.round(rm.width / 2), top: 96 - 17 },
    ])
    .png()
    .toFile(B + "app-icon.png");

  await sharp(B + "app-icon.png").resize({ width: 32, height: 32 }).png().toFile(B + "favicon-32.png");

  const fm = await sharp(B + "czarnikow-x-optinus.png").metadata();
  console.log("lockup:", fm.width + "x" + fm.height, "| ring width:", rm.width);
}

main().catch((e) => { console.error(e); process.exit(1); });
