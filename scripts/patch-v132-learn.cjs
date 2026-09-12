const fs = require("fs");
let v = fs.readFileSync("src/views/intelligence/assistant.tsx", "utf8");
const NL = "\r\n";
const nl = v.includes(NL) ? NL : "\n";

// imports
v = v.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";');
v = v.replace('import { api, useApi, useRealtimeRefetch } from "@/lib/client";', 'import { api, useApi, useRealtimeRefetch } from "@/lib/client";');
if (!v.includes("BrainCircuit")) {
  v = v.replace(/import \{([^}]*)\} from "lucide-react";/, (m, g) => `import {${g.replace(/\s*$/, "")}, BrainCircuit } from "lucide-react";`);
}

// Learning profile component appended
if (!v.includes("function LearningProfile")) {
  v += nl + nl + "// ================= LEARNING PROFILE — the assistant evolves day by day =================" + nl +
    "function LearningProfile() {" + nl +
    `  const mem = useApi<{ profile: { interactions30d: number; drafts30d: number; approvedDrafts: number; feedbackPositive: number; feedbackNegative: number; accuracyPct: number | null; topTopics: { topic: string; count: number }[] }; evolution: { day: string; interactions: number; drafts: number; lessons: number }[]; knowledge: { id: string; day: string; kind: string; content: string }[] }>("` + `/api/assistant/memory");` + nl +
    "  if (!mem.data) return null;" + nl +
    "  const p = mem.data.profile;" + nl +
    "  return (" + nl +
    '    <SectionCard title="Learning profile — how the assistant evolves" description="Computed from real interaction history: queries, draft decisions and your feedback. Nothing invented.">' + nl +
    '      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">' + nl +
    '        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Interactions (30d)</p><p className="text-xl font-semibold text-slate-800 tabular-nums">{p.interactions30d}</p></div>' + nl +
    '        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Drafts → approved</p><p className="text-xl font-semibold text-slate-800 tabular-nums">{p.approvedDrafts}/{p.drafts30d}</p></div>' + nl +
    '        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Answer accuracy</p><p className={cn("text-xl font-semibold tabular-nums", (p.accuracyPct ?? 100) >= 70 ? "text-emerald-600" : "text-amber-600")}>{p.accuracyPct == null ? "—" : p.accuracyPct + "%"}</p></div>' + nl +
    '        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Feedback</p><p className="text-xl font-semibold tabular-nums"><span className="text-emerald-600">{p.feedbackPositive}</span> / <span className="text-red-500">{p.feedbackNegative}</span></p></div>' + nl +
    "      </div>" + nl +
    '      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">What the organization asks about most</p>' + nl +
    '      <div className="flex flex-wrap gap-1.5 mb-3">' + nl +
    "        {p.topTopics.length === 0 ? <span className=\"text-xs text-slate-400\">No topic patterns yet — ask more questions.</span> : p.topTopics.map((t) => (" + nl +
    '          <Badge key={t.topic} variant="outline" className="border-blue-200 text-blue-700">{t.topic} · {t.count}</Badge>' + nl +
    "        ))}" + nl +
    "      </div>" + nl +
    "      {mem.data.knowledge.length > 0 && (" + nl +
    '        <><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Distilled knowledge (evolves daily)</p>' + nl +
    '        <div className="space-y-1">' + nl +
    "          {mem.data.knowledge.slice(0, 5).map((k) => (" + nl +
    '            <div key={k.id} className="text-xs text-slate-600 flex gap-2"><span className="text-slate-400 tabular-nums">{k.day.slice(0, 10)}</span><span>{k.content}</span></div>' + nl +
    "          ))}" + nl +
    "        </div></>" + nl +
    "      )}" + nl +
    "    </SectionCard>" + nl +
    "  );" + nl +
    "}" + nl;
}

// render: Learning profile above the chat panel — anchor right after the PageHeader block's closing "/>"
const phMatch = v.match(/(<PageHeader[\s\S]*?\/>)/);
if (!phMatch) throw new Error("PageHeader anchor missing");
v = v.replace(phMatch[1], phMatch[1] + nl + "      <LearningProfile />");

fs.writeFileSync("src/views/intelligence/assistant.tsx", v);
console.log("patched:", v.includes("LearningProfile"), "| react useEffect:", v.includes("useEffect"));
