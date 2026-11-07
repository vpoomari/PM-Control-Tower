// PM CONTROL TOWER — AI Feature Studio · catalogue aggregator
// Folds the ten batch files into one ordered catalogue. Batch files are owned by
// their batch authors; this file is owned by the core (never edited by batches).

import type { FeatureLoader, FeatureMeta } from "./meta";
import { metas as metas01, loaders as loaders01 } from "./batch-01";
import { metas as metas02, loaders as loaders02 } from "./batch-02";
import { metas as metas03, loaders as loaders03 } from "./batch-03";
import { metas as metas04, loaders as loaders04 } from "./batch-04";
import { metas as metas05, loaders as loaders05 } from "./batch-05";
import { metas as metas06, loaders as loaders06 } from "./batch-06";
import { metas as metas07, loaders as loaders07 } from "./batch-07";
import { metas as metas08, loaders as loaders08 } from "./batch-08";
import { metas as metas09, loaders as loaders09 } from "./batch-09";
import { metas as metas10, loaders as loaders10 } from "./batch-10";

const BATCHES: Array<{ metas: FeatureMeta[]; loaders: Record<string, FeatureLoader> }> = [
  { metas: metas01, loaders: loaders01 },
  { metas: metas02, loaders: loaders02 },
  { metas: metas03, loaders: loaders03 },
  { metas: metas04, loaders: loaders04 },
  { metas: metas05, loaders: loaders05 },
  { metas: metas06, loaders: loaders06 },
  { metas: metas07, loaders: loaders07 },
  { metas: metas08, loaders: loaders08 },
  { metas: metas09, loaders: loaders09 },
  { metas: metas10, loaders: loaders10 },
];

/** Every feature, in importance order (f001 → f100). */
export const FEATURES: FeatureMeta[] = BATCHES.flatMap((b) => b.metas).sort((a, b) => a.rank - b.rank);

/** id → lazy component loader. */
export const LOADERS: Record<string, FeatureLoader> = Object.assign(
  {},
  ...BATCHES.map((b) => b.loaders),
);

export function featureById(id: string): FeatureMeta | undefined {
  return FEATURES.find((f) => f.id === id);
}
