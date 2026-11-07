"use client";
// PM CONTROL TOWER — UI theme selector.
// Two selectable looks, both fully supported by the existing app:
//   - "ct3d"    : Control Tower 3D — the colorful, glossy, floating-surface brand theme
//   - "classic" : the original base/simple enterprise theme (pixel-identical to before)
// The choice persists in localStorage("pmct_theme") and is applied pre-paint by the
// inline script in src/app/layout.tsx, so there is no flash of the wrong theme.

import { useSyncExternalStore } from "react";
import { Palette, LayoutPanelTop, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type CtTheme = "ct3d" | "classic";

export const CT_THEME_STORAGE_KEY = "pmct_theme";

export const CT_THEMES: { id: CtTheme; label: string; hint: string }[] = [
  { id: "ct3d", label: "Control Tower 3D", hint: "Colorful glossy surfaces · gradients · depth" },
  { id: "classic", label: "Classic", hint: "Base, simple enterprise look" },
];

/** Current theme from localStorage (defaults to the Control Tower 3D theme). */
export function readCtTheme(): CtTheme {
  if (typeof window === "undefined") return "ct3d";
  try {
    const t = window.localStorage.getItem(CT_THEME_STORAGE_KEY);
    return t === "classic" ? "classic" : "ct3d";
  } catch {
    return "ct3d";
  }
}

/** Apply + persist the theme and notify listeners in this tab. */
export function applyCtTheme(theme: CtTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(CT_THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
  window.dispatchEvent(new CustomEvent<CtTheme>("pmct:theme", { detail: theme }));
}

// The theme is an external store: subscribe to same-tab ("pmct:theme") and
// cross-tab ("storage") changes so every open tab stays in sync.
function subscribe(onStoreChange: () => void): () => void {
  const onChange = () => onStoreChange();
  window.addEventListener("pmct:theme", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("pmct:theme", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Topbar theme selector (dropdown). Reflects the live theme and stays in sync across tabs. */
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, readCtTheme, () => "ct3d" as CtTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Theme" title="Switch UI theme">
          <Palette className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">UI theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CT_THEMES.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => applyCtTheme(t.id)} className="gap-2 py-1.5">
            {t.id === "ct3d" ? <Palette className="h-4 w-4 text-slate-400" /> : <LayoutPanelTop className="h-4 w-4 text-slate-400" />}
            <span className="flex-1">
              <span className="block text-[13px] font-medium">{t.label}</span>
              <span className="block text-[10px] text-slate-400 font-normal">{t.hint}</span>
            </span>
            {theme === t.id && <Check className="h-4 w-4 text-blue-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
