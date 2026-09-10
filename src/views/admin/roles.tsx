"use client";
// PM CONTROL TOWER — ADMIN · Roles & Permissions (matrix, role cards, custom roles)

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import {
  PageHeader, SectionCard, StatCard, Button, Badge, Input, LoadingBlock, ErrorBlock,
  EmptyState, cn,
} from "@/components/pmct/kit";
import {
  ShieldCheck, Plus, RefreshCw, Pencil, Lock, Users as UsersIcon, Check,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

interface Permission { id?: string; code: string; category: string; description: string }
interface Role {
  id: string; name: string; code: string; description: string | null; level: number;
  isSystem: boolean; userCount: number; permissions: Permission[];
}

const CATEGORY_ORDER = ["EXECUTIVE", "PORTFOLIO", "PROJECT", "PLAN", "EXECUTE", "CONTROL", "GOVERNANCE", "CONNECT", "ADMIN"];
const CATEGORY_LABELS: Record<string, string> = {
  EXECUTIVE: "Executive", PORTFOLIO: "Portfolio", PROJECT: "Project", PLAN: "Plan",
  EXECUTE: "Execute", CONTROL: "Control", GOVERNANCE: "Governance", CONNECT: "Connect", ADMIN: "Administration",
};

export default function AdminRolesView() {
  const data = useApi<{ roles: Role[]; catalog: Permission[]; total: number }>("/api/admin/roles");

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const roles = data.data?.roles ?? [];
  const catalog = data.data?.catalog ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    catalog.forEach((p) => {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => (CATEGORY_ORDER.indexOf(a) + 99) - (CATEGORY_ORDER.indexOf(b) + 99));
  }, [catalog]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles & Permissions"
        breadcrumb={["Administration", "Roles"]}
        subtitle="The RBAC model — role cards define access levels, the matrix shows exactly which permission each role carries. System roles are protected; custom roles are fully editable."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={data.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Create custom role</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Roles" value={roles.length} sub={`${roles.filter((r) => r.isSystem).length} system · ${roles.filter((r) => !r.isSystem).length} custom`} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Permissions in catalog" value={catalog.length} sub={`${grouped.length} categories`} tone="info" />
        <StatCard label="Assigned users" value={roles.reduce((s, r) => s + r.userCount, 0)} icon={<UsersIcon className="h-4 w-4" />} />
      </div>

      {data.loading && !data.data ? <LoadingBlock label="Loading RBAC model…" />
        : data.error ? <ErrorBlock message={data.error} onRetry={data.refetch} /> : (
        <>
          {/* Role cards */}
          <SectionCard title="Role cards" description="Sorted by access level — the level number breaks ties in permission evaluation">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {roles.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                      <p className="text-[11px] font-mono text-slate-400">{r.code}</p>
                    </div>
                    <Badge variant="outline" className={r.isSystem ? "bg-slate-100 text-slate-500 border-slate-200 shrink-0" : "bg-blue-50 text-blue-700 border-blue-200 shrink-0"}>
                      {r.isSystem ? <><Lock className="h-3 w-3 mr-1" /> system</> : "custom"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed flex-1">{r.description ?? "—"}</p>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[11px] text-slate-400">Level <span className="font-semibold text-slate-600">{r.level}</span></span>
                    <span className="text-[11px] text-slate-400">{r.userCount} user{r.userCount === 1 ? "" : "s"} · {r.permissions.length} perms</span>
                    <Button
                      size="sm" variant={r.isSystem ? "ghost" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => r.isSystem ? toast.info(`${r.name} is a system role`, { description: "System roles are protected — create a custom role to model a variation." }) : setEditingRole(r)}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> {r.isSystem ? "View" : "Edit"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Permission matrix */}
          <SectionCard
            title="Permission matrix"
            description="Rows are the permission catalog grouped by category; columns are roles"
          >
            {roles.length === 0 ? <EmptyState title="No roles defined" /> : (
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[600px] bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-[1]">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left font-medium text-slate-500 px-3 py-2.5 uppercase tracking-wide min-w-[260px]">Permission</th>
                      {roles.map((r) => (
                        <th key={r.id} className="px-2 py-2.5 font-medium text-slate-600 whitespace-nowrap" title={r.description ?? r.name}>
                          <span className="block max-w-[64px] mx-auto truncate">{r.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(([cat, perms]) => (
                      <Fragment key={`cat-${cat}`}>
                        <tr className="bg-slate-50/60">
                          <td colSpan={roles.length + 1} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                            {CATEGORY_LABELS[cat] ?? cat}
                          </td>
                        </tr>
                        {perms.map((p) => (
                          <tr key={p.code} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/20">
                            <td className="px-3 py-2">
                              <span className="font-mono text-[11px] font-medium text-slate-700">{p.code}</span>
                              <span className="block text-[10px] text-slate-400">{p.description}</span>
                            </td>
                            {roles.map((r) => {
                              const has = r.permissions.some((rp) => rp.code === p.code);
                              return (
                                <td key={r.id} className="text-center px-2 py-2">
                                  {has
                                    ? <Check className="h-3.5 w-3.5 text-emerald-600 inline-block" aria-label={`${r.name} has ${p.code}`} />
                                    : <span className="text-slate-200">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <RoleFormDialog
        open={showCreate || editingRole !== null}
        role={editingRole}
        catalog={catalog}
        onClose={() => { setShowCreate(false); setEditingRole(null); }}
        onSaved={() => data.refetch()}
      />
    </div>
  );
}

// ---------- create / edit dialog ----------
function RoleFormDialog({ open, role, catalog, onClose, onSaved }: {
  open: boolean; role: Role | null; catalog: Permission[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = role !== null && !role.isSystem;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  if (open && seeded !== (role?.id ?? "new")) {
    setSeeded(role?.id ?? "new");
    setName(role?.name ?? "");
    setCode(role?.code ?? "");
    setDescription(role?.description ?? "");
    setSelected(role?.permissions.map((p) => p.code) ?? []);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    catalog.forEach((p) => {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => (CATEGORY_ORDER.indexOf(a) + 99) - (CATEGORY_ORDER.indexOf(b) + 99));
  }, [catalog]);

  const submit = async () => {
    if (isEdit) {
      if (selected.length === 0) { toast.error("Select at least one permission"); return; }
      setSaving(true);
      try {
        await api.patch(`/api/admin/roles/${role.id}`, {
          permissionCodes: selected,
          description: description.trim() || undefined,
        });
        toast.success(`Permissions updated for ${role.name}`);
        onSaved(); onClose();
      } catch (e) {
        toast.error("Could not update role", { description: e instanceof Error ? e.message : "Unknown error" });
      } finally { setSaving(false); }
    } else {
      if (name.trim().length < 2) { toast.error("Role name is required"); return; }
      if (!/^[A-Z0-9_]+$/.test(code.trim())) { toast.error("Code must be UPPER_SNAKE_CASE (A–Z, 0–9, underscores)"); return; }
      if (selected.length === 0) { toast.error("Select at least one permission"); return; }
      setSaving(true);
      try {
        await api.post("/api/admin/roles", {
          name: name.trim(), code: code.trim(),
          description: description.trim() || undefined, permissionCodes: selected,
        });
        toast.success(`Role "${name.trim()}" created`);
        onSaved(); onClose();
      } catch (e) {
        toast.error("Could not create role", { description: e instanceof Error ? e.message : "Unknown error" });
      } finally { setSaving(false); }
    }
  };

  const toggle = (code: string, on: boolean) =>
    setSelected((prev) => (on ? Array.from(new Set([...prev, code])) : prev.filter((c) => c !== code)));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit permissions — ${role?.name}` : "Create custom role"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Replace the permission set for this custom role. Users holding the role gain the new access immediately."
              : "Define a reusable access profile. Code must be UPPER_SNAKE_CASE — it is referenced in role assignments and the audit trail."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Role name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" placeholder="e.g. Delivery Lead" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-1 h-9 font-mono" placeholder="DELIVERY_LEAD" />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-slate-600">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1" placeholder="What is this role for?" />
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-slate-700">Permissions ({selected.length} selected)</Label>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(catalog.map((p) => p.code))}>Select all</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected([])}>Clear</Button>
              </div>
            </div>
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {grouped.map(([cat, perms]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{CATEGORY_LABELS[cat] ?? cat}</p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {perms.map((p) => (
                      <label key={p.code} className={cn(
                        "flex items-start gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors",
                        selected.includes(p.code) ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-slate-50/60 hover:border-blue-200",
                      )}>
                        <Checkbox checked={selected.includes(p.code)} onCheckedChange={(v) => toggle(p.code, v === true)} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-mono font-medium text-slate-700">{p.code}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save permissions" : "Create role"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
