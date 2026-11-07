"use client";

import { cn } from "@/lib/utils";

/**
 * Local brand assets (public/brand/), sourced from both companies' websites:
 * - Czarnikow: blue "CZ" mark (czarnikow.com site logo/favicon)
 * - Optinus Solutions: wordmark + ring mark (optinus-solutions.com)
 * The wordmark ships in two colorways — dark-surface ("Optinus" in white) and
 * light-surface ("Optinus" recolored slate-900) — so it stays legible on both.
 */
export const BRAND_ASSETS = {
  czarnikow: "/brand/czarnikow.png",
  optinusDarkSurface: "/brand/optinus-dark.png",
  optinusLightSurface: "/brand/optinus-light.png",
  optinusRing: "/brand/optinus-ring.png",
  lockup: "/brand/czarnikow-x-optinus.png",
  controlTower: "/brand/control-tower.svg",
  controlTowerLogo: "/brand/control-tower-logo.jpg",
} as const;

/** A purpose-built PM Tower co-brand mark for the Czarnikow × Optinus workspace. */
export function PmTowerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("shrink-0", className)} fill="none">
      <path d="M24 3 4 24l20 21 20-21L24 3Z" fill="url(#pm-tower-cyan)" />
      <path d="m24 12 11 12-11 12-11-12 11-12Z" fill="#fff" fillOpacity=".95" />
      <path d="m24 18 5.5 6L24 30l-5.5-6 5.5-6Z" fill="url(#pm-tower-indigo)" />
      <defs>
        <linearGradient id="pm-tower-cyan" x1="4" y1="5" x2="44" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2AAADE" /><stop offset="1" stopColor="#087FAF" />
        </linearGradient>
        <linearGradient id="pm-tower-indigo" x1="18" y1="18" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6658EA" /><stop offset="1" stopColor="#9D65D9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PmTowerBrand({ compact = false, light = false, className }: { compact?: boolean; light?: boolean; className?: string }) {
  const primary = light ? "text-white" : "text-slate-950";
  const secondary = light ? "text-white/60" : "text-slate-500";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <PmTowerMark className="h-9 w-9" />
      {!compact && (
        <div className="min-w-0 leading-none">
          <p className={cn("text-[13px] font-bold tracking-[0.12em]", primary)}>PM TOWER</p>
          <div className="mt-1.5 flex items-center gap-1.5" aria-label="Czarnikow and Optinus Solutions">
            <img
              src={BRAND_ASSETS.czarnikow}
              alt="Czarnikow"
              className="h-3.5 w-3.5 rounded-[3px] object-contain"
            />
            <span className={cn("text-[8px] font-bold tracking-[0.12em]", secondary)}>CZARNIKOW</span>
            <span className="text-[9px] font-semibold text-[#2aaade]">×</span>
            <img
              src={light ? BRAND_ASSETS.optinusDarkSurface : BRAND_ASSETS.optinusLightSurface}
              alt="Optinus Solutions"
              className="h-3.5 w-auto max-w-24 object-contain object-left"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Control Tower brand mark — the primary identity of the platform.
 * A glossy 3D tower (electric-blue center column flanked by vibrant purple and
 * magenta towers) rising from a glowing cyan pedestal, in front of a dark
 * dashboard tile with a rising chart, all wrapped in a rainbow gradient swoosh.
 * Pure inline SVG (no raster assets) so it stays crisp at any size.
 */
export function ControlTowerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("shrink-0", className)} fill="none">
      <defs>
        <linearGradient id="ctw-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6FA8FF" />
          <stop offset="100%" stopColor="#2864FF" />
        </linearGradient>
        <linearGradient id="ctw-purple" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B077FF" />
          <stop offset="100%" stopColor="#7A2BF0" />
        </linearGradient>
        <linearGradient id="ctw-magenta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF7AC5" />
          <stop offset="100%" stopColor="#EE2197" />
        </linearGradient>
        <linearGradient id="ctw-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E3160" />
          <stop offset="100%" stopColor="#0C1533" />
        </linearGradient>
        <linearGradient id="ctw-swoosh" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#00D9FF" />
          <stop offset="25%" stopColor="#2864FF" />
          <stop offset="50%" stopColor="#843BFF" />
          <stop offset="72%" stopColor="#F52AA8" />
          <stop offset="88%" stopColor="#FF8A24" />
          <stop offset="100%" stopColor="#FFD43B" />
        </linearGradient>
        <linearGradient id="ctw-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFD43B" />
          <stop offset="100%" stopColor="#FF8A24" />
        </linearGradient>
        <linearGradient id="ctw-cyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8FEEFF" />
          <stop offset="100%" stopColor="#00B4F5" />
        </linearGradient>
        <radialGradient id="ctw-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#00D9FF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00D9FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ambient glow */}
      <circle cx="32" cy="28" r="27" fill="url(#ctw-glow)" />

      {/* rainbow swoosh arc (behind the card) */}
      <path d="M10 44A26 26 0 1 1 54 44" stroke="url(#ctw-swoosh)" strokeWidth="5.5" strokeLinecap="round" />
      {/* sparkles */}
      <path d="M52.5 10.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" fill="#FFF3B0" />
      <path d="M10.8 18.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6Z" fill="#BFEFFF" />

      {/* dashboard tile */}
      <rect x="11" y="12" width="42" height="30" rx="4" fill="url(#ctw-card)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />

      {/* bar chart inside the tile */}
      <rect x="14.5" y="25" width="3" height="5" rx="1" fill="#00C4F0" />
      <rect x="18.5" y="21.5" width="3" height="8.5" rx="1" fill="#2E7BFF" />
      <rect x="22.5" y="18" width="3" height="12" rx="1" fill="#00D9FF" />

      {/* rising line chart with arrow */}
      <path d="M36.5 25l3-3.5 3 1.5 4.5-6" stroke="url(#ctw-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45.2 15.6l2.4-1.2-.3 2.7-2.1-1.5Z" fill="#FFD43B" />

      {/* left tower — vibrant purple */}
      <path d="M21 33l2-2h6l-2 2Z" fill="#C79BFF" />
      <path d="M27.5 33l2-2v22.5l-2 .5Z" fill="#5B1FB8" />
      <rect x="21" y="33" width="6.5" height="23" fill="url(#ctw-purple)" />

      {/* right tower — magenta */}
      <path d="M36 28l2-2h6l-2 2Z" fill="#FFA8D9" />
      <path d="M42.5 28l2-2v27.5l-2 .5Z" fill="#B01071" />
      <rect x="36" y="28" width="6.5" height="28" fill="url(#ctw-magenta)" />

      {/* center tower — electric blue (tallest) */}
      <path d="M28 19l2.5-2.5h7L35 19Z" fill="#A9CBFF" />
      <path d="M35 19l2.5-2.5v36.5L35 56Z" fill="#1E50C8" />
      <rect x="28" y="19" width="7" height="37" fill="url(#ctw-blue)" />
      {/* windows */}
      <rect x="30.2" y="23" width="2" height="2.6" rx="0.5" fill="rgba(255,255,255,0.85)" />
      <rect x="30.2" y="28" width="2" height="2.6" rx="0.5" fill="rgba(255,255,255,0.85)" />
      <rect x="30.2" y="33" width="2" height="2.6" rx="0.5" fill="rgba(255,255,255,0.85)" />

      {/* glowing pedestal */}
      <ellipse cx="32" cy="57" rx="14" ry="3.4" fill="url(#ctw-cyan)" opacity="0.9" />
      <ellipse cx="32" cy="57" rx="9" ry="2" fill="#CFF6FF" opacity="0.7" />
    </svg>
  );
}

/**
 * Control Tower lockup: mark + "Control Tower" wordmark (gradient "Tower") +
 * CZ × Optinus co-brand row. `light` = rendering on a dark surface.
 */
export function ControlTowerBrand({ compact = false, light = false, className }: { compact?: boolean; light?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <ControlTowerMark className="h-9 w-9" />
      {!compact && (
        <div className="min-w-0 leading-none">
          <p className="text-[13.5px] font-extrabold tracking-[0.05em] whitespace-nowrap">
            <span className={light ? "text-white" : "text-slate-900"}>Control</span>{" "}
            <span className="ct-wordmark-grad">Tower</span>
          </p>
          {light && (
            <p className="mt-1 text-[7px] font-semibold uppercase tracking-[0.2em] text-white/45">
              Plan · Execute · Track · Deliver
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-1.5" aria-label="Czarnikow and Optinus Solutions">
            <img
              src={BRAND_ASSETS.czarnikow}
              alt="Czarnikow"
              className="h-3.5 w-3.5 rounded-[3px] object-contain"
            />
            <span className={cn("text-[8px] font-bold tracking-[0.12em]", light ? "text-white/60" : "text-slate-500")}>CZARNIKOW</span>
            <span className="text-[9px] font-semibold text-[#2aaade]">×</span>
            <img
              src={light ? BRAND_ASSETS.optinusDarkSurface : BRAND_ASSETS.optinusLightSurface}
              alt="Optinus Solutions"
              className="h-3.5 w-auto max-w-24 object-contain object-left"
            />
          </div>
        </div>
      )}
    </div>
  );
}
