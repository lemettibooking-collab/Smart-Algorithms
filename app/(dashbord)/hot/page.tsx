// app/hot/page.tsx
import { HotClient } from "@/components/hot-client";
import type { HotSymbol } from "@/components/hot-client";
import { headers } from "next/headers";

type HotResponse = {
  ok: boolean;
  data: HotSymbol[];
  ts: number;
};

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
  } catch (e: any) {
    console.log("[hot/page] initial fetch failed:", String(e?.message ?? e));
  }

  return (
    <main className="space-y-3">
      <h2 className="text-lg font-semibold">Hot symbols</h2>
      <p className="text-sm text-slate-400">
        Scanner feed (computed by selected period). Change “Period” to recalc.
      </p>

      <HotClient initialRows={initialRows} initialTf={tf as any} />
    </main>
  );
}
