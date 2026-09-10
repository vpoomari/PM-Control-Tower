"use client";
// PM CONTROL TOWER — Design system primitives (premium enterprise, blue/navy foundation)

import { ReactNode, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Inbox, AlertTriangle, Loader2, Search, ChevronRight } from "lucide-react";
import { ImportExportButtons } from "@/components/pmct/io-buttons";

// ---- Brand tokens ----
export const BRAND = {
  navy: "#0b1f3a",
  navyLight: "#13325c",
  accent: "#2563eb",
  sky: "#38bdf8",
};

export const RAG_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  GREEN: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", label: "Green" },
  AMBER: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-500", label: "Amber" },
  RED: { bg: "bg-red-50 border-red-200", text: "text-red-700", dot: "bg-red-500", label: "Red" },
};

export function ragOf(score: number): "GREEN" | "AMBER" | "RED" {
  return score >= 80 ? "GREEN" : score >= 60 ? "AMBER" : "RED";
}

// ---- Page header ----
export function PageHeader({ title, subtitle, actions, breadcrumb, io }: {
  title: string; subtitle?: string; actions?: ReactNode; breadcrumb?: string[];
  io?: string; // entity key → renders the Import/Export dropdown (see lib/io/entities)
}) {
  return (
    <div className="mb-5">
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
              <span className={i === breadcrumb.length - 1 ? "text-slate-700 font-medium" : ""}>{b}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5 max-w-3xl">{subtitle}</p>}
        </div>
        {(actions || io) && (
          <div className="flex items-center gap-2 flex-wrap">
            {io && <ImportExportButtons entity={io} />}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Stat card ----
export function StatCard({ label, value, sub, tone, icon }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "warn" | "bad" | "info"; icon?: ReactNode;
}) {
  const tones: Record<string, string> = {
    default: "text-slate-900", good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600", info: "text-blue-600",
  };
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          {icon && <span className="text-slate-300">{icon}</span>}
        </div>
        <p className={cn("text-2xl font-semibold mt-1 tabular-nums", tone ? tones[tone] : tones.default)}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---- RAG badge / status chip ----
export function RagBadge({ rag, score }: { rag: string; score?: number }) {
  const s = RAG_STYLES[rag] || RAG_STYLES.GREEN;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", s.bg, s.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}{score !== undefined && <span className="tabular-nums opacity-70">{Math.round(score)}</span>}
    </span>
  );
}

const CHIP_TONES: Record<string, string> = {
  ACTIVE: "bg-blue-50 text-blue-700 border-blue-200", DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200", IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  NOT_STARTED: "bg-slate-100 text-slate-600 border-slate-200", BLOCKED: "bg-red-50 text-red-700 border-red-200",
  ON_HOLD: "bg-amber-50 text-amber-700 border-amber-200", CANCELLED: "bg-slate-100 text-slate-400 border-slate-200",
  PENDING: "bg-slate-100 text-slate-600 border-slate-200", APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200", SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200",
  UNDER_REVIEW: "bg-amber-50 text-amber-700 border-amber-200", LOCKED: "bg-slate-800 text-slate-100 border-slate-800",
  OPEN: "bg-amber-50 text-amber-700 border-amber-200", MITIGATING: "bg-blue-50 text-blue-700 border-blue-200",
  ESCALATED: "bg-red-50 text-red-700 border-red-200", CLOSED: "bg-slate-100 text-slate-500 border-slate-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200", PASSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200", CONDITIONAL: "bg-amber-50 text-amber-700 border-amber-200",
  DEFERRED: "bg-slate-100 text-slate-600 border-slate-200", CONNECTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DISCONNECTED: "bg-slate-100 text-slate-500 border-slate-200", CONFIGURING: "bg-amber-50 text-amber-700 border-amber-200",
  NEW: "bg-blue-50 text-blue-700 border-blue-200", ACKNOWLEDGED: "bg-amber-50 text-amber-700 border-amber-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200", HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200", LOW: "bg-slate-100 text-slate-600 border-slate-200",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200", INFO: "bg-blue-50 text-blue-700 border-blue-200",
  VALID: "bg-emerald-50 text-emerald-700 border-emerald-200", AT_RISK: "bg-amber-50 text-amber-700 border-amber-200",
  INVALID: "bg-red-50 text-red-700 border-red-200", DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IMPLEMENTED: "bg-emerald-50 text-emerald-700 border-emerald-200", ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-200", TESTING: "bg-blue-50 text-blue-700 border-blue-200",
  EXECUTION: "bg-blue-50 text-blue-700 border-blue-200", INITIATION: "bg-slate-100 text-slate-600 border-slate-200",
  SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200", PAUSED: "bg-slate-100 text-slate-500 border-slate-200",
  SUPERSEDED: "bg-slate-100 text-slate-400 border-slate-200", BASELINED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function StatusChip({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const tone = CHIP_TONES[status] || "bg-slate-100 text-slate-600 border-slate-200";
  const label = status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant="outline" className={cn("font-medium", tone, className)}>{label}</Badge>;
}

export function SeverityDot({ severity }: { severity: string }) {
  const color = severity === "CRITICAL" ? "bg-red-500" : severity === "WARNING" ? "bg-amber-500" : "bg-blue-500";
  return <span className={cn("inline-block h-2 w-2 rounded-full mr-1.5", color)} />;
}

// ---- Section card ----
export function SectionCard({ title, description, actions, children, className, bodyClass }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <Card className={cn("border-slate-200 shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <CardContent className={cn("p-4", bodyClass)}>{children}</CardContent>
    </Card>
  );
}

// ---- Toolbar ----
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 mb-4", className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Search…"} className="pl-8 h-9 bg-white" />
    </div>
  );
}

// ---- States ----
export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin mb-2 text-blue-500" />
      <p className="text-sm">{label || "Loading…"}</p>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="h-7 w-7 text-red-400 mb-2" />
      <p className="text-sm font-medium text-slate-700">{message}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Inbox className="h-5 w-5 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}

// ---- Progress ----
export function ProgressBar({ value, className, tone }: { value: number; className?: string; tone?: "auto" | "blue" }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = tone === "blue" ? "bg-blue-500" : v >= 80 ? "bg-emerald-500" : v >= 40 ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-slate-100 overflow-hidden", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

// ---- Data table ----
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}
export function DataTable<T extends Record<string, unknown>>({
  columns, rows, keyField, onRowClick, emptyTitle, emptyDescription, className, maxHeight,
}: {
  columns: Column<T>[]; rows: T[]; keyField: string; onRowClick?: (row: T) => void;
  emptyTitle?: string; emptyDescription?: string; className?: string; maxHeight?: string;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle || "No records"} description={emptyDescription} />;
  return (
    <div className={cn("rounded-lg border border-slate-200 overflow-auto bg-white", className)} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-[1]">
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((c) => (
              <th key={c.key} className={cn("text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide", c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={String(row[keyField])}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("border-b border-slate-100 last:border-0", onRowClick && "cursor-pointer hover:bg-blue-50/40")}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2.5 text-slate-700 align-middle", c.className)}>
                  {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Confirm ----
export function ConfirmButton({ onConfirm, children, title, description, confirmLabel, variant = "default", size = "sm", className }: {
  onConfirm: () => void; children: ReactNode; title: string; description?: string; confirmLabel?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"; size?: "default" | "sm" | "lg" | "icon"; className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {typeof children === "object" ? children : <Button variant={variant} size={size} className={className}>{children}</Button>}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel || "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Metric ----
export function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", tone || "text-slate-800")}>{value}</span>
    </div>
  );
}

export { Button, Card, Badge, Input, cn };
