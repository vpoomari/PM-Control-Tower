const fs = require("fs");
let v = fs.readFileSync("src/views/integrity/integrity.tsx", "utf8");
// react import with useRef
v = v.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";');
// realtime refetch
v = v.replace('import { api, useApi } from "@/lib/client";', 'import { api, useApi, useRealtimeRefetch } from "@/lib/client";');
// recharts
v = v.replace('import { ExternalLink } from "lucide-react";', 'import { ExternalLink } from "lucide-react";\nimport { AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, Cell as BarCell } from "recharts";');
// HATCH + dayToDate helpers before LEVEL_TONE
if (!v.includes("const HATCH")) {
  v = v.replace(
    "const LEVEL_TONE:",
    `const HATCH = { backgroundImage: "repeating-linear-gradient(45deg, rgba(15,23,42,0.07) 0 6px, transparent 6px 12px)" };
const dayToDate = (startISO: string, day: number) => new Date(new Date(startISO).getTime() + day * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const LEVEL_TONE:`
  );
}
fs.writeFileSync("src/views/integrity/integrity.tsx", v);
console.log("imports fixed:", v.includes("useRef"), v.includes("ResponsiveContainer"), v.includes("const HATCH"), v.includes("const dayToDate"));
