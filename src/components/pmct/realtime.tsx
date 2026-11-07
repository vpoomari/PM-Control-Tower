"use client";
// PM CONTROL TOWER — Socket.IO realtime connector (client side)
// Default: io("/?XTransformPort=3003") — the reverse-proxy convention (nginx/Caddy
// forwards /socket.io/ to the gateway port). In environments without a proxy (bare
// dev sandbox), set NEXT_PUBLIC_REALTIME_URL (e.g. http://127.0.0.1:3003) to
// connect straight to the gateway.

import { useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { connectRealtime, registerSocketConnector, dispatchRealtime, setSocketState, api } from "@/lib/client";
import { toast } from "sonner";

const RT_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "/?XTransformPort=3003";

let socket: Socket | null = null;

// Server-side fan-out list must cover every RealtimeEvent (src/lib/realtime.ts) —
// an omitted event is delivered by the gateway but dropped here, silently.
const EVENTS = [
  "project:created", "project:updated", "project:health",
  "wbs:changed", "task:changed", "schedule:changed", "dependency:changed",
  "baseline:changed", "resource:assigned", "timesheet:submitted", "timesheet:approved",
  "actuals:changed", "evm:changed", "raid:changed", "change:changed",
  "governance:changed", "alert:created", "inbox:changed", "planner:changed",
  "integration:changed", "automation:executed", "notification:created", "audit:created",
  "data:imported", "report:generated",
  "freshness:changed", "simulation:completed", "scenario:merged", "benefits:updated", "ai:action",
  "agile:changed", "field:changed", "calendar:changed", "tools:changed",
  "milestone:changed", "gate:changed", "requirement:changed", "timesheet:changed",
  "admin:changed", "agent:run",
];

export function RealtimeConnector({ token, userId, roles }: { token: string; userId: string; roles: string[] }) {
  useEffect(() => {
    registerSocketConnector((t: string) => {
      if (socket) { socket.disconnect(); socket = null; }
      socket = io(RT_URL, {
        path: "/socket.io/",
        auth: { token: t },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        transports: ["websocket", "polling"],
      });
      socket.on("connect", () => {
        setSocketState(true);
        const rooms = ["global", `user:${userId}`, ...roles.map((r) => `role:${r}`)];
        socket?.emit("subscribe", rooms);
        // ~70 server emissions are scoped to project:<id> rooms — join every project
        // room this user can list, otherwise project-scoped events land in empty rooms
        // and views that depend on them never refetch. Best-effort: base rooms above
        // still work if the listing fails.
        void api
          .get<{ items: { id: string }[] }>("/api/projects?take=500")
          .then((res) => {
            const projectRooms = (res.items ?? []).map((p) => `project:${p.id}`);
            if (projectRooms.length && socket?.connected) socket.emit("subscribe", projectRooms);
          })
          .catch(() => undefined);
      });
      socket.on("disconnect", () => setSocketState(false));
      socket.on("connect_error", () => setSocketState(false));
      // Fan out all PMCT business events to the internal bus
      for (const ev of EVENTS) {
        socket.on(ev, (payload: unknown) => {
          dispatchRealtime(ev, payload);
          if (ev === "alert:created") {
            const p = payload as { severity?: string; title?: string };
            if (p?.severity === "CRITICAL") toast.error(p.title || "Critical governance alert", { description: "Open Governance for details." });
          }
          if (ev === "notification:created") {
            const p = payload as { title?: string };
            if (p?.title) toast.info(p.title);
          }
        });
      }
    });
    connectRealtime(token);
    return () => { socket?.disconnect(); socket = null; setSocketState(false); };
  }, [token, userId, roles.join(",")]);
  return null;
}
