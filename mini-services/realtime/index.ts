// PM CONTROL TOWER — Realtime Gateway (Socket.IO mini service)
// Port 3003. Clients connect via the Caddy gateway: io("/?XTransformPort=3003", { path: "/" }).
// Business services publish events via POST /emit (shared-secret protected).

import { createServer } from "http";
import { Server } from "socket.io";
import { jwtVerify } from "jose";

const PORT = Number(process.env.REALTIME_PORT || 3003);
const SECRET = new TextEncoder().encode(process.env.REALTIME_SECRET_KEY || "pmct-sandbox-dev-secret-change-in-production-0f4a9b");
const EMIT_SECRET = process.env.REALTIME_SECRET || "pmct-rt-sandbox-secret";

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "pmct-realtime", clients: io.engine.clientsCount }));
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/emit")) {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      if (req.headers["x-pmct-secret"] !== EMIT_SECRET) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid emit secret" }));
        return;
      }
      try {
        const { event, payload, room } = JSON.parse(body);
        if (room) io.to(room).emit(event, { ...payload, _ts: Date.now() });
        else io.emit(event, { ...payload, _ts: Date.now() });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ delivered: true, event, room: room || "broadcast" }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Bad payload" }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  // Default engine.io path ("/socket.io/") — REST endpoints (/health, /emit) fall through
  // to the request handler above. Client connects with io("/?XTransformPort=3003").
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) { next(new Error("Unauthorized")); return; }
    const { payload } = await jwtVerify(token, SECRET, { issuer: "pm-control-tower" });
    socket.data.userId = String(payload.sub);
    socket.data.email = String(payload.email);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);

  socket.on("subscribe", (rooms: string[] | string) => {
    const list = Array.isArray(rooms) ? rooms : [rooms];
    for (const r of list) {
      if (typeof r === "string" && /^(project|role|user|global):[\w-]+$/.test(r)) socket.join(r);
    }
  });
  socket.on("unsubscribe", (rooms: string[] | string) => {
    const list = Array.isArray(rooms) ? rooms : [rooms];
    for (const r of list) socket.leave(r);
  });
  socket.on("ping-rt", (cb) => {
    if (typeof cb === "function") cb({ pong: true, ts: Date.now() });
  });
});

httpServer.listen(PORT, () => {
  console.log(`[pmct-realtime] Socket.IO gateway listening on :${PORT}`);
});
