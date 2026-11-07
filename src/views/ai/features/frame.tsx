"use client";
// PM CONTROL TOWER — AI Feature Studio · shared feature frame
// One shell renders all 100 features: dark-slate studio theme, labelled inputs,
// required-field validation (with focus + aria-invalid), explicit Run button,
// polite loading announcements, the honest BYOK fallback state and the copyable
// result panel. Motion is gated by prefers-reduced-motion via motion-reduce:*.
//
// Features keep their own state, their own embedded SYSTEM_PROMPT and their own
// try/catch around askAIResult — this file only presents what they hand it.

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Copy, Database, Loader2, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AIResult } from "@/lib/ai/shared";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Live context (provided once by the studio view)
// ---------------------------------------------------------------------------

export interface StudioProject {
  code: string;
  name: string;
  status?: string;
}

interface StudioValue {
  projects: StudioProject[];
  loaded: boolean;
  error: string | null;
}

const StudioContext = createContext<StudioValue>({
  projects: [],
  loaded: false,
  error: null,
});

export function StudioProvider({
  value,
  children,
}: {
  value: StudioValue;
  children: ReactNode;
}) {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioValue {
  return useContext(StudioContext);
}

// ---------------------------------------------------------------------------
// Field contracts
// ---------------------------------------------------------------------------

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date";
  placeholder?: string;
  /** Small helper line rendered under the control. */
  hint?: string;
  /** Blocks the run (inline + aria-invalid) until filled. */
  required?: boolean;
  rows?: number;
  /** Force the control onto its own row (textareas do this automatically). */
  wide?: boolean;
  /** Select only — either explicit options or the live project list. */
  options?: FieldOption[] | "projects";
}

/**
 * `"Label: value"` for a non-empty value, otherwise `null`, so prompts built by
 * `[promptLine(...), …, "task"].filter(Boolean)` never contain empty lines.
 */
export function promptLine(label: string, value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  return v ? `${label}: ${v}` : null;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export interface FeatureFrameProps {
  id: string;
  rank: number;
  name: string;
  tagline: string;
  category: string;
  icon: LucideIcon;
  fields: FieldDef[];
  values: Record<string, string>;
  setValue: (key: string, value: string) => void;
  busy: boolean;
  onRun: () => void;
  result: AIResult | null;
  error?: string | null;
  runLabel?: string;
  /** Optional custom output — replaces the plain-text result panel. */
  resultNode?: ReactNode;
  /** Optional slot between the fields and the Run button. */
  children?: ReactNode;
}

export function FeatureFrame(props: FeatureFrameProps) {
  const {
    id, rank, name, tagline, category, icon: Icon, fields, values, setValue,
    busy, onRun, result, error, runLabel, resultNode, children,
  } = props;

  const { projects, loaded: projectsLoaded, error: projectsError } = useStudio();
  const [missing, setMissing] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const firstMissingRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  const resolveOptions = useCallback(
    (field: FieldDef): FieldOption[] => {
      if (field.options === "projects") {
        return projects.map((p) => ({ value: `${p.code} · ${p.name}`, label: `${p.code} · ${p.name}` }));
      }
      return field.options ?? [];
    },
    [projects],
  );

  const handleRun = () => {
    const missingFields = fields.filter((f) => f.required && !(values[f.key] ?? "").trim());
    if (missingFields.length > 0) {
      setMissing(missingFields.map((f) => f.key));
      window.setTimeout(() => firstMissingRef.current?.focus(), 0);
      return;
    }
    setMissing([]);
    setCopied(false);
    onRun();
  };

  const isMissing = (key: string) => missing.includes(key);
  const missingLabels = fields.filter((f) => isMissing(f.key)).map((f) => f.label);

  const contextNote = projectsError
    ? "Live project list unavailable — type the project name manually."
    : !projectsLoaded
      ? "Loading live project context…"
      : projects.length === 0
        ? "No projects in this workspace yet — type the project name manually."
        : `Live context: ${projects.length} projects connected from the register.`;

  const text = (result?.text ?? "").trim();
  const showFallback = Boolean(result?.fallback) || (result !== null && result.status !== "ok");

  return (
    <section
      aria-label={`${name} — AI feature ${id}`}
      className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-[0_18px_44px_-28px_rgba(2,6,23,0.9)]"
    >
      {/* ---------- Header ---------- */}
      <header className="flex items-start gap-3 border-b border-slate-800/80 bg-slate-900/60 px-4 py-3.5 sm:px-5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/25 to-indigo-500/25 text-cyan-300"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-white sm:text-base">{name}</h2>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-300">
              {id} · rank {rank}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{tagline}</p>
        </div>
        <span className="hidden shrink-0 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300 sm:block">
          {category}
        </span>
      </header>

      {/* ---------- Inputs ---------- */}
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            const fieldId = `${id}-${field.key}`;
            const hintId = `${fieldId}-hint`;
            const invalid = isMissing(field.key);
            const common = {
              id: fieldId,
              value: values[field.key] ?? "",
              "aria-invalid": invalid || undefined,
              "aria-describedby": field.hint ? hintId : undefined,
              className: cn(
                "w-full rounded-lg border bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 motion-reduce:transition-none",
                invalid ? "border-rose-400" : "border-slate-700",
              ),
            };

            return (
              <div key={field.key} className={field.type === "textarea" || field.wide ? "sm:col-span-2" : undefined}>
                <label
                  htmlFor={fieldId}
                  className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"
                >
                  {field.label}
                  {field.required && (
                    <span className="text-cyan-300" aria-hidden="true">
                      *
                    </span>
                  )}
                  {field.required && <span className="sr-only">(required)</span>}
                </label>

                {field.type === "textarea" ? (
                  <textarea
                    {...common}
                    rows={field.rows ?? 4}
                    placeholder={field.placeholder}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    ref={(node) => {
                      if (invalid && !firstMissingRef.current) firstMissingRef.current = node;
                    }}
                  />
                ) : field.type === "select" ? (
                  field.options === "projects" && projects.length === 0 ? (
                    // No live list → a text input so the project can still be named honestly.
                    <input
                      {...common}
                      type="text"
                      placeholder="Type the project name…"
                      onChange={(e) => setValue(field.key, e.target.value)}
                      ref={(node) => {
                        if (invalid && !firstMissingRef.current) firstMissingRef.current = node;
                      }}
                    />
                  ) : (
                    <select
                      {...common}
                      className={cn(common.className, "[&>option]:bg-slate-900 [&>option]:text-slate-100")}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      ref={(node) => {
                        if (invalid && !firstMissingRef.current) firstMissingRef.current = node;
                      }}
                    >
                      <option value="">
                        {field.options === "projects" ? "Select a project…" : "Select…"}
                      </option>
                      {resolveOptions(field).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      {(values[field.key] ?? "") &&
                      resolveOptions(field).every((o) => o.value !== values[field.key]) ? (
                        <option value={values[field.key]}>{values[field.key]}</option>
                      ) : null}
                    </select>
                  )
                ) : (
                  <input
                    {...common}
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    placeholder={field.placeholder}
                    onChange={(e) => setValue(field.key, e.target.value)}
                    ref={(node) => {
                      if (invalid && !firstMissingRef.current) firstMissingRef.current = node;
                    }}
                  />
                )}

                {field.hint && (
                  <p id={hintId} className="mt-1 text-[11px] leading-snug text-slate-500">
                    {field.hint}
                  </p>
                )}
                {invalid && (
                  <p className="mt-1 text-[11px] font-medium text-rose-300">
                    {field.label} is required.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Live-context honesty line */}
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {contextNote}
        </p>

        {children}

        {/* ---------- Run ---------- */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleRun}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? "Working…" : runLabel ?? "Run"}
          </button>

          {missingLabels.length > 0 && (
            <p className="text-[11px] font-medium text-rose-300" role="alert">
              Required: {missingLabels.join(", ")}
            </p>
          )}
          {error && !busy && (
            <p className="text-[11px] font-medium text-rose-300" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ---------- Loading ---------- */}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-2 border-t border-slate-800/80 px-4 py-4 sm:px-5"
        >
          <p className="text-[11px] uppercase tracking-wider text-cyan-300">
            Working — one BYOK call for this run…
          </p>
          {[92, 74, 58].map((w, i) => (
            <div
              key={w}
              className="h-3 rounded bg-slate-800 animate-pulse motion-reduce:animate-none"
              style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      )}

      {/* ---------- Result ---------- */}
      {!busy && result && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-3 border-t border-slate-800/80 px-4 py-4 sm:px-5"
        >
          {showFallback ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-amber-200">{text || "No response was returned."}</p>
            </div>
          ) : text ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">AI output</p>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard?.writeText(text);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* clipboard unavailable — the text stays selectable */
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 motion-reduce:transition-none"
                >
                  {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {resultNode ?? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{text}</p>
              )}

              <p className="text-[10px] text-slate-500">
                {[
                  result.provider,
                  result.model,
                  typeof result.durationMs === "number" ? `${result.durationMs} ms` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "AI response"}
              </p>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-amber-200">
                The provider returned an empty response — run it again.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-2.5 text-[10px] leading-relaxed text-slate-500 sm:px-5">
        AI-generated draft — review before using it in a report or decision. Nothing runs
        until you press the button, and every run uses your own BYOK provider key.
      </footer>
    </section>
  );
}

/** Convenience for features that need the live list beyond a select field. */
export function useProjectOptions(): FieldOption[] {
  const { projects } = useStudio();
  return useMemo(
    () => projects.map((p) => ({ value: `${p.code} · ${p.name}`, label: `${p.code} · ${p.name}` })),
    [projects],
  );
}
