"use client";

import { usePathname } from "next/navigation";
import { ProductSwitcher } from "@/components/shell/product-switcher";

export default function Sidebar() {
  const pathname = usePathname();

  if (pathname === "/terminal") {
    return null;
  }

  return (
    <aside className="w-[286px] shrink-0 border-r border-[var(--border)] pr-5 dark:border-[var(--border)]">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadowSm)]">
        <ProductSwitcher />
      </div>
    </aside>
  );
}
