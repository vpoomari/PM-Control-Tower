// PM CONTROL TOWER — Analytics Engine: Quality, Risk & Closure module (GOVERN pillar).
// 10 reports: risk exposure trend, CoQ, defect density, UAT coverage, mitigation
// ROI, CSAT (roadmap), time-to-value, PIR scorecard, benefits realization,
// lessons learned (roadmap).

import { round2, dayNum } from "../../constants";
import { AnalyticsContext } from "../context";
import { RawPayload, BRAND } from "../types";
import { coqShares, heatBand, ratePct, riskExposure as computeExposure } from "../formulas";

const dateStr = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

// 41. RISK EXPOSURE TREND — current exposure + register trend from health snapshots.
export function riskExposure(ctx: AnalyticsContext): RawPayload {
  const exposure = computeExposure(ctx.risks);
  const trend = ctx.healthSnapshots.map((h) => ({ label: dateStr(h.capturedAt).slice(0, 7), value: h.openRisks })).filter((p) => p.value > 0);
  const bands = new Map<string, number>();
  for (const r of ctx.risks) {
    if (r.status === "CLOSED") continue;
    const b = heatBand(r.score || r.probability * r.impact);
    bands.set(b, (bands.get(b) ?? 0) + 1);
  }
  const bandColors: Record<string, string> = { LOW: BRAND.emerald, MEDIUM: BRAND.yellow, HIGH: BRAND.orange, SEVERE: BRAND.coral };
  const byCategory = new Map<string, number>();
  for (const r of ctx.risks) {
    if (r.status === "CLOSED") continue;
    byCategory.set(r.category || "OTHER", (byCategory.get(r.category || "OTHER") ?? 0) + (r.score || r.probability * r.impact));
  }
  return {
    kpis: [
      { label: "Gross exposure", value: exposure.gross, format: "number", sub: "Σ score, open risks" },
      { label: "Residual exposure", value: exposure.residual, format: "number", tone: exposure.residual < exposure.gross ? "good" : "info", sub: "after response plans" },
      { label: "Open risks", value: exposure.open, format: "count" },
      { label: "Severe", value: bands.get("SEVERE") ?? 0, format: "count", tone: (bands.get("SEVERE") ?? 0) > 0 ? "bad" : "good" },
    ],
    charts: [
      trend.length > 1 ? { kind: "area", title: "Open risk count trend", points: trend, color: BRAND.coral, format: "count" } : null,
      bands.size ? { kind: "donut", title: "Exposure by heat band", centerLabel: "Risks", slices: [...bands.entries()].map(([label, value]) => ({ label, value, color: bandColors[label] })) } : null,
      byCategory.size ? { kind: "bar", title: "Exposure score by category", series: [{ label: "Score", color: BRAND.magenta }], groups: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, values: [value] })), format: "number" } : null,
    ].filter(Boolean) as RawPayload["charts"],
    tables: [],
    notes: ["Trend from ProjectHealthSnapshot.openRisks (bi-weekly captures); exposure = Σ probability × impact of open register rows."],
  };
}

// 42. COST OF QUALITY — prevention/appraisal/failure split (count-based proxy).
export function costOfQuality(ctx: AnalyticsContext): RawPayload {
  const kinds: Record<string, number> = { PREVENTION: 0, APPRAISAL: 0, INTERNAL_FAILURE: 0, EXTERNAL_FAILURE: 0 };
  for (const q of ctx.qualityRecords) {
    const t = (q.recordType || "").toUpperCase();
    const result = (q.result || "").toUpperCase();
    if (/PREVENT|TRAIN|AUDIT_PLAN|PROCES/.test(t)) kinds.PREVENTION += 1;
    else if (/FAIL|REJECT|DEFECT|REWORK/.test(t) || result === "FAIL") kinds.INTERNAL_FAILURE += 1;
    else if (/UAT|WARRANTY|LIVE_ESC|CLIENT/.test(t)) kinds.EXTERNAL_FAILURE += 1;
    else kinds.APPRAISAL += 1;
  }
  // UAT failures count as external/internal failure evidence when quality records are sparse.
  const uatFails = ctx.uatCases.filter((u) => u.status === "FAIL" || u.status === "DEFECT").length;
  if (uatFails > 0) kinds.EXTERNAL_FAILURE += uatFails;
  const shares = coqShares([
    { kind: "PREVENTION", count: kinds.PREVENTION },
    { kind: "APPRAISAL", count: kinds.APPRAISAL },
    { kind: "INTERNAL_FAILURE", count: kinds.INTERNAL_FAILURE },
    { kind: "EXTERNAL_FAILURE", count: kinds.EXTERNAL_FAILURE },
  ]);
  const failureShare = ratePct(kinds.INTERNAL_FAILURE + kinds.EXTERNAL_FAILURE, shares.reduce((s, r) => s + r.count, 0));
  const kindColors: Record<string, string> = { PREVENTION: BRAND.emerald, APPRAISAL: BRAND.blue, INTERNAL_FAILURE: BRAND.orange, EXTERNAL_FAILURE: BRAND.coral };
  return {
    kpis: [
      { label: "Quality events", value: shares.reduce((s, r) => s + r.count, 0), format: "count" },
      { label: "Prevention", value: kinds.PREVENTION, format: "count", tone: "good" },
      { label: "Appraisal", value: kinds.APPRAISAL, format: "count", tone: "info" },
      { label: "Failure share", value: failureShare, format: "pct", tone: failureShare > 30 ? "bad" : failureShare > 15 ? "warn" : "good" },
    ],
    charts: shares.some((s) => s.count > 0)
      ? [{ kind: "donut", title: "CoQ mix (events)", centerLabel: "Events", slices: shares.filter((s) => s.count > 0).map((s) => ({ label: s.kind.replace("_", " "), value: s.count, color: kindColors[s.kind] })) }]
      : [],
    tables: [],
    notes: ["Count-based CoQ proxy: quality records classified by recordType/result + UAT failures. Monetary CoQ lands when quality-effort costs are captured."],
    emptyHints: shares.reduce((s, r) => s + r.count, 0) === 0
      ? ["No Quality Records captured yet — log reviews/inspections in Quality (quality records) and UAT results feed the failure side."]
      : undefined,
  };
}

// 43. DEFECT DENSITY — defects per 100 story points (or per deliverable).
export function defectDensity(ctx: AnalyticsContext): RawPayload {
  const defects = ctx.qualityRecords.filter((q) => q.result === "FAIL" || /DEFECT/i.test(q.title))
    .concat([] as typeof ctx.qualityRecords);
  const uatDefects = ctx.uatCases.filter((u) => u.status === "FAIL" || u.defectRef);
  const totalDefects = defects.length + uatDefects.length;
  const points = ctx.tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const per100 = points > 0 ? round2((totalDefects / points) * 100) : null;
  const perDeliverable = ctx.deliverables.length ? round2(totalDefects / ctx.deliverables.length) : null;
  const bySeverity = new Map<string, number>();
  for (const u of uatDefects) bySeverity.set(u.severity || "—", (bySeverity.get(u.severity || "—") ?? 0) + 1);
  return {
    kpis: [
      { label: "Defects", value: totalDefects, format: "count", tone: totalDefects > 0 ? "warn" : "good" },
      { label: "Per 100 points", value: per100 ?? 0, format: "number", tone: "info", sub: per100 === null ? "no story points captured" : "density" },
      { label: "Per deliverable", value: perDeliverable ?? 0, format: "number", tone: "info" },
      { label: "Open UAT defects", value: uatDefects.filter((u) => !u.executedAt || u.status === "FAIL").length, format: "count", tone: "warn" },
    ],
    charts: bySeverity.size
      ? [{ kind: "donut", title: "Defects by severity", centerLabel: "Defects", slices: [...bySeverity.entries()].map(([label, value], i) => ({ label, value, color: [BRAND.coral, BRAND.orange, BRAND.yellow, BRAND.slate][i % 4] })) }]
      : [],
    tables: [],
    notes: ["Density = defects ÷ story points × 100 (fallback: per deliverable). Defects = failed quality records + failed UAT cases."],
    emptyHints: totalDefects === 0
      ? ["No defects captured yet — UAT failures (Quality → UAT) and failed quality records feed this report."]
      : undefined,
  };
}

// 44. TEST COVERAGE / UAT — execution coverage and pass rates.
export function testCoverageUat(ctx: AnalyticsContext): RawPayload {
  const status = new Map<string, number>();
  for (const c of ctx.uatCases) status.set(c.status, (status.get(c.status) ?? 0) + 1);
  const total = ctx.uatCases.length;
  const executed = ctx.uatCases.filter((c) => c.executedAt || ["PASS", "FAIL", "BLOCKED"].includes(c.status)).length;
  const passed = status.get("PASS") ?? 0;
  const failed = (status.get("FAIL") ?? 0) + (status.get("DEFECT") ?? 0);
  const blocked = status.get("BLOCKED") ?? 0;
  const statusColors: Record<string, string> = { PASS: BRAND.emerald, FAIL: BRAND.coral, BLOCKED: BRAND.orange, NOT_RUN: BRAND.slate, PENDING: BRAND.slate };
  const activeCycles = ctx.uatCycles.filter((c) => c.status !== "COMPLETE" && c.status !== "CANCELLED").length;
  return {
    kpis: [
      { label: "UAT cases", value: total, format: "count" },
      { label: "Executed", value: ratePct(executed, total), format: "pct", tone: "info" },
      { label: "Pass rate", value: ratePct(passed, executed), format: "pct", tone: executed === 0 ? "default" : ratePct(passed, executed) >= 90 ? "good" : "warn" },
      { label: "Failed / blocked", value: failed + blocked, format: "count", tone: failed + blocked > 0 ? "warn" : "good" },
    ],
    charts: total > 0
      ? [{ kind: "donut", title: "UAT case status", centerLabel: "Cases", slices: [...status.entries()].map(([label, value]) => ({ label, value, color: statusColors[label] ?? BRAND.slate })).filter((s) => s.value > 0) }]
      : [],
    tables: ctx.uatCycles.length
      ? [{ title: "UAT cycles", columns: [
          { key: "name", header: "Cycle" },
          { key: "status", header: "Status" },
          { key: "start", header: "Start" },
          { key: "end", header: "End" },
        ], rows: ctx.uatCycles.map((c) => ({ name: c.name, status: c.status, start: dateStr(c.startDate), end: dateStr(c.endDate) })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Executed = cases with executedAt or a terminal status; coverage = executed ÷ total cases."],
    emptyHints: total === 0
      ? ["No UAT captured yet — create UAT cycles and cases under Quality → UAT; results feed coverage and defect density."]
      : undefined,
  };
}

// 45. MITIGATION COST-BENEFIT — exposure reduction per response strategy.
export function mitigationRoi(ctx: AnalyticsContext): RawPayload {
  const open = ctx.risks.filter((r) => r.status !== "CLOSED");
  const mitigated = open.filter((r) => r.residualProbability > 0 && (r.residualProbability * r.residualImpact) < (r.probability * r.impact));
  const reduction = mitigated.reduce((s, r) => s + (r.probability * r.impact - r.residualProbability * r.residualImpact), 0);
  const byStrategy = new Map<string, { count: number; reduction: number }>();
  for (const r of mitigated) {
    const key = r.responseStrategy || "MITIGATE";
    const cur = byStrategy.get(key) ?? { count: 0, reduction: 0 };
    cur.count += 1; cur.reduction += (r.probability * r.impact - r.residualProbability * r.residualImpact);
    byStrategy.set(key, cur);
  }
  const potential = open.reduce((s, r) => s + r.probability * r.impact, 0);
  return {
    kpis: [
      { label: "Exposure reduction", value: reduction, format: "number", tone: reduction > 0 ? "good" : "info", sub: "gross − residual, mitigated" },
      { label: "Mitigated risks", value: mitigated.length, format: "count" },
      { label: "Reduction rate", value: ratePct(reduction, potential), format: "pct", tone: "info", sub: "of open gross exposure" },
      { label: "Open exposure left", value: round2(potential - reduction), format: "number" },
    ],
    charts: byStrategy.size
      ? [{ kind: "bar", title: "Exposure reduction by strategy", series: [{ label: "Score points reduced", color: BRAND.emerald }], groups: [...byStrategy.entries()].map(([label, v]) => ({ label, values: [v.reduction] })), format: "number" }]
      : [],
    tables: [],
    notes: ["Benefit = probability×impact − residual probability×impact per risk. Monetary mitigation cost lands with risk-response cost capture (schema extension in docs)."],
    emptyHints: mitigated.length === 0
      ? ["No residual scores set yet — set residual probability/impact on risks after response planning (RAID → risk detail)."]
      : undefined,
  };
}

// 46. CSAT DASHBOARD — ROADMAP (no satisfaction capture yet).
export const csatRoadmapNote =
  "CSAT needs a satisfaction capture (CsatResponse: rating 1–5 per project/client touchpoint). " +
  "FeedbackPost votes track engagement, not satisfaction, so no proxy is shown. " +
  "Additive schema + a lightweight capture form are specified in docs/ANALYTICS-ENGINE.md.";

// 47. TTV REALIZATION — time from project start/activation to first benefit value.
export function ttvRealization(ctx: AnalyticsContext): RawPayload {
  const rows = ctx.benefitProfiles.map((b) => {
    const actuals = ctx.benefitActuals.filter((a) => a.profileId === b.id).sort((x, y) => new Date(x.period).getTime() - new Date(y.period).getTime());
    const first = actuals.find((a) => a.value !== 0);
    const project = ctx.projects.find((p) => p.id === b.projectId);
    const anchor = b.activatedAt ?? project?.startDate ?? null;
    const months = anchor && first ? round2((dayNum(first.period) - dayNum(anchor)) / 30.44) : null;
    return { benefit: b.name, project: project?.name ?? "—", activated: dateStr(b.activatedAt ?? project?.startDate), firstValue: first ? dateStr(first.period) : "—", ttvMonths: months, hasActual: first !== undefined };
  });
  const withTtv = rows.filter((r) => r.ttvMonths !== null) as { ttvMonths: number }[];
  const avg = withTtv.length ? round2(withTtv.reduce((s, r) => s + r.ttvMonths, 0) / withTtv.length) : 0;
  return {
    kpis: [
      { label: "Benefits tracked", value: rows.length, format: "count" },
      { label: "Realized (have value)", value: rows.filter((r) => r.hasActual).length, format: "count", tone: "good" },
      { label: "Avg time-to-value", value: avg, format: "days", tone: "info", sub: "months to first actual" },
      { label: "Awaiting first value", value: rows.filter((r) => !r.hasActual).length, format: "count", tone: "warn" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Time to first value (months)", series: [{ label: "Months", color: BRAND.purple }], groups: rows.filter((r) => r.ttvMonths !== null).map((r) => ({ label: r.benefit, values: [r.ttvMonths!] })), format: "number" }]
      : [],
    tables: rows.length
      ? [{ title: "Benefit TTV detail", columns: [
          { key: "benefit", header: "Benefit" },
          { key: "project", header: "Project" },
          { key: "activated", header: "Anchor date" },
          { key: "firstValue", header: "First actual" },
          { key: "ttvMonths", header: "TTV (mo)", format: "number", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["TTV = months from benefit activation (or project start) to the first non-zero BenefitActual."],
    emptyHints: rows.length === 0
      ? ["No Benefits captured yet — define benefit profiles on a project (Benefits tab) and record actuals per period."]
      : undefined,
  };
}

// 48. PIR SCORECARD — post-implementation review records + gate/benefit evidence.
export function pirScorecard(ctx: AnalyticsContext): RawPayload {
  const pirs = ctx.qualityRecords.filter((q) => /PIR|POST_IMPL|POST_IMPLEMENTATION/i.test(q.recordType) || /post.?implementation/i.test(q.title));
  const scores = pirs.filter((p) => p.score !== null) as { score: number }[];
  const avg = scores.length ? round2(scores.reduce((s, p) => s + p.score, 0) / scores.length) : 0;
  const gatesPassed = ctx.stageGates.filter((g) => g.decisionStatus === "PASSED" || g.decisionStatus === "CONDITIONAL").length;
  const reviewsDone = ctx.benefitReviews.length;
  const evidence = pirs.length + gatesPassed + reviewsDone;
  return {
    kpis: [
      { label: "PIR reviews", value: pirs.length, format: "count" },
      { label: "Avg PIR score", value: avg, format: "number", tone: avg >= 80 ? "good" : avg > 0 ? "warn" : "default", sub: "out of 100" },
      { label: "Gates passed", value: gatesPassed, format: "count", tone: "info" },
      { label: "Benefit reviews", value: reviewsDone, format: "count" },
    ],
    charts: pirs.length
      ? [{ kind: "bar", title: "PIR scores", series: [{ label: "Score", color: BRAND.blue }], groups: pirs.map((p) => ({ label: p.title || p.recordType, values: [p.score ?? 0] })), format: "number", yMax: 100 }]
      : [],
    tables: pirs.length
      ? [{ title: "PIR records", columns: [
          { key: "title", header: "Review" },
          { key: "date", header: "Date" },
          { key: "result", header: "Result" },
          { key: "score", header: "Score", format: "number", align: "right" },
        ], rows: pirs.map((p) => ({ title: p.title, date: dateStr(p.reviewedAt), result: p.result, score: p.score })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["PIR = quality records typed PIR/POST_IMPLEMENTATION; scorecard blends gate decisions and benefit reviews as closure evidence."],
    emptyHints: evidence === 0
      ? ["No PIR evidence captured — log a post-implementation review as a quality record (type PIR) after go-live; stage-gate decisions and benefit reviews also feed the scorecard."]
      : undefined,
  };
}

// 49. BENEFITS REALIZATION TRACKING — target vs actual per profile.
export function benefitsRealization(ctx: AnalyticsContext): RawPayload {
  const rows = ctx.benefitProfiles.map((b) => {
    const total = ctx.benefitActuals.filter((a) => a.profileId === b.id).reduce((s, a) => s + a.value, 0);
    const target = b.targetValue - b.baselineValue;
    const reviews = ctx.benefitReviews.filter((r) => r.profileId === b.id);
    const latest = reviews.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0];
    return {
      benefit: b.name, target: round2(target), actual: round2(total),
      pct: ratePct(total, target), status: latest?.status ?? "UNREVIEWED", active: b.active ? "ACTIVE" : "INACTIVE",
    };
  });
  const target = rows.reduce((s, r) => s + r.target, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const onTrack = rows.filter((r) => r.pct >= 80).length;
  const colorMap: Record<string, string> = { ON_TRACK: BRAND.emerald, AT_RISK: BRAND.yellow, OFF_TRACK: BRAND.coral, ACHIEVED: BRAND.emerald, UNREVIEWED: BRAND.slate };
  return {
    kpis: [
      { label: "Realization", value: ratePct(actual, target), format: "pct", tone: ratePct(actual, target) >= 80 ? "good" : rows.length ? "warn" : "default" },
      { label: "Benefits realized", value: actual, format: "money", sub: `target ${target}` },
      { label: "On track", value: onTrack, format: "count", tone: "good" },
      { label: "Profiles", value: rows.length, format: "count" },
    ],
    charts: rows.length
      ? [
          { kind: "bar", title: "Target vs actual by benefit", series: [
            { label: "Target", color: BRAND.slate },
            { label: "Actual", color: BRAND.emerald },
          ], groups: rows.map((r) => ({ label: r.benefit, values: [r.target, r.actual] })), format: "money" },
          { kind: "donut", title: "Review status", centerLabel: "Profiles", slices: [...rows.reduce((m, r) => m.set(r.status, (m.get(r.status) ?? 0) + 1), new Map<string, number>()).entries()].map(([label, value]) => ({ label, value, color: colorMap[label] ?? BRAND.slate })) },
        ]
      : [],
    tables: rows.length
      ? [{ title: "Realization detail", columns: [
          { key: "benefit", header: "Benefit" },
          { key: "target", header: "Target", format: "money", align: "right" },
          { key: "actual", header: "Actual", format: "money", align: "right" },
          { key: "pct", header: "Realized", format: "pct", align: "right" },
          { key: "status", header: "Review" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Realization = Σ BenefitActual ÷ (target − baseline) per profile; review status from the latest BenefitReview."],
    emptyHints: rows.length === 0
      ? ["No Benefits captured yet — define benefit profiles on a project (Benefits tab), record actuals, and run benefit reviews."]
      : undefined,
  };
}

// 50. LESSONS LEARNED — ROADMAP (needs a lessons register).
export const lessonsRoadmapNote =
  "Lessons need a structured register (LessonLearned: category, theme, impact, action owner). " +
  "DocPage/Decision capture free-form knowledge but no tagged lessons to aggregate honestly. " +
  "Additive model + capture form specified in docs/ANALYTICS-ENGINE.md; report will group by theme, project, and action status.";
