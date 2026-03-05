"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

const nav = [
    { href: "/hot", label: "Hot Scanner" },
    { href: "/alerts", label: "Alerts Table" }, // ← добавили
    { href: "/terminal", label: "Trading Terminal" },
    { href: "/bots", label: "Trading Bots" },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-[260px] shrink-0">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadowSm)]">
                <div className="flex items-center gap-3">
                    {/* LOGO */}
                    <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--controlsBg)] dark:border-white/10 dark:bg-[#0b1220]">
                        <div className="pointer-events-none absolute -top-4 left-2 h-8 w-8 rounded-full bg-white/10 blur-xl" />
                        <Image
                            src="/brand/logo.png"
                            alt="Smart Algorithms"
                            fill
                            sizes="40px"
                            className="object-contain p-0.5"
                            priority
                        />
                    </div>

                    {/* Title */}
                    <div className="flex h-10 items-center">
                        <div
                            className="text-base font-semibold leading-none text-slate-900 dark:text-white/92"
                            style={{
                                textShadow: "var(--brandTextShadow)",
                            }}
                        >
                            Smart Algorithms
                        </div>
                    </div>
                </div>

                <div className="mt-6 space-y-1">
                    {nav.map((i) => {
                        const active = pathname === i.href;
                        return (
                            <Link
                                key={i.href}
                                href={i.href}
                                className={[
                                    "flex items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                                    active
                                        ? "bg-[var(--panel2)] text-[var(--text)] ring-1 ring-[rgba(var(--accent),0.25)]"
                                        : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                                ].join(" ")}
                            >
                                <span>{i.label}</span>
                                {active ? <span className="h-2 w-2 rounded-full bg-[rgb(var(--accent))]" /> : null}
                            </Link>
                        );
                    })}
                </div>

                <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted)]">
                    <div className="font-medium text-[var(--text)]">Status</div>
                    <div className="mt-1 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>Live (WS)</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
