import type { ReactNode } from "react";
import Sidebar from "@/components/shell/sidebar";
import Topbar from "@/components/shell/topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-[rgb(var(--bg-0))] text-white">
            <div className="pointer-events-none fixed inset-0 -z-10">
                <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-[rgba(var(--accent),0.14)] blur-[120px]" />
                <div className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-[rgba(var(--accent2),0.12)] blur-[140px]" />
            </div>

            <div className="mx-auto flex w-full max-w-[1400px] gap-6 px-6 py-6">
                <Sidebar />
                <main className="min-w-0 flex-1">
                    <Topbar />
                    <div id="topbar-slot" className="mt-4" />
                    <div className="mt-6">{children}</div>
                </main>
            </div>
        </div>
    );
}