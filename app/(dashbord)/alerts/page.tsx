// app/alerts/page.tsx
import AlertsClient from "@/components/alerts-client";

export default function AlertsPage() {
    return (
        <main className="p-4">
            <div className="mb-3">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-[var(--text)]" style={{ textShadow: "var(--titleTextShadow)" }}>
                    Alerts
                </h1>
                <p className="text-sm opacity-70">Multi-exchange (Binance + MEXC), dedupe by baseAsset (Binance priority).</p>
            </div>

            <AlertsClient />
        </main>
    );
}
