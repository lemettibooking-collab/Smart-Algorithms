"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings2 } from "lucide-react";
import { ProductSwitcher } from "@/components/shell/product-switcher";
import { ThemeToggle } from "@/src/features/theme-toggle";

export default function Topbar() {
  const pathname = usePathname();
  const isTerminal = pathname === "/terminal";

  if (isTerminal) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-[var(--shadowSm)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ProductSwitcher className="w-[286px] shrink-0" />

            <div className="min-w-0">
              <div
                className="text-lg font-semibold text-slate-900 dark:text-[var(--text)]"
                style={{ textShadow: "var(--titleTextShadow)" }}
              >
                Scalp Terminal
              </div>
              <div className="text-xs text-[var(--muted2)]">Fast execution ladder workspace</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <span className="text-xs text-[var(--muted)]">Status nominal</span>
            </div>

            <ThemeToggle />

            <Link
              href="/settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
              aria-label="Open settings"
              title="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </Link>

            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-[var(--muted)]">Connected</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 shadow-[var(--shadowSm)]">
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-[var(--text)]" style={{ textShadow: "var(--titleTextShadow)" }}>
            Dashboard
          </div>
          <div className="text-xs text-[var(--muted2)]">Real-time crypto scanner</div>
        </div>

        <div className="flex-1" />

        <ThemeToggle />

        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel2)] px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-[var(--muted)]">Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
