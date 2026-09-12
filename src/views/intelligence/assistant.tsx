"use client";
// PM CONTROL TOWER — INTELLIGENCE · AI PM Assistant (governed natural-language access)

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import {
  PageHeader, SectionCard, Button, Badge, LoadingBlock, ErrorBlock, cn,
} from "@/components/pmct/kit";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, ShieldCheck, Bot, User as UserIcon, RotateCcw, BrainCircuit } from "lucide-react";

interface AiExecution {
  id: string;
  prompt: string;
  response: string | null;
  tokens: number;
  durationMs: number;
  status: string;
  dataScopeUsed: string | null;
  createdAt: string;
  userName: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tokens?: number;
  durationMs?: number;
  status?: string;
  error?: boolean;
}

const SUGGESTED = [
  "Which projects are at risk because of resource capacity?",
  "Which projects are red and why?",
  "How is schedule performance trending?",
  "What needs a governance decision?",
];

// Governed data scope per spec §21 — access is permission-checked and audited
const DATA_SCOPE = [
  "Projects", "Programs", "Portfolio", "WBS", "Tasks", "Schedule", "Resources",
  "Timesheets", "Financials", "EVM", "RAID", "Changes", "Governance", "Reports", "Notifications",
];

export default function AssistantView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ executions: AiExecution[]; scope: string }>("/api/assistant")
      .then((d) => {
        if (!alive) return;
        const msgs: ChatMessage[] = (d.executions ?? [])
          .slice()
          .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
          .map((e) => ({
            id: `${e.id}-q`, role: "user" as const, text: e.prompt,
          })).flatMap((q, i) => {
            const e = (d.executions ?? []).slice().sort((x, y) => x.createdAt.localeCompare(y.createdAt))[i];
            const out: ChatMessage[] = [q];
            out.push({
              id: `${e.id}-a`,
              role: "assistant",
              text: e.response ?? "(no response recorded)",
              tokens: e.tokens,
              durationMs: e.durationMs,
              status: e.status,
              error: e.status !== "SUCCESS",
            });
            return out;
          });
        setMessages(msgs);
        setLoadingHistory(false);
      })
      .catch((e) => {
        if (!alive) return;
        setHistoryError(e instanceof Error ? e.message : "Failed to load history");
        setLoadingHistory(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: q };
    setMessages((m) => [...m, userMsg]);
    try {
      const d = await api.post<AiExecution & { answer?: string }>("/api/assistant", { question: q });
      const answerText = d.response ?? d.answer ?? "(empty response)";
      setMessages((m) => [...m, {
        id: `a-${Date.now()}`, role: "assistant", text: answerText,
        tokens: d.tokens, durationMs: d.durationMs, status: d.status,
      }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The assistant is unavailable";
      const friendly = /502|failed|timeout/i.test(msg)
        ? "The Insight Engine could not complete this request. It may be busy or the model endpoint is unreachable — please try again."
        : msg;
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", text: friendly, error: true }]);
      toast.error("Assistant request failed", { description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI PM Assistant"
        breadcrumb={["Intelligence", "Assistant"]}
        subtitle="Ask natural-language questions across the governed portfolio. Every execution is permission-checked, project-scoped and written to the audit trail."
      />
      <LearningProfile />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Chat column */}
        <div className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Header band */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/80">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#0b1f3a] flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-sky-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">PMCT Insight Engine</p>
                <p className="text-[11px] text-slate-500">Governed AI · prompt-scoped to your permissions</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setMessages([]); toast.info("Chat cleared — history stays in the audit trail."); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear view
            </Button>
          </div>

          {/* Messages */}
              <div ref={scrollRef} className="flex-1 min-h-[420px] max-h-[560px] overflow-y-auto p-4 space-y-4">
            {loadingHistory ? <LoadingBlock label="Loading past exchanges…" /> : historyError ? (
              <ErrorBlock message={historyError} />
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-slate-700">Ask anything about your portfolio</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  The assistant reads live project, schedule, resource, financial, EVM, RAID and governance data — with your permissions applied.
                </p>
              </div>
            ) : (
              messages.map((m) => <ChatBubble key={m.id} msg={m} />)
            )}
            {sending && <TypingIndicator />}
          </div>

          {/* Suggested chips */}
          <div className="px-4 pt-3 pb-1 border-t border-slate-100 bg-white">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  disabled={sending}
                  onClick={() => ask(s)}
                  className="text-xs rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
                }}
                placeholder="Ask a governed question about your portfolio…"
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
                disabled={sending}
              />
              <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => ask(input)} disabled={sending || !input.trim()} aria-label="Send question">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Enter to send · Shift+Enter for a new line · responses take a few seconds — the engine analyses live portfolio data.
            </p>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-5">
          <SectionCard title="Governed data scope" description="Domains the assistant may read">
            <div className="flex flex-wrap gap-1.5">
              {DATA_SCOPE.map((dm) => (
                <Badge key={dm} variant="outline" className="bg-blue-50/60 text-blue-700 border-blue-200 font-normal">{dm}</Badge>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 border border-slate-100 p-2.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Access is permission-checked and audited. Queries are scoped to the projects you are entitled to see; every execution is persisted.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="How answers are generated" description="Execution pipeline">
            <ol className="space-y-2.5">
              {[
                "Your question is authenticated with your session (JWT).",
                "The engine gathers a governed context — live data only, no free-form retrieval.",
                "The model answers strictly from that context.",
                "Prompt, response, tokens and duration are written to the audit trail.",
              ].map((s, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-slate-600">
                  <span className="h-5 w-5 rounded-full bg-[#0b1f3a] text-white text-[10px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-blue-600 text-white px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
        <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
          <UserIcon className="h-3.5 w-3.5 text-slate-500" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <div className="h-7 w-7 rounded-full bg-[#0b1f3a] flex items-center justify-center shrink-0">
        <Bot className="h-3.5 w-3.5 text-sky-300" />
      </div>
      <div className={cn(
        "max-w-[82%] rounded-2xl rounded-bl-sm border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
        msg.error ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-700",
      )}>
        {msg.text}
        {!msg.error && (msg.tokens || msg.durationMs) && (
          <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center gap-3 text-[10px] text-slate-400">
            <span>{msg.tokens ?? 0} tokens</span>
            <span>{((msg.durationMs ?? 0) / 1000).toFixed(1)}s</span>
            {msg.status && <span className="uppercase tracking-wide">{msg.status}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="h-7 w-7 rounded-full bg-[#0b1f3a] flex items-center justify-center shrink-0">
        <Bot className="h-3.5 w-3.5 text-sky-300" />
      </div>
      <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
        <span className="text-[11px] text-slate-400 ml-1.5">Insight Engine analysing portfolio data…</span>
      </div>
    </div>
  );
}


// ================= LEARNING PROFILE — the assistant evolves day by day =================
function LearningProfile() {
  const mem = useApi<{ profile: { interactions30d: number; drafts30d: number; approvedDrafts: number; feedbackPositive: number; feedbackNegative: number; accuracyPct: number | null; topTopics: { topic: string; count: number }[] }; evolution: { day: string; interactions: number; drafts: number; lessons: number }[]; knowledge: { id: string; day: string; kind: string; content: string }[] }>("/api/assistant/memory");
  if (!mem.data) return null;
  const p = mem.data.profile;
  return (
    <SectionCard title="Learning profile — how the assistant evolves" description="Computed from real interaction history: queries, draft decisions and your feedback. Nothing invented.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Interactions (30d)</p><p className="text-xl font-semibold text-slate-800 tabular-nums">{p.interactions30d}</p></div>
        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Drafts → approved</p><p className="text-xl font-semibold text-slate-800 tabular-nums">{p.approvedDrafts}/{p.drafts30d}</p></div>
        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Answer accuracy</p><p className={cn("text-xl font-semibold tabular-nums", (p.accuracyPct ?? 100) >= 70 ? "text-emerald-600" : "text-amber-600")}>{p.accuracyPct == null ? "—" : p.accuracyPct + "%"}</p></div>
        <div className="rounded-lg border border-slate-200 p-2.5"><p className="text-[11px] uppercase text-slate-400">Feedback</p><p className="text-xl font-semibold tabular-nums"><span className="text-emerald-600">{p.feedbackPositive}</span> / <span className="text-red-500">{p.feedbackNegative}</span></p></div>
      </div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">What the organization asks about most</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {p.topTopics.length === 0 ? <span className="text-xs text-slate-400">No topic patterns yet — ask more questions.</span> : p.topTopics.map((t) => (
          <Badge key={t.topic} variant="outline" className="border-blue-200 text-blue-700">{t.topic} · {t.count}</Badge>
        ))}
      </div>
      {mem.data.knowledge.length > 0 && (
        <><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Distilled knowledge (evolves daily)</p>
        <div className="space-y-1">
          {mem.data.knowledge.slice(0, 5).map((k) => (
            <div key={k.id} className="text-xs text-slate-600 flex gap-2"><span className="text-slate-400 tabular-nums">{k.day.slice(0, 10)}</span><span>{k.content}</span></div>
          ))}
        </div></>
      )}
    </SectionCard>
  );
}
