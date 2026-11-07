"use client";
// PM CONTROL TOWER — secure sign-in. Product title centered; partner identities
// are balanced at the lower left/right. No Control Tower image or left promo panel.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Lock, Mail } from "lucide-react";
import { BRAND_ASSETS } from "@/components/pmct/brand";

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

  const demo = (value: string) => { setEmail(value); setPassword("Pmct@2026"); };

  return (
    <main className="ct-login relative isolate flex min-h-screen flex-col overflow-hidden bg-[#f3f6fa] text-slate-900 selection:bg-sky-100">
      {/* Quiet ambient light and a low-contrast grid create depth without a promotional side panel. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[34rem] w-[48rem] -translate-x-1/2 rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(ellipse, rgba(42,170,222,.15), rgba(255,255,255,0) 68%)" }} />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "linear-gradient(rgba(15,35,60,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,35,60,.035) 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "linear-gradient(to bottom, black, transparent 75%)" }} />
      </div>

      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-16">
        <div className="w-full max-w-[430px]">
          {/* Center identity: product name only, deliberately text-only. */}
          <header className="mb-8 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">Enterprise project management</p>
            <h1 className="mt-3 text-[2.45rem] font-semibold leading-none tracking-[-0.055em] text-[#10243a] sm:text-[2.8rem]">Control Tower</h1>
            <div aria-hidden="true" className="mx-auto mt-5 h-[3px] w-12 rounded-full bg-gradient-to-r from-[#087faf] to-[#2aaade]" />
          </header>

          <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_70px_-35px_rgba(16,36,58,.28)] ring-1 ring-white sm:p-8" aria-labelledby="sign-in-heading">
            <div className="mb-6">
              <h2 id="sign-in-heading" className="text-lg font-semibold tracking-tight text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">Use your work account to access the secure workspace.</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">Work email</Label>
                <div className="relative">
                  <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  {/* Password managers/SSO extensions inject attributes before hydration. */}
                  <Input id="email" type="email" required autoComplete="email" suppressHydrationWarning className="h-11 rounded-lg border-slate-200 bg-white pl-10 text-sm shadow-none focus-visible:ring-[#087faf]/30"
                    value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-slate-700">Password</Label>
                <div className="relative">
                  <Lock aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input id="password" type="password" required autoComplete="current-password" suppressHydrationWarning className="h-11 rounded-lg border-slate-200 bg-white pl-10 text-sm shadow-none focus-visible:ring-[#087faf]/30"
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
                </div>
              </div>
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700">{error}</div>}
              <Button type="submit" disabled={busy} className="mt-1 h-11 w-full rounded-lg bg-[#087faf] text-sm font-semibold shadow-sm transition-colors hover:bg-[#06698f] focus-visible:ring-2 focus-visible:ring-[#087faf]/40 focus-visible:ring-offset-2">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                {busy ? "Authenticating…" : "Sign in securely"}
              </Button>
            </form>

            <details className="group mt-6 border-t border-slate-100 pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-slate-500 outline-none transition-colors hover:text-slate-800 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#087faf]/40 [&::-webkit-details-marker]:hidden">
                Sandbox demo access
                <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Executive", email: "ceo@pmct.io" },
                    { label: "PMO Admin", email: "pmo@pmct.io" },
                    { label: "Project Manager", email: "pm.sarah@pmct.io" },
                    { label: "Team Member", email: "liam@pmct.io" },
                  ].map((demoUser) => (
                    <button key={demoUser.email} type="button" onClick={() => demo(demoUser.email)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087faf]/40">
                      <span className="block text-[11px] font-medium text-slate-700">{demoUser.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">{demoUser.email}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px] leading-relaxed text-slate-400">Password: Pmct@2026 · Sandbox only; rotate before production.</p>
              </div>
            </details>
          </section>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Protected enterprise workspace
          </p>
        </div>
      </section>

      {/* Separate partner identities, aligned to opposite sides of the footer. */}
      <footer className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 pb-5 pt-2 sm:gap-6 sm:px-10 sm:pb-7 lg:px-14">
        <div className="flex min-h-10 items-center" aria-label="Optinus Solutions">
          <img src={BRAND_ASSETS.optinusLightSurface} alt="Optinus Solutions" className="h-auto w-[150px] object-contain object-left sm:w-[205px]" />
        </div>
        <div className="flex min-h-10 items-center gap-2 sm:gap-2.5" aria-label="Czarnikow Group">
          <img src={BRAND_ASSETS.czarnikow} alt="Czarnikow Group logo" className="h-7 w-7 rounded-md object-contain sm:h-9 sm:w-9" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600 sm:text-[11px] sm:tracking-[0.18em]">Czarnikow Group</span>
        </div>
      </footer>
    </main>
  );
}

export default function Login() { return null; }
