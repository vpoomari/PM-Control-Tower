import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Control Tower — Czarnikow × Optinus Project Control",
  description:
    "One platform. Complete project intelligence. Greater outcomes. Portfolio, program and project delivery with scheduling, resources, timesheets, financials, EVM, RAID, governance, automations and an AI PM assistant.",
  keywords: ["project management", "PMO", "portfolio", "EVM", "governance", "control tower"],
  authors: [{ name: "Control Tower · Czarnikow × Optinus" }],
};

export const viewport: Viewport = {
  themeColor: "#0B1026",
  width: "device-width",
  initialScale: 1,
};

// Apply the user's UI theme (localStorage "pmct_theme") before first paint so
// there is no flash of the wrong theme. Default: the Control Tower 3D theme.
const THEME_INIT = `try{var t=localStorage.getItem("pmct_theme");document.documentElement.setAttribute("data-theme",(t==="classic"||t==="ct3d")?t:"ct3d");}catch(e){document.documentElement.setAttribute("data-theme","ct3d");}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <Sonner position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
