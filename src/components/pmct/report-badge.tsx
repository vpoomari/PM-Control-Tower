// PM CONTROL TOWER — Report status badge (LIVE / ROADMAP) shared by the PMO
// Analytics hub and report pages.

export function ReportStatusBadge({ status }: { status: "live" | "roadmap" }) {
  if (status === "live") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      Roadmap
    </span>
  );
}
