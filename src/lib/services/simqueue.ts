// PM CONTROL TOWER — Async simulation worker queue (in-process).
// POST /simulate enqueues; a single background worker drains the queue with
// setImmediate so the API thread is never blocked. Runs move
// QUEUED → RUNNING → COMPLETE | FAILED and the UI polls or listens for
// simulation:completed. (In-process by design: single-app-node deployment.)

import { db } from "@/lib/db";
import { computeSimulationData } from "./integrity";
import { emitRealtime } from "@/lib/realtime";

interface SimJob { runId: string; projectId: string; seed?: number; iterations?: number }
const queue: SimJob[] = [];
let draining = false;

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      await db.simulationRun.update({ where: { id: job.runId }, data: { status: "RUNNING" } });
      const { result, projectStart, budget } = await computeSimulationData(job.projectId, { seed: job.seed, iterations: job.iterations });
      await db.simulationRun.update({
        where: { id: job.runId },
        data: { status: "COMPLETE", seed: result.seed, iterations: result.iterations, stale: false, resultsJson: JSON.stringify({ ...result, projectStart, budget }) },
      });
      emitRealtime("simulation:completed", { projectId: job.projectId, runId: job.runId, finish: result.finish }, `project:${job.projectId}`);
    } catch (e) {
      await db.simulationRun.update({ where: { id: job.runId }, data: { status: "FAILED", error: e instanceof Error ? e.message : "simulation failed" } }).catch(() => undefined);
    }
  }
  draining = false;
}

export async function enqueueSimulation(projectId: string, opts: { seed?: number; iterations?: number }): Promise<{ runId: string; status: "QUEUED" }> {
  await db.simulationRun.updateMany({ where: { projectId, stale: false, status: "COMPLETE" }, data: { stale: true } });
  const seed = opts.seed ?? Math.floor(Math.random() * 2_000_000_000);
  const run = await db.simulationRun.create({ data: { projectId, seed, iterations: opts.iterations ?? 1000, status: "QUEUED", resultsJson: "{}" } });
  queue.push({ runId: run.id, projectId, seed, iterations: opts.iterations });
  void drain();
  return { runId: run.id, status: "QUEUED" };
}
