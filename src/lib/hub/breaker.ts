// PM CONTROL TOWER — TowerIntegration Hub: resiliency layer.
// Circuit Breaker + exponential backoff with jitter. Pure state-machine
// functions (clock injected) so the failure policy is unit-testable and the
// same state object round-trips through the HubConnection row.

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface BreakerConfig {
  /** Consecutive failures that trip the breaker. */
  failureThreshold: number;
  /** How long the breaker stays OPEN before probing (ms); doubles per trip. */
  openMs: number;
  /** Max cooldown cap (ms). */
  maxOpenMs: number;
  /** Successful probes required in HALF_OPEN to fully close. */
  halfOpenSuccesses: number;
}

export const DEFAULT_BREAKER: BreakerConfig = {
  failureThreshold: 5,
  openMs: 30_000,
  maxOpenMs: 300_000,
  halfOpenSuccesses: 1,
};

export interface BreakerSnapshot {
  state: BreakerState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  /** Epoch ms when the current OPEN window expires (probe allowed). */
  retryAtMs: number;
  /** How many times the breaker has opened (drives cooldown doubling). */
  trips: number;
  lastFailureAtMs: number | null;
  lastError: string | null;
}

export function breakerClosed(): BreakerSnapshot {
  return { state: "CLOSED", consecutiveFailures: 0, halfOpenSuccesses: 0, retryAtMs: 0, trips: 0, lastFailureAtMs: null, lastError: null };
}

/**
 * May a call be attempted right now? CLOSED always can; OPEN only after the
 * cooldown; HALF_OPEN allows exactly one probe at a time (guarded by caller).
 */
export function breakerAllow(snap: BreakerSnapshot, nowMs: number): boolean {
  if (snap.state === "CLOSED") return true;
  if (snap.state === "OPEN") return nowMs >= snap.retryAtMs;
  return true; // HALF_OPEN: probe allowed
}

export interface BreakerOutcome {
  snapshot: BreakerSnapshot;
  /** true when this success just moved HALF_OPEN → CLOSED. */
  closed: boolean;
  /** true when this failure just moved CLOSED/ HALF_OPEN → OPEN. */
  opened: boolean;
}

/** Record a successful call. */
export function breakerSuccess(snap: BreakerSnapshot, cfg: BreakerConfig = DEFAULT_BREAKER): BreakerOutcome {
  if (snap.state === "HALF_OPEN") {
    const successes = snap.halfOpenSuccesses + 1;
    if (successes >= cfg.halfOpenSuccesses) {
      return {
        snapshot: { ...breakerClosed(), trips: snap.trips },
        closed: true,
        opened: false,
      };
    }
    return { snapshot: { ...snap, halfOpenSuccesses: successes }, closed: false, opened: false };
  }
  // CLOSED (or an OPEN probe that raced): reset the failure streak.
  return {
    snapshot: { ...snap, consecutiveFailures: 0, halfOpenSuccesses: 0, lastError: null },
    closed: false,
    opened: false,
  };
}

/** Record a failed call. Trips the breaker at the threshold; re-opens from HALF_OPEN instantly. */
export function breakerFailure(
  snap: BreakerSnapshot,
  nowMs: number,
  error: string | null,
  cfg: BreakerConfig = DEFAULT_BREAKER,
): BreakerOutcome {
  const failures = snap.consecutiveFailures + 1;
  const base = { ...snap, consecutiveFailures: failures, lastFailureAtMs: nowMs, lastError: error };

  // HALF_OPEN failure → OPEN again with a doubled cooldown (up to cap).
  if (snap.state === "HALF_OPEN") {
    const trips = snap.trips + 1;
    const openMs = Math.min(cfg.openMs * 2 ** (trips - 1), cfg.maxOpenMs);
    return {
      snapshot: { ...base, state: "OPEN", trips, retryAtMs: nowMs + openMs, halfOpenSuccesses: 0 },
      closed: false,
      opened: true,
    };
  }

  if (snap.state === "OPEN") {
    // A late failure while already OPEN just extends the window.
    return { snapshot: base, closed: false, opened: false };
  }

  // CLOSED → OPEN at threshold.
  if (failures >= cfg.failureThreshold) {
    const trips = snap.trips + 1;
    const openMs = Math.min(cfg.openMs * 2 ** (trips - 1), cfg.maxOpenMs);
    return {
      snapshot: { ...base, state: "OPEN", trips, retryAtMs: nowMs + openMs, halfOpenSuccesses: 0 },
      closed: false,
      opened: true,
    };
  }
  return { snapshot: base, closed: false, opened: false };
}

/**
 * Tick the breaker with the clock: OPEN → HALF_OPEN when the cooldown expires.
 * Call before breakerAllow in polling loops.
 */
export function breakerTick(snap: BreakerSnapshot, nowMs: number): BreakerSnapshot {
  if (snap.state === "OPEN" && nowMs >= snap.retryAtMs) {
    return { ...snap, state: "HALF_OPEN", halfOpenSuccesses: 0 };
  }
  return snap;
}

// ---------------------------------------------------------------------------
// Exponential backoff — delay schedule for retries after transient failures.
// ---------------------------------------------------------------------------

export interface BackoffConfig {
  baseMs: number;
  factor: number;
  maxMs: number;
  /** 0..1 — jitter fraction applied symmetrically around the delay. */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = { baseMs: 500, factor: 2, maxMs: 60_000, jitter: 0.2 };

/**
 * Delay before retry attempt n (1-based): base * factor^(n-1), capped at maxMs,
 * ±jitter. Deterministic when rng is injected (unit tests pass a fixed rng).
 */
export function backoffDelay(attempt: number, cfg: BackoffConfig = DEFAULT_BACKOFF, rng: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = Math.min(cfg.baseMs * cfg.factor ** (n - 1), cfg.maxMs);
  const jitterSpan = raw * cfg.jitter;
  const jittered = raw - jitterSpan + rng() * 2 * jitterSpan;
  return Math.max(0, Math.round(Math.min(jittered, cfg.maxMs * (1 + cfg.jitter))));
}

/** The full schedule for a retry budget (attempts 1..maxAttempts). */
export function backoffSchedule(maxAttempts: number, cfg: BackoffConfig = DEFAULT_BACKOFF, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 1; i <= Math.max(1, maxAttempts); i++) out.push(backoffDelay(i, cfg, rng));
  return out;
}

/** HTTP statuses that justify a retry (transient/rate-limit), vs terminal errors. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timeout|timed out|network|econn|fetch failed|socket|temporarily|rate.?limit/i.test(msg);
}
