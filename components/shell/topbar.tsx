"use client";

import { ThemeToggle } from "@/src/features/theme-toggle";

export default function Topbar() {
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
