"use client";
// PM CONTROL TOWER — Shared person avatar.
// Renders the chosen bundled avatar image when a user has one (avatarUrl), and
// falls back to colored initials otherwise. Same footprint in every size so a
// name always sits next to a face across the app.

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  name?: string | null;
  color?: string | null;
  url?: string | null;
  className?: string;
  /** Tailwind size classes for the circle. */
  size?: string;
  title?: string;
}

export function Avatar({ name, color, url, className, size = "h-5 w-5 text-[8px]", title }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = title ?? name ?? undefined;

  if (!name) {
    return (
      <span
        title={label}
        className={cn(
          "rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0 select-none",
          size,
          className
        )}
      >
        —
      </span>
    );
  }

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt={name}
        title={label}
        onError={() => setImgFailed(true)}
        className={cn(
          "rounded-full object-cover shrink-0 border border-slate-200/70 bg-white",
          size,
          className
        )}
      />
    );
  }

  return (
    <span
      title={label}
      style={{ backgroundColor: color || "#1e3a5f" }}
      className={cn(
        "rounded-full text-white font-bold flex items-center justify-center shrink-0 select-none",
        size,
        className
      )}
    >
      {initials}
    </span>
  );
}
