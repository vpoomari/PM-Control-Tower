// Compiles src/app/globals.css through the same @tailwindcss/postcss pipeline
// and reports whether the corrupted selector appears in the output.
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs";

const css = fs.readFileSync("src/app/globals.css", "utf8");
const processor = postcss([tailwind({ base: process.cwd() })]);
try {
  const result = await processor.process(css, { from: "src/app/globals.css" });
  const out = result.css;
  fs.writeFileSync("tool-results/compiled-globals.css", out);
  const bad = out.includes("cmdk-groupT") || out.includes("h0Clot");
  console.log("compiled OK,", out.length, "bytes; corrupted selector present:", bad);
  if (bad) {
    const i = out.indexOf("cmdk-groupT");
    console.log("context:", JSON.stringify(out.slice(i - 120, i + 160)));
  }
} catch (e) {
  console.error("compile failed:", e.message?.slice(0, 500));
}
