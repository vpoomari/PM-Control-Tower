"use client";
// PM CONTROL TOWER — Futuristic 3D chart primitives (pure SVG, zero extra deps)
// Isometric 3D bars · extruded 3D donut · perspective 3D area · 3D radial gauges ·
// glass command panels. Every chart is resolution-independent, themeable and
// accepts click/hover handlers so charts double as navigation surfaces.

import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/components/pmct/kit";

// ---------- color helpers ----------
/** Darken (amt<0) or lighten (amt>0) a #rrggbb color. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = (i: number) => {
    const c = parseInt(m[i], 16);
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.round(Math.max(0, Math.min(255, v)));
  };
  return `#${[ch(1), ch(2), ch(3)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ================= GLASS COMMAND PANEL =================
export function Panel({
  title, subtitle, actions, children, className, bodyClass, accent = "#22d3ee", icon,
}: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode;
  className?: string; bodyClass?: string; accent?: string; icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-slate-200/80 bg-white/80 backdrop-blur-xl overflow-hidden",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(15,23,42,0.22)]",
        "transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_56px_-20px_rgba(15,23,42,0.3)]",
        className,
      )}
    >
      {/* top accent rail */}
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      {/* HUD corner brackets */}
      <span className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t rounded-tl-md" style={{ borderColor: `${accent}66` }} />
      <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t rounded-tr-md" style={{ borderColor: `${accent}66` }} />
      <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l rounded-bl-md" style={{ borderColor: `${accent}44` }} />
      <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r rounded-br-md" style={{ borderColor: `${accent}44` }} />
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-1">
          <div className="min-w-0">
            {title && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 flex items-center gap-1.5">
                {icon && <span style={{ color: accent }}>{icon}</span>}
                {title}
              </p>
            )}
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("px-4 pb-4 pt-2", bodyClass)}>{children}</div>
    </div>
  );
}

// ================= HOLO STAT TILE =================
export function HoloStat({
  label, value, sub, delta, spark, onClick, hint, accent = "#3b82f6", icon,
}: {
  label: string; value: ReactNode; sub?: ReactNode;
  delta?: { value: number; unit?: string; good?: boolean; label?: string };
  spark?: number[]; onClick?: () => void; hint?: string; accent?: string; icon?: ReactNode;
}) {
  const sparkPath = useMemo(() => {
    if (!spark || spark.length < 2) return null;
    const w = 100, h = 22, pad = 2;
    const min = Math.min(...spark), max = Math.max(...spark), span = max - min || 1;
    const pts = spark.map((v, i) => [pad + (i / (spark.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)] as const);
    return { line: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "), area: `${pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} L${w - pad},${h} L${pad},${h} Z` };
  }, [spark]);

  const body = (
    <>
      <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl" style={{ background: `linear-gradient(90deg, ${accent}, ${shade(accent, 0.45)})` }} />
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${accent}14`, color: accent }}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {delta && (
        <span
          className={cn(
            "mt-1.5 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            delta.good === undefined ? "border-slate-200 bg-slate-50 text-slate-500"
              : delta.good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-600",
          )}
          title={delta.label}
        >
          {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "•"} {Math.abs(delta.value)}{delta.unit ?? ""}
        </span>
      )}
      {sub && <p className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</p>}
      {sparkPath && (
        <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="mt-2 h-6 w-full" aria-hidden="true">
          <defs>
            <linearGradient id={`hs-${accent.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={sparkPath.area} fill={`url(#hs-${accent.replace(/[^a-z0-9]/gi, "")})`} />
          <path d={sparkPath.line} fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint || `Open ${label}`}
        className={cn(
          "ct-tile group relative w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 backdrop-blur-xl p-4 text-left",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-18px_rgba(15,23,42,0.25)]",
          "transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_30px_-8px_rgba(15,23,42,0.28)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className="ct-tile relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 backdrop-blur-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-18px_rgba(15,23,42,0.2)]">{body}</div>;
}

// ================= 3D ISOMETRIC BAR CHART =================
export interface Bar3DGroup { label: string; values: number[]; onClick?: () => void; sublabel?: string }
export interface Bar3DSeriesSpec { label: string; color: string }

export function Bar3D({
  groups, series, height = 250, yMax: yMaxProp, yTicks = 4, format = (v: number) => String(v), className,
}: {
  groups: Bar3DGroup[]; series: Bar3DSeriesSpec[]; height?: number; yMax?: number; yTicks?: number;
  format?: (v: number) => string; className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);
  const W = 640, H = height;
  const px0 = 46, px1 = 628, py0 = 16, py1 = H - 36;
  const rawMax = Math.max(1e-9, ...groups.flatMap((g) => g.values));
  const yMax = yMaxProp ?? rawMax * 1.18;
  const gw = groups.length ? (px1 - px0) / groups.length : px1 - px0;
  const barW = Math.max(8, Math.min(30, (gw - 20) / Math.max(1, series.length) - 5));
  const dx = 7, dy = -5; // isometric depth skew

  if (!groups.length) return <div className={cn("flex items-center justify-center text-xs text-slate-400", className)} style={{ height }}>No data</div>;

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`b3f${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={shade(s.color, 0.28)} />
              <stop offset="100%" stopColor={shade(s.color, -0.18)} />
            </linearGradient>
          ))}
          <filter id={`b3g${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* perspective floor */}
        <g>
          <rect x={px0} y={py1} width={px1 - px0} height={1} fill="#e2e8f0" />
          {Array.from({ length: yTicks + 1 }, (_, t) => {
            const y = py1 - (t / yTicks) * (py1 - py0);
            return (
              <g key={t}>
                <line x1={px0} y1={y} x2={px1} y2={y} stroke="#eef2f7" strokeWidth="1" />
                <text x={px0 - 8} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="#94a3b8" className="tabular-nums">{format((yMax * t) / yTicks)}</text>
              </g>
            );
          })}
          {Array.from({ length: 6 }, (_, k) => (
            <line key={k} x1={px0 + ((k + 1) * (px1 - px0)) / 6} y1={py0} x2={px0 + ((k + 1) * (px1 - px0)) / 6} y2={py1} stroke="#f4f7fb" strokeWidth="1" />
          ))}
        </g>

        {groups.map((g, gi) => {
          const groupSpan = barW * series.length + 5 * (series.length - 1) + dx;
          const x0 = px0 + gi * gw + (gw - groupSpan) / 2;
          const isHoverGroup = hover?.g === gi;
          return (
            <g key={gi}>
              {/* group hover/click surface */}
              <rect
                x={px0 + gi * gw} y={py0 - 8} width={gw} height={py1 - py0 + 30} fill={isHoverGroup ? "#0f172a06" : "transparent"}
                className={g.onClick ? "cursor-pointer" : undefined}
                onClick={g.onClick}
                onMouseEnter={() => setHover((h) => (h?.g === gi ? h : { g: gi, s: h?.s ?? 0 }))}
                onMouseLeave={() => setHover(null)}
              >
                <title>{g.sublabel ? `${g.label} — ${g.sublabel}` : g.label}</title>
              </rect>
              {series.map((s, si) => {
                const v = g.values[si] ?? 0;
                const h = Math.max(2, (Math.min(v, yMax) / yMax) * (py1 - py0));
                const x = x0 + si * (barW + 5);
                const y = py1 - h;
                const isHot = hover?.g === gi && hover?.s === si;
                return (
                  <g key={si} onMouseEnter={() => setHover({ g: gi, s: si })} onMouseLeave={() => setHover(null)} filter={isHot ? `url(#b3g${uid})` : undefined}>
                    {/* base glow */}
                    <ellipse cx={x + barW / 2} cy={py1 + 1} rx={barW * 0.72} ry="3.5" fill={s.color} opacity={isHot ? 0.4 : 0.16} />
                    {/* top face */}
                    <polygon points={`${x},${y} ${x + dx},${y + dy} ${x + barW + dx},${y + dy} ${x + barW},${y}`} fill={shade(s.color, 0.5)} />
                    {/* right face */}
                    <polygon points={`${x + barW},${y} ${x + barW + dx},${y + dy} ${x + barW + dx},${y + h + dy} ${x + barW},${y + h}`} fill={shade(s.color, -0.42)} />
                    {/* front face */}
                    <rect x={x} y={y} width={barW} height={h} fill={`url(#b3f${uid}${si})`} rx="1.5" />
                    {/* top edge highlight */}
                    <rect x={x} y={y} width={barW} height={1.5} fill={shade(s.color, 0.7)} opacity="0.9" rx="1" />
                    {isHot && (
                      <text x={x + barW / 2} y={y - 9 - dy} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0f172a" className="tabular-nums drop-shadow-sm">
                        {format(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* label */}
              <text x={px0 + gi * gw + gw / 2} y={py1 + 16} textAnchor="middle" fontSize="9.5" fill={isHoverGroup ? "#334155" : "#64748b"} fontWeight={isHoverGroup ? 600 : 400}>
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      {/* floating tooltip */}
      {hover && groups[hover.g] && (
        <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg border border-slate-700/60 bg-slate-900/95 px-2.5 py-1.5 text-[10px] text-white shadow-xl">
          <p className="font-semibold">{groups[hover.g].sublabel || groups[hover.g].label}</p>
          {series.map((s, si) => (
            <p key={si} className="flex items-center gap-1.5 tabular-nums">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.label}: <span className="font-semibold">{format(groups[hover.g].values[si] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
      {/* legend */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <span className="h-2 w-2 rounded-[3px]" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}80` }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ================= 3D EXTRUDED DONUT =================
export interface DonutSlice { label: string; value: number; color: string; onClick?: () => void }

export function Donut3D({
  slices, size = 232, depth = 15, centerLabel, centerValue, format = (v: number) => String(v), className,
}: {
  slices: DonutSlice[]; size?: number; depth?: number; centerLabel?: string; centerValue?: string;
  format?: (v: number) => string; className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const cx = size / 2, cy = size / 2 - 2;
  const rx = size * 0.42, ry = size * 0.355;
  const irx = size * 0.26, iry = size * 0.215;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const pad = 0.022;

  const pt = (px: number, py: number, rxr: number, ryr: number, a: number) =>
    [px + rxr * Math.cos(a), py + ryr * Math.sin(a)] as const;
  const seg = (px: number, py: number, a0: number, a1: number, lift: number) => {
    const [x0, y0] = pt(px, py, rx, ry, a0);
    const [x1, y1] = pt(px, py, rx, ry, a1);
    const [ix1, iy1] = pt(px, py, irx, iry, a1);
    const [ix0, iy0] = pt(px, py, irx, iry, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)},${(y0 + lift).toFixed(2)} A${rx},${ry} 0 ${large} 1 ${x1.toFixed(2)},${(y1 + lift).toFixed(2)} L${ix1.toFixed(2)},${(iy1 + lift).toFixed(2)} A${irx},${iry} 0 ${large} 0 ${ix0.toFixed(2)},${(iy0 + lift).toFixed(2)} Z`;
  };

  const arcs = useMemo(() => {
    if (!total) return [] as { a0: number; a1: number; slice: DonutSlice; idx: number }[];
    let a = -Math.PI / 2;
    return slices.map((slice, idx) => {
      const frac = Math.max(0, slice.value) / total;
      const sweep = frac * Math.PI * 2;
      const a0 = a + (sweep > pad * 2 ? pad : 0);
      const a1 = a + sweep - (sweep > pad * 2 ? pad : 0);
      a += sweep;
      return { a0, a1, slice, idx };
    }).filter((x) => x.a1 > x.a0);
  }, [slices, total]);

  if (!total) return <div className={cn("flex items-center justify-center text-xs text-slate-400", className)} style={{ height: size }}>No data</div>;
  const singleFull = arcs.length === 1 && arcs[0].a1 - arcs[0].a0 >= Math.PI * 1.99;

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <svg viewBox={`0 0 ${size} ${size + depth + 6}`} width={size} height={size + depth + 6} role="img">
        <defs>
          {slices.map((s, i) => (
            <linearGradient key={i} id={`d3${uid}${i}`} x1="0" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor={shade(s.color, 0.42)} />
              <stop offset="100%" stopColor={shade(s.color, -0.12)} />
            </linearGradient>
          ))}
          <filter id={`d3s${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* extruded bottom ring (shadow body) */}
        <g>
          {singleFull ? (
            <ellipse cx={cx} cy={cy + depth} rx={rx} ry={ry} fill="#0f172a" opacity="0.2" />
          ) : arcs.map(({ a0, a1, slice, idx }) => (
            <path key={idx} d={seg(cx, cy, a0, a1, depth)} fill={shade(slice.color, -0.55)} />
          ))}
        </g>
        {/* connector wall for the leading edge (cylinder side) */}
        {!singleFull && arcs.map(({ a1, slice, idx }) => {
          const [ox, oy] = pt(cx, cy, rx, ry, a1);
          const [ix, iy] = pt(cx, cy, irx, iry, a1);
          return <path key={`w${idx}`} d={`M${ox.toFixed(2)},${oy.toFixed(2)} L${ox.toFixed(2)},${(oy + depth).toFixed(2)} L${ix.toFixed(2)},${(iy + depth).toFixed(2)} L${ix.toFixed(2)},${iy.toFixed(2)} Z`} fill={shade(slice.color, -0.3)} />;
        })}
        {/* top face */}
        <g filter={`url(#d3s${uid})`}>
          {singleFull ? (
            <path d={seg(cx, cy, -Math.PI / 2, Math.PI * 1.5, 0)} fill={`url(#d3${uid}0)`} />
          ) : arcs.map(({ a0, a1, slice, idx }) => (
            <path
              key={idx}
              d={seg(cx, cy, a0, a1, 0)}
              fill={`url(#d3${uid}${idx})`}
              className={slice.onClick ? "cursor-pointer" : undefined}
              opacity={hover === null || hover === idx ? 1 : 0.55}
              onMouseEnter={() => setHover(idx)}
              onMouseLeave={() => setHover(null)}
              onClick={slice.onClick}
            >
              <title>{`${slice.label}: ${format(slice.value)} (${total ? Math.round((slice.value / total) * 100) : 0}%)`}</title>
            </path>
          ))}
        </g>
        {/* inner rim highlight */}
        <ellipse cx={cx} cy={cy} rx={irx} ry={iry} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.5" />
        {/* center readout */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="21" fontWeight="700" fill="#0f172a" className="tabular-nums">
          {centerValue ?? format(total)}
        </text>
        {centerLabel && <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8.5" fill="#94a3b8" letterSpacing="1.4">{centerLabel.toUpperCase()}</text>}
      </svg>
      <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5">
        {slices.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={s.onClick}
            className={cn("flex items-center gap-1.5 rounded px-1 py-0.5 text-[10.5px] transition-colors", s.onClick ? "text-slate-600 hover:bg-slate-100" : "text-slate-500", hover === i && "bg-slate-100")}
          >
            <span className="h-2 w-2 rounded-[3px]" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}99` }} />
            {s.label}
            <span className="font-semibold tabular-nums text-slate-700">{format(s.value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= 3D PERSPECTIVE AREA CHART =================
export function Area3D({
  points, height = 230, color = "#22d3ee", color2, label, format = (v: number) => String(v), className,
}: {
  points: { label: string; value: number }[]; height?: number; color?: string; color2?: string;
  label?: string; format?: (v: number) => string; className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height;
  const px0 = 46, px1 = 630, py0 = 18, py1 = H - 42;
  const c2 = color2 ?? shade(color, -0.35);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const max = Math.max(...points.map((p) => p.value), 1e-9);
    const yMax = max * 1.2;
    const xs = (i: number) => px0 + (i / (points.length - 1)) * (px1 - px0);
    const ys = (v: number) => py1 - (Math.min(v, yMax) / yMax) * (py1 - py0);
    const pts = points.map((p, i) => [xs(i), ys(p.value)] as const);
    // smooth cubic path (Catmull-Rom → bezier)
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return { yMax, pts, line: d, area: `${d} L${px1},${py1} L${px0},${py1} Z` };
  }, [points]);

  if (!geom) return <div className={cn("flex items-center justify-center text-xs text-slate-400", className)} style={{ height }}>Not enough data</div>;
  const labelEvery = Math.max(1, Math.ceil(points.length / 9));

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img">
        <defs>
          <linearGradient id={`a3${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`a3s${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c2} stopOpacity="0.16" />
            <stop offset="100%" stopColor={c2} stopOpacity="0" />
          </linearGradient>
          <filter id={`a3g${uid}`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* grid */}
        {Array.from({ length: 5 }, (_, t) => {
          const y = py1 - (t / 4) * (py1 - py0);
          return (
            <g key={t}>
              <line x1={px0} y1={y} x2={px1} y2={y} stroke="#eef2f7" strokeWidth="1" />
              <text x={px0 - 8} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="#94a3b8" className="tabular-nums">{format((geom.yMax * t) / 4)}</text>
            </g>
          );
        })}
        {/* perspective floor lines */}
        {Array.from({ length: 5 }, (_, k) => (
          <line key={k} x1={px0 + ((k + 1) * (px1 - px0)) / 5} y1={py0} x2={px0 + ((k + 1) * (px1 - px0)) / 5} y2={py1} stroke="#f4f7fb" strokeWidth="1" />
        ))}
        {/* depth shadow copy */}
        <path d={geom.area} fill={`url(#a3s${uid})`} transform="translate(0,10)" />
        {/* main area + line */}
        <path d={geom.area} fill={`url(#a3${uid})`} />
        <path d={geom.line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" filter={`url(#a3g${uid})`} />
        {/* points */}
        {geom.pts.map(([x, y], i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x - 12} y={py0 - 6} width={24} height={py1 - py0 + 16} fill="transparent" />
            <circle cx={x} cy={y} r={hover === i ? 5 : 3.2} fill="#fff" stroke={color} strokeWidth={hover === i ? 3 : 2} />
            {hover === i && (
              <g>
                <line x1={x} y1={y} x2={x} y2={py1} stroke={color} strokeOpacity="0.35" strokeDasharray="3 3" />
                <rect x={Math.min(Math.max(x - 44, 4), W - 92)} y={y - 34} width="88" height="24" rx="6" fill="#0f172a" />
                <text x={Math.min(Math.max(x - 44, 4), W - 92) + 44} y={y - 18.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" className="tabular-nums">
                  {format(points[i].value)}
                </text>
              </g>
            )}
          </g>
        ))}
        {/* baseline + x labels */}
        <line x1={px0} y1={py1} x2={px1} y2={py1} stroke="#e2e8f0" strokeWidth="1" />
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={geom.pts[i][0]} y={py1 + 16} textAnchor="middle" fontSize="9" fill={hover === i ? "#334155" : "#94a3b8"}>
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      {label && <p className="mt-0.5 text-center text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</p>}
    </div>
  );
}

// ================= 3D RADIAL GAUGE =================
export function Gauge3D({
  value, max = 1.5, label, sublabel, goodAt = 0.95, format = (v: number) => v.toFixed(2), size = 190, className,
}: {
  value: number; max?: number; label: string; sublabel?: string; goodAt?: number;
  format?: (v: number) => string; size?: number; className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const W = size, H = size * 0.72;
  const cx = W / 2, cy = H * 0.92;
  const R = size * 0.38, thick = size * 0.085;
  const frac = Math.max(0, Math.min(1, value / max));
  const a0 = Math.PI, a1 = Math.PI + frac * Math.PI;
  const depth = 9;

  const arcPath = (s: number, e: number, r: number) => {
    const x0 = cx + r * Math.cos(s), y0 = cy + r * Math.sin(s);
    const x1 = cx + r * Math.cos(e), y1 = cy + r * Math.sin(e);
    const large = e - s > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };

  const stateColor = value >= goodAt ? "#10b981" : value >= goodAt * 0.85 ? "#f59e0b" : "#f43f5e";
  const safe = Number.isFinite(value);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg viewBox={`0 0 ${W} ${H + 4}`} width={W} height={H + 4} role="img">
        <defs>
          <linearGradient id={`g3${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={shade(stateColor, 0.3)} />
            <stop offset="100%" stopColor={shade(stateColor, -0.15)} />
          </linearGradient>
          <filter id={`g3b${uid}`} x="-30%" y="-30%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* extruded body under the value arc */}
        <path d={arcPath(a0, Math.max(a0 + 0.001, a1), R)} fill="none" stroke={shade(stateColor, -0.5)} strokeWidth={thick} strokeLinecap="round" transform={`translate(0,${depth})`} />
        <path d={arcPath(a0, Math.PI * 2, R)} fill="none" stroke="#e8edf5" strokeWidth={thick} strokeLinecap="round" transform={`translate(0,${depth})`} />
        {/* track */}
        <path d={arcPath(a0, Math.PI * 2, R)} fill="none" stroke="#eef2f8" strokeWidth={thick} strokeLinecap="round" />
        {/* value arc */}
        {safe && frac > 0.004 && (
          <path d={arcPath(a0, a1, R)} fill="none" stroke={`url(#g3${uid})`} strokeWidth={thick} strokeLinecap="round" filter={`url(#g3b${uid})`} />
        )}
        {/* target tick at goodAt */}
        {(() => {
          const ta = Math.PI + Math.min(1, goodAt / max) * Math.PI;
          const ix = cx + (R - thick / 2 - 3) * Math.cos(ta), iy = cy + (R - thick / 2 - 3) * Math.sin(ta);
          const ox = cx + (R + thick / 2 + 3) * Math.cos(ta), oy = cy + (R + thick / 2 + 3) * Math.sin(ta);
          return <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="#94a3b8" strokeWidth="1.6" strokeDasharray="2 2" />;
        })()}
        {/* needle hub */}
        <circle cx={cx} cy={cy} r={thick * 0.44} fill="#fff" stroke={stateColor} strokeWidth="2" />
        <circle cx={cx} cy={cy} r={thick * 0.16} fill={stateColor} />
        {/* readout */}
        <text x={cx} y={cy - R * 0.34} textAnchor="middle" fontSize={size * 0.135} fontWeight="700" fill="#0f172a" className="tabular-nums">
          {safe ? format(value) : "—"}
        </text>
        <text x={cx} y={cy - R * 0.12} textAnchor="middle" fontSize="8.5" fill="#94a3b8" letterSpacing="1.3">{label.toUpperCase()}</text>
      </svg>
      {sublabel && <p className="mt-0.5 text-[10px] text-slate-400">{sublabel}</p>}
    </div>
  );
}
