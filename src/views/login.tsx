"use client";
// PM CONTROL TOWER — Authentication view. Original brand identity; no third-party UI.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, TowerControl, Lock, Mail } from "lucide-react";

const BENEFITS = [
  "Strategic alignment across portfolios",
  "Real-time visibility on delivery health",
  "Optimized resource utilization",
  "Proactive risk management",
  "Data-driven executive decisions",
];

export function LoginView({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const demo = (e: string) => { setEmail(e); setPassword("Pmct@2026"); };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Brand panel */}
      <div className="relative lg:w-[46%] bg-[#0b1f3a] text-white px-8 py-12 lg:px-14 lg:py-0 flex flex-col justify-center overflow-hidden">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center shadow-lg">
              <TowerControl className="h-6 w-6" />
            </div>
            <div className="leading-tight">
              <p className="font-bold tracking-wide text-lg">PM CONTROL TOWER</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Enterprise PPM Platform</p>
            </div>
          </div>
          <h1 className="text-3xl lg:text-4xl font-semibold leading-tight tracking-tight">
            One platform.<br />Complete project intelligence.<br />
            <span className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">Greater outcomes.</span>
          </h1>
          <p className="mt-4 text-sm text-slate-300 max-w-md leading-relaxed">
            Portfolio → Program → Project → Delivery — one source of truth for scope, schedule, resources,
            cost, EVM, risk and governance.
          </p>
          <ul className="mt-8 space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-sm text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-[10px] uppercase tracking-[0.18em] text-slate-500">Plan · Execute · Monitor · Govern · Deliver</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="text-sm text-slate-500 mt-1">Access your enterprise project control tower.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input id="email" type="email" required autoComplete="email" className="pl-8 h-10"
                  value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input id="password" type="password" required autoComplete="current-password" className="pl-8 h-10"
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
            )}
            <Button type="submit" disabled={busy} className="w-full h-10 bg-blue-600 hover:bg-blue-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              {busy ? "Authenticating…" : "Sign in securely"}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Demo roles (sandbox)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Executive", email: "ceo@pmct.io" },
                { label: "PMO Admin", email: "pmo@pmct.io" },
                { label: "Project Mgr", email: "pm.sarah@pmct.io" },
                { label: "Team Member", email: "liam@pmct.io" },
              ].map((d) => (
                <button key={d.email} type="button" onClick={() => demo(d.email)}
                  className="text-left rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                  <span className="block text-[11px] font-medium text-slate-700">{d.label}</span>
                  <span className="block text-[10px] text-slate-400">{d.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Password: Pmct@2026 — sandbox only, rotate before production.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Login() { return null; }
