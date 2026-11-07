// PM CONTROL TOWER — AI Feature Studio structural tests (pure, DB-free, deterministic)
// Guards the 100-feature contract from docs/AI-FEATURE-ROADMAP.md:
//   - exactly 100 feature files, ids f001…f100, one file per id
//   - every feature follows the studio protocol ("use client", embedded
//     SYSTEM_PROMPT with the grounding rule, default-exported component, local
//     state, try/catch around askAIResult, rendered through FeatureFrame)
//   - every lucide-react icon actually exists in the installed package
//   - the catalogue is complete: 10 batches × 10 metas, unique ids, a loader for
//     every meta, and the aggregator wires every batch
//   - features stay client-safe: no direct fetch, no localStorage key access
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as lucide from "lucide-react";

const FEATURES_DIR = path.resolve(process.cwd(), "src/views/ai/features");
const FEATURE_COUNT = 100;
const BATCH_COUNT = 10;

const expectedIds = Array.from({ length: FEATURE_COUNT }, (_, i) => `f${String(i + 1).padStart(3, "0")}`);

function read(file: string): string {
  return fs.readFileSync(path.join(FEATURES_DIR, file), "utf8");
}

function featureFiles(): string[] {
  return fs
    .readdirSync(FEATURES_DIR)
    .filter((f) => /^f\d{3}-.*\.tsx$/.test(f))
    .sort();
}

function lucideImports(source: string): string[] {
  const out: string[] = [];
  // `[^}]*` keeps the match on the statement whose own braces close before
  // `from "lucide-react"` — it can never swallow a preceding react import.
  const re = /import\s*\{([^}]*)\}\s*from "lucide-react";/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name) out.push(name);
    }
  }
  return out;
}

test("ai studio: the catalogue holds exactly 100 features (f001…f100)", () => {
  assert.ok(fs.existsSync(FEATURES_DIR), `missing directory: ${FEATURES_DIR}`);
  const files = featureFiles();
  const ids = files.map((f) => f.slice(0, 4));
  assert.equal(files.length, FEATURE_COUNT, `expected ${FEATURE_COUNT} feature files, found ${files.length}`);
  assert.deepEqual([...ids].sort(), expectedIds, "feature files must cover f001…f100 exactly once");
  assert.equal(new Set(ids).size, FEATURE_COUNT, "duplicate feature ids");
});

test("ai studio: every feature follows the studio protocol", () => {
  for (const file of featureFiles()) {
    const id = file.slice(0, 4);
    const rank = Number(id.slice(1));
    const src = read(file);

    assert.ok(src.includes('"use client"'), `${file}: must start with "use client"`);
    assert.ok(/const SYSTEM_PROMPT = \[/.test(src), `${file}: must embed its own SYSTEM_PROMPT`);
    assert.ok(src.includes("Never invent project metrics"), `${file}: SYSTEM_PROMPT must carry the grounding rule`);
    assert.ok(/export default function [A-Za-z0-9_$]+/.test(src), `${file}: must default-export its component`);
    assert.ok(/useState</.test(src), `${file}: must own its input state with useState`);
    assert.ok(src.includes("askAIResult("), `${file}: must call the central askAI server action`);
    assert.ok(/\btry \{/.test(src), `${file}: run handler must use try`);
    assert.ok(/\}\s*catch\s*\(/.test(src), `${file}: run handler must catch`);
    assert.ok(/from "\.\/frame"/.test(src), `${file}: must render through the shared FeatureFrame`);
    assert.ok(src.includes("<FeatureFrame"), `${file}: must render <FeatureFrame …`);
    assert.ok(src.includes(`id="${id}"`), `${file}: frame id must be ${id}`);
    assert.ok(src.includes(`rank={${rank}}`), `${file}: frame rank must be ${rank}`);
    assert.ok(/runLabel=/.test(src), `${file}: must set a runLabel`);
    assert.ok(/from "\.\/(catalog|index)"/.test(src) === false, `${file}: must not import the catalogue or the view`);
    assert.ok(!/[^.\w]fetch\s*\(/.test(src), `${file}: features must not call fetch directly`);
    assert.ok(!src.includes("localStorage"), `${file}: BYOK material never touches the browser storage`);
    assert.ok(!/process\./.test(src), `${file}: client feature must not touch process env`);
  }
});

test("ai studio: every imported lucide icon exists in the installed package", () => {
  const icons = lucide as unknown as Record<string, unknown>;
  const checked = new Set<string>();
  const sources = [
    ...featureFiles().map((f) => ({ file: f, src: read(f) })),
    ...Array.from({ length: BATCH_COUNT }, (_, i) => ({
      file: `batch-${String(i + 1).padStart(2, "0")}.ts`,
      src: read(`batch-${String(i + 1).padStart(2, "0")}.ts`),
    })),
    { file: "meta.ts", src: read("meta.ts") },
    { file: "frame.tsx", src: read("frame.tsx") },
  ];
  for (const { file, src } of sources) {
    for (const icon of lucideImports(src)) {
      checked.add(icon);
      assert.ok(icons[icon] !== undefined, `${file}: lucide-react has no icon named "${icon}"`);
    }
  }
  assert.ok(checked.size >= 50, "expected the studio to use a spread of icons");
});

test("ai studio: ten batches cover the whole catalogue with unique ids", () => {
  const allIds: string[] = [];
  for (let n = 1; n <= BATCH_COUNT; n++) {
    const file = `batch-${String(n).padStart(2, "0")}.ts`;
    assert.ok(fs.existsSync(path.join(FEATURES_DIR, file)), `missing batch file: ${file}`);
    const src = read(file);

    const ranges = expectedIds.slice((n - 1) * 10, n * 10);
    const metaIds = Array.from(src.matchAll(/id:\s*"(f\d{3})"/g)).map((m) => m[1]);
    assert.deepEqual(metaIds, ranges, `${file}: must declare its ten metas in id order`);

    for (const m of src.matchAll(/id:\s*"(f\d{3})",\s*rank:\s*(\d+)/g)) {
      assert.equal(Number(m[2]), Number(m[1].slice(1)), `${file}: rank must equal the id number for ${m[1]}`);
    }
    assert.equal(
      (src.match(/\brank:\s*\d+/g) ?? []).length,
      10,
      `${file}: every meta needs a rank`,
    );
    assert.equal(
      (src.match(/\bcategory:\s*"(plan|cost|risk|status|gov|agile|people|strategy|knowledge|productivity)"/g) ?? []).length,
      10,
      `${file}: every meta needs a known category`,
    );
    assert.equal(
      (src.match(/\bpriority:\s*"(P0|P1|P2)"/g) ?? []).length,
      10,
      `${file}: every meta needs a P0/P1/P2 priority`,
    );

    const loaders = Array.from(src.matchAll(/f\d{3}:\s*\(\)\s*=>\s*import\("\.\/([^"]+)"\)/g)).map((m) => m[1]);
    assert.equal(loaders.length, 10, `${file}: must register ten loaders`);
    for (const target of loaders) {
      assert.ok(fs.existsSync(path.join(FEATURES_DIR, `${target}.tsx`)), `${file}: loader target ./${target} does not exist`);
    }

    allIds.push(...metaIds);
  }
  assert.equal(allIds.length, FEATURE_COUNT, "metas across the ten batches must total 100");
  assert.deepEqual([...allIds].sort(), expectedIds, "meta ids must cover f001…f100 exactly once");
  assert.equal(new Set(allIds).size, FEATURE_COUNT, "meta ids must be unique across batches");
});

test("ai studio: the aggregator wires every batch and the view exposes the studio", () => {
  const catalog = read("catalog.ts");
  for (let n = 1; n <= BATCH_COUNT; n++) {
    const batch = `./batch-${String(n).padStart(2, "0")}`;
    assert.ok(catalog.includes(batch), `catalog.ts must aggregate ${batch}`);
  }
  assert.ok(catalog.includes("FEATURES"), "catalog.ts must export FEATURES");
  assert.ok(catalog.includes("LOADERS"), "catalog.ts must export LOADERS");

  const view = read("index.tsx");
  assert.ok(view.includes('"use client"'), "studio view must be a client component");
  assert.ok(view.includes("/api/projects"), "studio view must load the live project context");
  assert.ok(view.includes("StudioProvider"), "studio view must provide live context to features");
  assert.ok(view.includes("FEATURE_COMPONENTS"), "studio view must map ids to lazy components");
});

test("ai studio: the route and the sidebar expose the studio", () => {
  const registry = fs.readFileSync(path.resolve(process.cwd(), "src/views/registry.tsx"), "utf8");
  assert.ok(registry.includes('"@/views/ai/features"'), "registry must lazy-load the studio view");
  assert.ok(/case "ai-features":/.test(registry), "registry must map #/ai-features to the studio");

  // The sidebar nav lives in nav-items.tsx (single source of truth for shell + Tab Visibility).
  const shell = fs.readFileSync(path.resolve(process.cwd(), "src/components/pmct/nav-items.tsx"), "utf8");
  assert.ok(shell.includes('href: "/ai-features"'), "sidebar must link the studio");
  assert.ok(shell.includes('"ai.use"') && shell.includes("AI Feature Studio"), "studio tab must be permission-gated");
});
