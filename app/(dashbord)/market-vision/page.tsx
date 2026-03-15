import { MarketPulseBar } from "@/src/widgets/market-pulse";
import { AdvancedMarketStructureGrid } from "@/src/widgets/market-structure";

export default function MarketVisionPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[var(--text)]" style={{ textShadow: "var(--titleTextShadow)" }}>
          Market Vision
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Market-wide context and sentiment.</p>
      </div>

      <MarketPulseBar />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-[var(--text)]" style={{ textShadow: "var(--titleTextShadow)" }}>
            Advanced Market Structure
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Rotation, derivatives, leadership and participation.</p>
        </div>

        <AdvancedMarketStructureGrid />
      </section>
    </main>
  );
}
