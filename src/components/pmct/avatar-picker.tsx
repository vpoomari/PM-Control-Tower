"use client";
// PM CONTROL TOWER — Avatar picker: choose one of the 80 bundled avatars, or
// revert to colored initials. Persists to the session user and broadcasts a
// "pmct:session-updated" event so the shell re-reads /api/auth/me.

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { AVATAR_COUNT, avatarSrc } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AvatarPickerDialog({
  open, onOpenChange, current, onSaved, onPick, title, description,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current?: string | null;
  onSaved?: (url: string | null) => void;
  /** Admin/edit mode: persist through this callback instead of the session user. */
  onPick?: (url: string | null) => Promise<void>;
  title?: string;
  description?: string;
}) {
  const [saving, setSaving] = useState<number | null>(null);

  const pick = async (url: string | null) => {
    setSaving(url ? Number(url.split("-").pop()?.split(".")[0]) : 0);
    try {
      if (onPick) {
        // Managed mode — the caller persists the choice (e.g. admin user drawer)
        // and owns error reporting; the dialog simply stays open on failure.
        await onPick(url);
      } else {
        await api.patch("/api/auth/me", { avatarUrl: url });
        toast.success(url ? "Avatar updated" : "Switched to initials");
        window.dispatchEvent(new CustomEvent("pmct:session-updated"));
      }
      onSaved?.(url);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save avatar");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? "Choose your avatar"}</DialogTitle>
          <DialogDescription>{description ?? "Pick a face to represent you across the app, or keep your colored initials."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-10 gap-2 max-h-[52vh] overflow-y-auto pr-1 py-1">
          {Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map((n) => {
            const url = avatarSrc(n);
            const active = current === url;
            return (
              <button
                key={n}
                type="button"
                onClick={() => void pick(url)}
                disabled={saving !== null}
                aria-label={`Avatar ${n}`}
                aria-pressed={active}
                className={cn(
                  "relative h-10 w-10 rounded-full overflow-hidden ring-offset-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  active ? "ring-2 ring-blue-600" : "ring-1 ring-slate-200 hover:ring-blue-400",
                  saving !== null && "opacity-60"
                )}
              >
                <img src={url} alt={`Avatar ${n}`} className="h-full w-full object-cover bg-slate-100" loading="lazy" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <p className="text-xs text-slate-400">{AVATAR_COUNT} avatars available</p>
          <Button
            variant="outline"
            size="sm"
            disabled={saving !== null}
            onClick={() => void pick(null)}
          >
            Use initials instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
