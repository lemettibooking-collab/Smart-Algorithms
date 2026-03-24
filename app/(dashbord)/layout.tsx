"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/shell/sidebar";
import Topbar from "@/components/shell/topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTerminal = pathname === "/terminal";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-[rgba(var(--accent),0.14)] blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-[rgba(var(--accent2),0.12)] blur-[140px]" />
      </div>

      <div
        className={[
          "mx-auto flex w-full px-6 py-6",
          isTerminal ? "max-w-[1520px] gap-0" : "max-w-[1400px] gap-6",
        ].join(" ")}
      >
        {!isTerminal ? <Sidebar /> : null}
        <main className="min-w-0 flex-1">
          <Topbar />
          {!isTerminal ? <div id="topbar-slot" className="mt-4" /> : null}
          <div className={isTerminal ? "mt-4" : "mt-6"}>{children}</div>
        </main>
      </div>
    </div>
  );
}
