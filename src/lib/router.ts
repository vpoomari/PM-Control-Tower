"use client";
// PM CONTROL TOWER — Hash router (single visible route `/`; deep links via location.hash)

import { useEffect, useState, useCallback } from "react";

export interface RouteState {
  path: string;        // e.g. "/projects/cmr123/schedule"
  segments: string[];  // ["projects","cmr123","schedule"]
  query: URLSearchParams;
}

function parseHash(): RouteState {
  const raw = window.location.hash.replace(/^#/, "") || "/dashboard";
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return {
    path,
    segments: path.split("/").filter(Boolean),
    query: new URLSearchParams(queryPart || ""),
  };
}

export function useRoute(): RouteState & { navigate: (to: string) => void } {
  const [state, setState] = useState<RouteState>(() =>
    typeof window === "undefined" ? { path: "/dashboard", segments: ["dashboard"], query: new URLSearchParams() } : parseHash()
  );
  useEffect(() => {
    const onChange = () => setState(parseHash());
    window.addEventListener("hashchange", onChange);
    // popstate covers browser back/forward and any client-side pushState navigation
    window.addEventListener("popstate", onChange);
    if (!window.location.hash) window.location.replace("#/dashboard");
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  const navigate = useCallback((to: string) => {
    const target = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
    if (window.location.hash === target) setState(parseHash());
    else window.location.hash = target;
  }, []);
  return { ...state, navigate };
}
