"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  Bot,
  ChevronDown,
  Eye,
  Flame,
  LineChart,
  Radar,
  type LucideIcon,
} from "lucide-react";

type ProductBadge = "Live" | "Beta" | "Core";

type ProductItem = {
  href?: string;
  title: string;
  description: string;
  badge?: ProductBadge;
  icon: LucideIcon;
  visible?: boolean;
  disabled?: boolean;
};

const PRODUCT_ITEMS: ProductItem[] = [
  {
    href: "/hot",
    title: "Hot Scanner",
    description: "Momentum scanner and fast tape-driven discovery.",
    badge: "Live",
    icon: Flame,
  },
  {
    href: "/market-vision",
    title: "Market Vision",
    description: "Market structure workspace and directional context.",
    badge: "Core",
    icon: Eye,
  },
  {
    title: "Market Pulse",
    description: "Breadth and participation layer for market internals.",
    badge: "Beta",
    icon: LineChart,
    disabled: true,
  },
  {
    href: "/alerts",
    title: "Alerts & Events",
    description: "Event-driven alert review and signal triage.",
    badge: "Core",
    icon: BellRing,
  },
  {
    href: "/terminal",
    title: "Scalp Terminal",
    description: "Fast execution ladder workspace for active trading.",
    badge: "Live",
    icon: Radar,
  },
  {
    href: "/bots",
    title: "Analytics Center / Bots",
    description: "Automation workspace and strategy analytics hub.",
    badge: "Beta",
    icon: Bot,
  },
];

function badgeClasses(badge?: ProductBadge) {
  if (badge === "Live") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (badge === "Beta") return "border-sky-400/25 bg-sky-500/10 text-sky-200";
  return "border-white/10 bg-white/5 text-white/70";
}

export function ProductSwitcher({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = "product-switcher-panel";
  const products = useMemo(() => PRODUCT_ITEMS.filter((item) => item.visible !== false), []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={["relative", className].join(" ")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={[
          "group flex w-full items-center gap-3 rounded-full border px-3 py-2.5 text-left transition-all duration-200",
          "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]",
          "shadow-[0_14px_36px_rgba(2,6,23,0.22)] hover:border-white/15 hover:shadow-[0_18px_40px_rgba(2,6,23,0.28)]",
          open ? "border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]" : "",
        ].join(" ")}
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
          <div className="pointer-events-none absolute -top-4 left-2 h-8 w-8 rounded-full bg-white/10 blur-xl" />
          <Image
            src="/brand/logo.png"
            alt="Smart Algorithms"
            fill
            sizes="44px"
            className="object-contain p-1"
            priority
          />
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="whitespace-nowrap text-sm font-semibold text-slate-900 transition-colors group-hover:text-[var(--text)] dark:text-white/92"
            style={{ textShadow: "var(--brandTextShadow)" }}
          >
            Smart Algorithms
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">Crypto Platform</div>
        </div>

        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-[var(--muted)] transition-transform duration-200",
            open ? "rotate-180 text-[var(--text)]" : "",
          ].join(" ")}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute left-0 top-[calc(100%+12px)] z-50 w-[420px] max-w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[rgba(7,12,21,0.92)] p-3 shadow-[0_24px_60px_rgba(2,6,23,0.42)] backdrop-blur-xl"
          >
            <div className="px-1 pb-2 text-[11px] uppercase tracking-[0.14em] text-white/45">Products</div>

            <div className="space-y-2">
              {products.map((item) => {
                const active = Boolean(item.href && pathname === item.href);
                const Icon = item.icon;
                const content = (
                  <>
                    <div
                      className={[
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                        active
                          ? "border-sky-400/20 bg-sky-500/12 text-sky-200"
                          : item.disabled
                            ? "border-white/8 bg-white/[0.03] text-white/35"
                            : "border-white/10 bg-white/[0.04] text-white/70 group-hover/product:text-white/90",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={["text-sm font-medium", active ? "text-white" : item.disabled ? "text-white/45" : "text-white/90"].join(" ")}>
                          {item.title}
                        </span>
                        {item.badge ? (
                          <span className={["rounded-full border px-2 py-0.5 text-[10px] font-medium", badgeClasses(item.badge)].join(" ")}>
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className={["mt-1 text-[12px] leading-5", item.disabled ? "text-white/35" : "text-white/55"].join(" ")}>
                        {item.description}
                      </p>
                    </div>

                    {active ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-400" /> : null}
                  </>
                );

                const itemClassName = [
                  "group/product relative flex items-start gap-3 rounded-2xl border px-3 py-3 transition-all duration-200",
                  active
                    ? "border-sky-400/20 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.1)]"
                    : item.disabled
                      ? "cursor-default border-white/6 bg-white/[0.02]"
                      : "border-white/8 bg-white/[0.03] hover:translate-x-1 hover:border-white/12 hover:bg-white/[0.05]",
                ].join(" ");

                if (!item.href || item.disabled) {
                  return (
                    <div key={item.title} role="presentation" className={itemClassName}>
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={itemClassName}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
