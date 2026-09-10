"use client";
// PM CONTROL TOWER — Shared drawer (Sheet-based) for Connect & Administration views

import { ReactNode } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

export function Drawer({ open, onOpenChange, title, description, children, wide }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={`p-0 flex flex-col ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <SheetHeader className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 space-y-1">
          <SheetTitle className="text-base font-semibold text-slate-900">{title}</SheetTitle>
          {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function DrawerSection({ title, children, actions }: {
  title: string; children: ReactNode; actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        {actions}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs font-medium text-slate-700 text-right break-all">{children}</span>
    </div>
  );
}
