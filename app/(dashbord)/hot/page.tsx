// app/hot/page.tsx
import { HotClient } from "@/components/hot-client";
import type { HotRow as HotSymbol } from "@/src/entities/hot";
import { headers } from "next/headers";

type HotResponse = {
  ok: boolean;
  data: HotSymbol[];
  ts: number;
};

type HotTf = "24h" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M" | "1y";

function toHotTf(tf: string): HotTf {
  const allowed: HotTf[] = ["24h", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M", "1y"];
  return allowed.includes(tf as HotTf) ? (tf as HotTf) : "24h";
}

async function getBaseUrl() {
  const h = await headers(); // ✅ важно: await
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// Единый контракт: канонично tf, но поддержим alias U (если кто-то открыл старую ссылку)
function pickTf(searchParams?: Record<string, string | string[] | undefined>) {
  const rawTf = searchParams?.tf;
  const rawU = searchParams?.U;

  const tf =
    (typeof rawTf === "string" && rawTf.trim()) ||
    (typeof rawU === "string" && rawU.trim()) ||
    "24h";

  return tf;
}

export default async function HotPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  let initialRows: HotSymbol[] = [];

  const sp = (await searchParams) ?? {};
  const tf = pickTf(sp);

  try {
    const baseUrl = await getBaseUrl();
    const qs = new URLSearchParams();
    qs.set("tf", tf); // ✅ канонично tf
    qs.set("limit", "50");

    const res = await fetch(`${baseUrl}/api/hot?${qs.toString()}`, { cache: "no-store" });

    if (res.ok) {
      const json = (await res.json()) as HotResponse;
      if (json?.ok && Array.isArray(json.data)) initialRows = json.data;
    } else {
      console.log("[hot/page] initial fetch not ok:", res.status);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[hot/page] initial fetch failed:", msg);
  }

  return (
    <main className="space-y-3">
      <h2 className="text-lg font-semibold">Hot symbols</h2>
      <p className="text-sm text-[var(--muted)]">
        Scanner feed (computed by selected period). Change “Period” to recalc.
      </p>

      <HotClient initialRows={initialRows} initialTf={toHotTf(tf)} />
    </main>
  );
}
