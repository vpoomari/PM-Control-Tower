"use client";
// PM CONTROL TOWER — ADMIN · User administration (accounts, roles, activity)

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, StatCard, DataTable, Column, StatusChip, Button, Badge, Input,
  LoadingBlock, ErrorBlock, EmptyState, cn,
} from "@/components/pmct/kit";
import { Drawer, DrawerSection, KV } from "../connect/shared/drawer";
import { fmtDateTime } from "@/lib/constants";
import {
  Users, UserPlus, RefreshCw, Pencil, ShieldCheck, ShieldOff, Activity,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface UserRow {
  id: string; email: string; name: string; title: string | null; department: string | null;
  avatarColor: string; isActive: boolean; isSuperAdmin: boolean; lastLoginAt: string | null;
  createdAt: string; roles: Array<{ id: string; code: string; name: string; level: number }>;
}
interface AuditRow {
  id: string; action: string; entityType: string; entityName: string | null;
  severity: string; createdAt: string; ipAddress: string | null;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function AdminUsersView() {
  const users = useApi<{ users: UserRow[]; total: number; active: number }>("/api/admin/users");
  const roles = useApi<{ roles: Array<{ id: string; name: string; code: string; level: number; isSystem: boolean; userCount: number }> }>("/api/admin/roles");
  useRealtimeRefetch(users.refetch, ["audit:created"]);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");

  const all = users.data?.users ?? [];
  const rows = all.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      || (u.title ?? "").toLowerCase().includes(q) || u.roles.some((r) => r.name.toLowerCase().includes(q));
  });
  // Derive the drawer's user from the freshest list data: after a role change or
  // activation toggle the refetch updates `all`, and the open drawer re-renders
  // with current values instead of the stale snapshot it was opened with.
  const editingUser = editing ? (all.find((u) => u.id === editing.id) ?? editing) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        io="users"
        title="Users"
        breadcrumb={["Administration", "Users"]}
        subtitle="Directory of platform identities, their roles and access state. Role changes and deactivations are written to the audit trail."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={users.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><UserPlus className="h-4 w-4 mr-1.5" /> New user</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Users" value={users.data?.total ?? "—"} sub={`${users.data?.active ?? "—"} active`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Inactive" value={all.filter((u) => !u.isActive).length} tone={all.some((u) => !u.isActive) ? "warn" : "good"} icon={<ShieldOff className="h-4 w-4" />} />
        <StatCard label="Roles assigned" value={new Set(all.flatMap((u) => u.roles.map((r) => r.code))).size} sub="Distinct role codes in use" icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <SectionCard title="Directory" description="Click a user to manage roles and view recent activity">
        <div className="mb-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, title or role…" className="h-9 max-w-sm bg-white" />
        </div>
        {users.loading && !users.data ? <LoadingBlock label="Loading directory…" />
          : users.error ? <ErrorBlock message={users.error} onRetry={users.refetch} />
          : rows.length === 0 ? <EmptyState title="No users match" description="Adjust the search to find directory entries." />
          : (
          <DataTable<UserRow & Record<string, unknown>>
            keyField="id"
            rows={rows as (UserRow & Record<string, unknown>)[]}
            onRowClick={(u) => setEditing(u)}
            maxHeight="560px"
            columns={[
              { key: "name", header: "User", render: (u) => (
                <div className="flex items-center gap-3 min-w-[220px]">
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                    style={{ background: u.avatarColor || "#0b1f3a" }}
                  >
                    {initials(u.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{u.name}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                </div>
              ) },
              { key: "title", header: "Title", render: (u) => <span className="text-slate-600 text-xs">{u.title ?? "—"}</span> },
              { key: "roles", header: "Roles", render: (u) => (
                <div className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r.id} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-normal">{r.name}</Badge>
                  ))}
                </div>
              ) },
              { key: "isActive", header: "Status", render: (u) => <StatusChip status={u.isActive ? "ACTIVE" : "INACTIVE"} /> },
              { key: "lastLoginAt", header: "Last login", render: (u) => <span className="text-xs tabular-nums text-slate-500">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "never"}</span> },
              { key: "actions", header: "", render: (u) => (
                <div className="justify-end" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(u)}>
                    <Pencil className="h-3 w-3 mr-1" /> Manage
                  </Button>
                </div>
              ) },
            ] as Column<UserRow & Record<string, unknown>>[]}
          />
        )}
      </SectionCard>

      <CreateUserDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        roles={roles.data?.roles ?? []}
        onCreated={() => users.refetch()}
      />
      <UserDrawer
        user={editingUser}
        onClose={() => setEditing(null)}
        roles={roles.data?.roles ?? []}
        onChanged={() => users.refetch()}
      />
    </div>
  );
}

// ---------- create ----------
function CreateUserDialog({ open, onOpenChange, roles, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
  roles: Array<{ id: string; name: string; code: string }>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [roleCode, setRoleCode] = useState("PROJECT_MANAGER");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) { toast.error("Full name is required"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast.error("Enter a valid email address"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.post("/api/admin/users", {
        email: email.trim(), name: name.trim(), password, title: title.trim() || undefined, roleCode,
      });
      toast.success("User created", { description: `${name.trim()} can sign in with the password you set.` });
      onOpenChange(false);
      setEmail(""); setName(""); setPassword(""); setTitle("");
      onCreated();
    } catch (e) {
      toast.error("Could not create user", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>Creates the identity, hashes the password and assigns the selected role. The action is audited.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" placeholder="e.g. Jordan Blake" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9" placeholder="e.g. Senior PM" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9" placeholder="name@company.io" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Password (min 8 characters)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-9 font-mono" placeholder="Temporary password to hand over securely" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Role</Label>
            <Select value={roleCode} onValueChange={setRoleCode}>
              <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.id} value={r.code}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create user"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- manage drawer ----------
function UserDrawer({ user, onClose, roles, onChanged }: {
  user: UserRow | null; onClose: () => void;
  roles: Array<{ id: string; name: string; code: string }>; onChanged: () => void;
}) {
  const [roleCode, setRoleCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [auditKey, setAuditKey] = useState<string | null>(null);

  const activity = useApi<{ events: AuditRow[] }>(
    user ? `/api/audit?userId=${user.id}&take=10` : null,
    [user?.id ?? "", auditKey ?? ""],
  );

  const seedRole = user?.roles[0]?.code ?? "";
  const currentRole = roleCode || seedRole;

  const applyRole = async () => {
    if (!user || !currentRole) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${user.id}`, { roleCode: currentRole });
      toast.success(`Role updated for ${user.name}`, { description: `Now ${roles.find((r) => r.code === currentRole)?.name ?? currentRole}. Change recorded in the audit trail.` });
      onChanged();
      setAuditKey(String(Date.now()));
    } catch (e) {
      toast.error("Could not change role", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  const setActive = async (next: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${user.id}`, { isActive: next });
      toast.success(`${user.name} ${next ? "activated" : "deactivated"}`, { description: "Recorded in the audit trail." });
      onChanged();
      setAuditKey(String(Date.now()));
    } catch (e) {
      toast.error("Could not update status", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={user !== null} onOpenChange={(v) => { if (!v) { setRoleCode(""); onClose(); } }} title={user?.name ?? "User"} description={user?.email} wide>
      {!user ? null : (
        <>
          <DrawerSection title="Account">
            <KV label="Status"><StatusChip status={user.isActive ? "ACTIVE" : "INACTIVE"} /></KV>
            <KV label="Title">{user.title ?? "—"}</KV>
            <KV label="Department">{user.department ?? "—"}</KV>
            <KV label="Roles">{user.roles.map((r) => r.name).join(", ") || "none"}</KV>
            <KV label="Last login">{user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : "never"}</KV>
            <KV label="Created">{fmtDateTime(user.createdAt)}</KV>
          </DrawerSection>

          <DrawerSection title="Change role">
            <div className="flex items-center gap-2">
              <Select value={currentRole} onValueChange={setRoleCode}>
                <SelectTrigger className="h-9 flex-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.code}>{r.name} ({r.code})</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={applyRole} disabled={saving || currentRole === seedRole}>Apply</Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Audit note: every role change persists before/after values with severity WARNING.</p>
          </DrawerSection>

          <DrawerSection title="Access">
            {user.isActive ? (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setActive(false)} disabled={saving}>
                <ShieldOff className="h-4 w-4 mr-1.5" /> Deactivate account
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setActive(true)} disabled={saving}>
                <ShieldCheck className="h-4 w-4 mr-1.5" /> Activate account
              </Button>
            )}
            <p className="text-[10px] text-slate-400 mt-2">Deactivation preserves history; the user can no longer sign in.</p>
          </DrawerSection>

          <DrawerSection title="Recent activity">
            {activity.loading ? <LoadingBlock label="Loading audit events…" />
              : activity.error ? <ErrorBlock message={activity.error} onRetry={activity.refetch} />
              : !activity.data || activity.data.events.length === 0 ? <EmptyState title="No recorded activity" description="Audit events for this user will appear here." />
              : activity.data.events.map((ev) => (
                <div key={ev.id} className={cn("flex items-center gap-2.5 rounded-md border border-slate-100 px-2.5 py-1.5 mb-1.5")}>
                  <Activity className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">
                      {ev.action.replace(/_/g, " ")} <span className="text-slate-400">· {ev.entityType}{ev.entityName ? ` — ${ev.entityName}` : ""}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 tabular-nums">{fmtDateTime(ev.createdAt)}{ev.ipAddress ? ` · ${ev.ipAddress}` : ""}</p>
                  </div>
                  <StatusChip status={ev.severity} />
                </div>
              ))}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}
