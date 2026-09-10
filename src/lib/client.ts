"use client";
// PM CONTROL TOWER — API client, query hook, realtime bus

import { useCallback, useEffect, useRef, useState } from "react";

const TOKEN_KEY = "pmct_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let json: ApiEnvelope<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError(res.status, `Unexpected response (${res.status})`);
  }
  if (!res.ok || !json.success) {
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent("pmct:unauthorized"));
    }
    throw new ApiClientError(res.status, json.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T,>(path: string) => request<T>("DELETE", path),
};

/** Lightweight data-fetching hook with refetch + loading + error states. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const refetch = useCallback(async () => {
    if (!pathRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<T>(pathRef.current);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api.get<T>(path)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : "Failed to load"); setLoading(false); } });
    return () => { alive = false; };
  }, [path, ...deps]);

  return { data, loading, error, refetch, setData };
}

// ---- Realtime bus: socket events fan out to subscribers ----
export type RtHandler = (event: string, payload: unknown) => void;
const handlers = new Set<RtHandler>();
let socketRef: { connected: boolean } | null = null;
let connectFn: ((token: string) => void) | null = null;

export function registerSocketConnector(fn: (token: string) => void) {
  connectFn = fn;
}
export function connectRealtime(token: string) {
  connectFn?.(token);
}
export function socketState() {
  return socketRef?.connected ?? false;
}
export function setSocketState(connected: boolean) {
  socketRef = { connected };
  window.dispatchEvent(new CustomEvent("pmct:rt-state", { detail: connected }));
}

export function onRealtime(handler: RtHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
export function dispatchRealtime(event: string, payload: unknown) {
  handlers.forEach((h) => {
    try { h(event, payload); } catch { /* subscriber error isolation */ }
  });
}

/** Hook: refetch when relevant realtime events fire. */
export function useRealtimeRefetch(refetch: () => void, events: string[]) {
  useEffect(() => {
    return onRealtime((event) => {
      // "data:imported" is a universal refresh hint: after a CSV import the
      // currently mounted view (which owns the Import/Export dialog) must re-read
      // its data. The SPA mounts one view at a time, so this stays cheap.
      if (events.includes(event) || events.includes("*") || event === "data:imported") refetch();
    });
  }, [events.join(",")]);
}
