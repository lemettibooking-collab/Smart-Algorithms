"use client";

export default function Topbar() {
    return (
        <div className="rounded-2xl border border-white/10 bg-[rgb(var(--bg-1))] px-5 py-4">
            <div className="flex items-center gap-4">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/90">Dashboard</div>
                    <div className="text-xs text-white/50">Real-time crypto scanner</div>
                </div>

                <div className="flex-1" />

                <div className="hidden lg:flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-xs text-white/70">Connected</span>
                    </div>
                </div>
            </div>
        </div>
    );
}