"use client";
// PM CONTROL TOWER — Root: auth gate → app shell → hash-routed views (single visible route)

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken, setToken } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { AppShell, SessionUser, canAccess, homeFor, landingAfterLogin } from "@/components/pmct/shell";
import { RealtimeConnector } from "@/components/pmct/realtime";
import { ViewLoader } from "@/views/registry";
import { LoginView } from "@/views/login";

export default function Home() {
  const route = useRoute();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [token, setTok] = useState<string | null>(null);

  // Raw hash captured during the FIRST render — before the router's mount
  // effect normalises an empty hash to "#/dashboard" (router.ts parseHash).
  // true ⇒ the page was opened with no explicit route (fresh entry / restored
  // session); an explicit deep link (#/dashboard included) is therefore still
  // distinguishable and honoured as-is. Consumed (nulled) by the landing
  // effect so the decision is made exactly once per page load.
  const enteredUnspecified = useRef<boolean | null>(null);
  if (enteredUnspecified.current === null && typeof window !== "undefined") {
    enteredUnspecified.current = window.location.hash === "";
  }

  const loadSession = useCallback(async (): Promise<SessionUser | null> => {
    const t = getToken();
    setTok(t);
    if (!t) { setUser(null); setBooting(false); return null; }
    try {
      const d = await api.get<{ user: SessionUser }>("/api/auth/me");
      setUser(d.user);
      return d.user;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  // Role-aware landing, decided exactly once per page load:
  //  - fresh entry with no hash (captured above) lands on "#/dashboard" via the
  //    router's normalisation — PMO Admins / Project Managers are routed straight
  //    to the prioritized task dashboard (#/priorities);
  //  - an explicit deep link (any non-empty hash at load, #/dashboard included)
  //    is honoured as-is;
  //  - #/dashboard is the Executive Control Tower and requires "executive.view" —
  //    users without it are redirected to the first workspace they may use, so
  //    the main screen never shows "Permission denied".
  // handleLogin routes dashboard roles on sign-in independently of this.
  useEffect(() => {
    if (!user || booting) return;
    const unspecified = enteredUnspecified.current === true;
    enteredUnspecified.current = null; // one-shot: never re-decide this page load
    // Unspecified = the route is still the default (the router normalises an
    // empty hash to "/dashboard") AND the page was entered without a hash, or
    // the hash is literally "" / "/". If the user already navigated elsewhere
    // while the session was resolving, they keep their choice.
    const onDefaultRoute =
      route.path === "/dashboard" || route.path === "/" || route.path === "";
    const onUnspecifiedHome =
      onDefaultRoute && (unspecified || route.path === "/" || route.path === "");
    if (onUnspecifiedHome) {
      const priorities = landingAfterLogin(user);
      if (priorities) {
        window.location.replace(`#${priorities}`);
        return;
      }
    }
    if (onDefaultRoute && !canAccess(user, "executive.view")) {
      const home = homeFor(user);
      window.location.replace(`#${home}`);
    }
  }, [user, booting, route.path]);

  useEffect(() => {
    const onUnauthorized = () => { setToken(null); setUser(null); };
    window.addEventListener("pmct:unauthorized", onUnauthorized);
    return () => window.removeEventListener("pmct:unauthorized", onUnauthorized);
  }, []);

  // Re-read the session after a self-service profile change (e.g. avatar pick)
  // so the shell reflects the new avatar without a full reload.
  useEffect(() => {
    const onSessionUpdated = () => { void loadSession(); };
    window.addEventListener("pmct:session-updated", onSessionUpdated);
    return () => window.removeEventListener("pmct:session-updated", onSessionUpdated);
  }, [loadSession]);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const d = await api.post<{ token: string; user: { id: string } }>("/api/auth/login", { email, password });
    setToken(d.token);
    const me = await loadSession();
    // Role-based routing: PMO Admins and PMs land on the prioritized dashboard.
    const priorities = landingAfterLogin(me);
    if (priorities) window.location.hash = priorities;
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
