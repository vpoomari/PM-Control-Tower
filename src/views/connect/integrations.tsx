"use client";
// PM CONTROL TOWER — CONNECT · Integration Hub (honest connector states, masked credentials)

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, StatusChip, Button, Badge, Input,
  LoadingBlock, ErrorBlock, EmptyState,
} from "@/components/pmct/kit";
import { Drawer, DrawerSection, KV } from "./shared/drawer";
import { fmtDateTime, INTEGRATION_CATEGORIES } from "@/lib/constants";
import {
  Mail, Calendar, KeyRound, HardDrive, Bell, BarChart3, Webhook, Sparkles,
  Plug, RefreshCw, Plus, Activity, ShieldCheck, HelpCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ---------- types ----------
interface Integration {
  id: string; name: string; category: string; provider: string; description: string;
  status: string; authType: string; authStatus: string; syncDirection: string;
  syncFrequency: string; lastSyncAt: string | null; errorCount: number; retryCount: number;
  lastError: string | null; healthScore: number; configJson: string | null;
  credentialCount: number; recentEventCount: number; updatedAt: string;
}
interface IntegrationDetail extends Integration {
  credentials: Array<{ id: string; label: string; credType: string; maskedValue: string; status: string; expiresAt: string | null; rotatedAt: string | null }>;
  events: Array<{ id: string; direction: string; eventType: string; status: string; durationMs: number; attempts: number; createdAt: string; error: string | null }>;
}
interface CategoryGroup { category: string; integrations: Integration[] }

const CATEGORY_META: Record<string, { icon: typeof Mail; label: string; hint: string }> = {
  EMAIL: { icon: Mail, label: "Email Service", hint: "Outbound mail relay for notifications and approvals" },
  CALENDAR: { icon: Calendar, label: "Calendar Integration", hint: "Meeting sync for the Focus Planner" },
  SSO: { icon: KeyRound, label: "SSO / Identity Provider", hint: "Federated authentication and directory sync" },
  STORAGE: { icon: HardDrive, label: "File Storage", hint: "Document and attachment repository" },
  NOTIFICATIONS: { icon: Bell, label: "Notifications", hint: "Instant messaging and alert delivery" },
  BI: { icon: BarChart3, label: "BI / Reporting", hint: "Governed extracts for enterprise analytics" },
  WEBHOOKS: { icon: Webhook, label: "Webhooks / APIs", hint: "Event delivery to downstream systems" },
  AI: { icon: Sparkles, label: "AI / Insights", hint: "Approved AI services for the assistant" },
};

export default function IntegrationsView() {
  const list = useApi<{ categories: CategoryGroup[] }>("/api/integrations");
  useRealtimeRefetch(list.refetch, ["integration:changed"]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const detail = useApi<IntegrationDetail>(detailId ? `/api/integrations/${detailId}` : null);

  const test = async (i: Integration) => {
    setTestingId(i.id);
    try {
      const r = await api.post<{ ok: boolean; mode: string; reason?: string; detail?: string; latencyMs?: number }>(`/api/integrations/${i.id}/test`);
      if (r.ok) {
        toast.success(`${i.name}: connectivity test passed`, {
          description: `Mode ${r.mode}${r.latencyMs !== undefined ? ` · ${r.latencyMs}ms` : ""}${r.detail ? ` · ${r.detail}` : ""}`,
        });
      } else {
        toast.warning(`${i.name}: test returned a negative result`, {
          description: r.reason || "The connector reported it is not operational.",
        });
      }
      list.refetch();
    } catch (e) {
      toast.error("Test failed to execute", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setTestingId(null);
    }
  };

  const toggle = async (i: Integration, enable: boolean) => {
    setTogglingId(i.id);
    try {
      await api.post(`/api/integrations/${i.id}/${enable ? "enable" : "disable"}`);
      toast.success(`${i.name} ${enable ? "enabled" : "disabled"}`);
      list.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Could not ${enable ? "enable" : "disable"} ${i.name}`, {
        description: /credential|auth/i.test(msg) ? `${msg} — register a credential first from the connector details.` : msg,
      });
    } finally {
      setTogglingId(null);
    }
  };

  const groups = list.data?.categories ?? [];
  const total = groups.reduce((s, g) => s + g.integrations.length, 0);
  const connected = groups.reduce((s, g) => s + g.integrations.filter((i) => i.status === "CONNECTED").length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integration Hub"
        breadcrumb={["Connect", "Integrations"]}
        subtitle="External systems connected to the control tower. States reflect exactly what the platform has verified — nothing is shown as connected until the API reports it."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={list.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add integration</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SectionCard><div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center"><Plug className="h-4 w-4 text-blue-600" /></div>
          <div><p className="text-lg font-semibold text-slate-900">{total}</p><p className="text-xs text-slate-500">Connectors registered</p></div>
        </div></SectionCard>
        <SectionCard><div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center"><Activity className="h-4 w-4 text-emerald-600" /></div>
          <div><p className="text-lg font-semibold text-slate-900">{connected}</p><p className="text-xs text-slate-500">Reported connected by the API</p></div>
        </div></SectionCard>
        <SectionCard><div className="flex items-start gap-2.5">
          <HelpCircle className="h-4 w-4 text-slate-400 mt-1" />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Sandbox note: external connectors cannot reach outside networks here. Tests report exactly what the platform observes — external credentials are not configured in this environment.
          </p>
        </div></SectionCard>
      </div>

      {list.loading && !list.data ? <LoadingBlock label="Loading integrations…" />
        : list.error ? <ErrorBlock message={list.error} onRetry={list.refetch} />
        : groups.length === 0 ? <EmptyState title="No integrations registered" description="Add your first connector to link the control tower with external systems." />
        : (
        <div className="space-y-6">
          {groups.map((g) => {
            const meta = CATEGORY_META[g.category] ?? { icon: Plug, label: g.category, hint: "" };
            return (
              <div key={g.category}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="h-6 w-6 rounded-md bg-slate-100 flex items-center justify-center"><meta.icon className="h-3.5 w-3.5 text-slate-500" /></div>
                  <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">{meta.hint}</span>
                  <Badge variant="outline" className="ml-auto bg-white text-slate-400 border-slate-200">{g.integrations.length}</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {g.integrations.map((i) => (
                    <ConnectorCard key={i.id} i={i} onTest={() => test(i)} onToggle={toggle} onDetails={() => setDetailId(i.id)} busy={testingId === i.id || togglingId === i.id} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <IntegrationDetailDrawer
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        detail={detail.data}
        loading={detail.loading}
        error={detail.error}
        onRefetch={detail.refetch}
      />
      <CreateIntegrationDialog open={showCreate} onOpenChange={setShowCreate} onCreated={() => { list.refetch(); }} />
    </div>
  );
}

// ---------- connector card ----------
function ConnectorCard({ i, onTest, onToggle, onDetails, busy }: {
  i: Integration;
  onTest: () => void;
  onToggle: (i: Integration, enable: boolean) => void;
  onDetails: () => void;
  busy: boolean;
}) {
  const meta = CATEGORY_META[i.category] ?? { icon: Plug, label: i.category, hint: "" };
  const health = i.healthScore >= 80 ? "bg-emerald-500" : i.healthScore > 0 ? "bg-amber-500" : "bg-slate-300";
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3 hover:shadow transition-shadow">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><meta.icon className="h-4 w-4 text-slate-600" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-800 truncate">{i.name}</p>
            <span className={`h-2 w-2 rounded-full shrink-0 ${health}`} title={`Health ${i.healthScore}`} />
          </div>
          <p className="text-[11px] text-slate-500 truncate">{i.provider}</p>
        </div>
        <StatusChip status={i.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] items-center">
        <span className="text-slate-400">Sync</span>
        <span className="text-slate-700 text-right font-medium">{i.syncDirection.toLowerCase()} · {i.syncFrequency.toLowerCase()}</span>
        <span className="text-slate-400">Auth</span>
        <span className="text-right">
          <Badge variant="outline" className={i.authStatus === "CONFIGURED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>{i.authStatus === "CONFIGURED" ? "Credentials configured" : "Credentials not configured"}</Badge>
        </span>
        <span className="text-slate-400">Last sync</span>
        <span className="text-slate-700 text-right tabular-nums">{i.lastSyncAt ? fmtDateTime(i.lastSyncAt) : "never"}</span>
        <span className="text-slate-400">Errors (7d)</span>
        <span className={`text-right tabular-nums font-medium ${i.errorCount > 0 ? "text-red-600" : "text-slate-700"}`}>{i.errorCount}</span>
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={onTest} disabled={busy}>
          {busy ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />} Test
        </Button>
        {i.status === "ACTIVE" || i.status === "CONNECTED" ? (
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => onToggle(i, false)} disabled={busy}>Disable</Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => onToggle(i, true)} disabled={busy}>Enable</Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onDetails}>Details</Button>
      </div>
    </div>
  );
}

// ---------- detail drawer ----------
function IntegrationDetailDrawer({ open, onClose, detail, loading, error, onRefetch }: {
  open: boolean; onClose: () => void; detail: IntegrationDetail | null; loading: boolean; error: string | null; onRefetch: () => void;
}) {
  const [showCred, setShowCred] = useState(false);
  const [credLabel, setCredLabel] = useState("");
  const [credType, setCredType] = useState("API_KEY");
  const [credValue, setCredValue] = useState("");
  const [saving, setSaving] = useState(false);

  const registerCred = async () => {
    if (!detail) return;
    if (credLabel.trim().length < 2 || credValue.length < 6) {
      toast.error("Credential needs a label (2+ chars) and a value (6+ chars)");
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<{ maskedValue: string }>(`/api/integrations/${detail.id}/credentials`, { label: credLabel.trim(), credType, value: credValue });
      toast.success("Credential registered", { description: `Stored masked as ${r.maskedValue} — the platform never stores the raw value.` });
      setShowCred(false); setCredLabel(""); setCredValue("");
      onRefetch();
    } catch (e) {
      toast.error("Could not register credential", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  const configPreview: Array<[string, string]> = [];
  if (detail?.configJson) {
    try {
      const parsed: unknown = JSON.parse(detail.configJson);
      if (parsed && typeof parsed === "object") configPreview.push(...Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)] as [string, string]));
    } catch { configPreview.push(["config", detail.configJson]); }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }} title={detail?.name ?? "Connector"} description={detail ? `${detail.provider} · ${detail.category}` : undefined} wide>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={onRefetch} /> : !detail ? null : (
        <>
          <DrawerSection title="Overview">
            <p className="text-xs text-slate-600 leading-relaxed mb-3">{detail.description}</p>
            <KV label="Status"><StatusChip status={detail.status} /></KV>
            <KV label="Auth type">{detail.authType}</KV>
            <KV label="Auth status"><StatusChip status={detail.authStatus} /></KV>
            <KV label="Sync">{detail.syncDirection} · {detail.syncFrequency}</KV>
            <KV label="Last sync">{detail.lastSyncAt ? fmtDateTime(detail.lastSyncAt) : "never"}</KV>
            <KV label="Errors / retries (7d)">{detail.errorCount} / {detail.retryCount}</KV>
            {detail.lastError && <KV label="Last error"><span className="text-red-600">{detail.lastError}</span></KV>}
          </DrawerSection>

          <DrawerSection title="Configuration (non-secret)">
            {configPreview.length === 0 ? <p className="text-xs text-slate-400">No configuration recorded.</p> : configPreview.map(([k, v]) => <KV key={k} label={k}>{v}</KV>)}
            <p className="text-[10px] text-slate-400 mt-2">Secret values are never shown here — credentials are stored masked only.</p>
          </DrawerSection>

          <DrawerSection
            title="Credentials (masked)"
            actions={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCred((s) => !s)}><Plus className="h-3 w-3 mr-1" /> Register credential</Button>}
          >
            {detail.credentials.length === 0 ? (
              <p className="text-xs text-slate-400">No credentials registered. External connectors need credentials before they can be enabled.</p>
            ) : detail.credentials.map((c) => (
              <KV key={c.id} label={c.label}>
                <span className="font-mono">{c.maskedValue}</span>
                <span className="ml-1.5 text-slate-400">({c.credType} · {c.status})</span>
              </KV>
            ))}
            {showCred && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2.5">
                <div>
                  <Label className="text-xs text-slate-600">Label</Label>
                  <Input value={credLabel} onChange={(e) => setCredLabel(e.target.value)} className="h-9 mt-1" placeholder="e.g. Production API key" />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Type</Label>
                  <Select value={credType} onValueChange={setCredType}>
                    <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["API_KEY", "BEARER_TOKEN", "BASIC_AUTH", "OAUTH_CLIENT", "WEBHOOK_SECRET", "CERTIFICATE", "OTHER"].map((t) => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Secret value</Label>
                  <Input type="password" value={credValue} onChange={(e) => setCredValue(e.target.value)} className="h-9 mt-1 font-mono" placeholder="Paste the secret — it is masked on save" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={registerCred} disabled={saving}>{saving ? "Saving…" : "Save credential"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCred(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Recent events">
            {detail.events.length === 0 ? <p className="text-xs text-slate-400">No integration events recorded in the retention window.</p> : (
              <div className="rounded-md border border-slate-200 overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left font-medium px-2.5 py-2">Direction</th>
                    <th className="text-left font-medium px-2.5 py-2">Type</th>
                    <th className="text-left font-medium px-2.5 py-2">Status</th>
                    <th className="text-right font-medium px-2.5 py-2">Duration</th>
                    <th className="text-left font-medium px-2.5 py-2">Time</th>
                  </tr></thead>
                  <tbody>
                    {detail.events.map((ev) => (
                      <tr key={ev.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-2.5 py-1.5 text-slate-600">{ev.direction.toLowerCase()}</td>
                        <td className="px-2.5 py-1.5 font-medium text-slate-700">{ev.eventType}</td>
                        <td className="px-2.5 py-1.5"><StatusChip status={ev.status} /></td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">{ev.durationMs}ms</td>
                        <td className="px-2.5 py-1.5 tabular-nums text-slate-500">{fmtDateTime(ev.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

// ---------- create dialog ----------
function CreateIntegrationDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("EMAIL");
  const [provider, setProvider] = useState("");
  const [description, setDescription] = useState("");
  const [authType, setAuthType] = useState("API_KEY");
  const [syncDirection, setSyncDirection] = useState("OUTBOUND");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) { toast.error("Connector name is required (2+ characters)"); return; }
    setSaving(true);
    try {
      await api.post("/api/integrations", {
        name: name.trim(), category, provider: provider.trim() || undefined,
        description: description.trim() || undefined, authType, syncDirection,
      });
      toast.success("Integration registered", { description: "It starts DISCONNECTED — register credentials, test, then enable." });
      onOpenChange(false);
      setName(""); setProvider(""); setDescription("");
      onCreated();
    } catch (e) {
      toast.error("Could not register integration", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add integration</DialogTitle>
          <DialogDescription>Registers a new connector in a DISCONNECTED state. Nothing is claimed to work until you register credentials and a connectivity test passes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div>
            <Label className="text-xs text-slate-600">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance data warehouse feed" className="mt-1 h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTEGRATION_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Auth type</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["API_KEY", "OAUTH", "BASIC", "BEARER", "INTERNAL", "CERTIFICATE"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Provider</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Internal data platform" className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Sync direction</Label>
            <Select value={syncDirection} onValueChange={setSyncDirection}>
              <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["INBOUND", "OUTBOUND", "BIDIRECTIONAL"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1" placeholder="What does this connector exchange?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Registering…" : "Register integration"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
