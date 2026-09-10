"use client";
// PM CONTROL TOWER — Root: auth gate → app shell → hash-routed views (single visible route)

import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { AppShell, SessionUser, canAccess, homeFor } from "@/components/pmct/shell";
import { RealtimeConnector } from "@/components/pmct/realtime";
import { ViewLoader } from "@/views/registry";
import { LoginView } from "@/views/login";

export default function Home() {
  const route = useRoute();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [token, setTok] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const t = getToken();
    setTok(t);
    if (!t) { setUser(null); setBooting(false); return; }
    try {
      const d = await api.get<{ user: SessionUser }>("/api/auth/me");
      setUser(d.user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  // Role-aware landing: #/dashboard is the Executive Control Tower and requires
  // "executive.view". Users without it (e.g. team members) are redirected to the
  // first workspace they may use, so the main screen never shows "Permission denied".
  useEffect(() => {
    if (!user || booting) return;
    const onExecutiveHome = route.path === "/" || route.path === "" || route.path === "/dashboard";
    if (onExecutiveHome && !canAccess(user, "executive.view")) {
      const home = homeFor(user);
      window.location.replace(`#${home}`);
    }
  }, [user, booting, route.path]);

  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); };
    window.addEventListener("pmct:unauthorized", onUnauthorized);
    return () => window.removeEventListener("pmct:unauthorized", onUnauthorized);
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const d = await api.post<{ token: string; user: { id: string } }>("/api/auth/login", { email, password });
    setToken(d.token);
    await loadSession();
  }, [loadSession]);

  const handleLogout = useCallback(async () => {
    try { await api.post("/api/auth/logout"); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
    window.location.hash = "/dashboard";
  }, []);

  if (booting) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0b1f3a] gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-sky-400 animate-pulse shadow-2xl" />
        <p className="text-slate-300 text-sm tracking-[0.2em] font-semibold">PM CONTROL TOWER</p>
      </div>
    );
  }

  if (!user) return <LoginView onLogin={handleLogin} />;

  return (
    <>
      <RealtimeConnector token={token || getToken() || ""} userId={user.id} roles={user.roles} />
      <AppShell user={user} onLogout={handleLogout}>
        <ViewLoader segments={route.segments} />
      </AppShell>
    </>
  );
}
