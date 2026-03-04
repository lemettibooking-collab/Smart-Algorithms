import { NextResponse } from "next/server";
import { computeEventId, listEvents, putEvent, type EventRecord } from "@/lib/repos/eventsRepo";

export const runtime = "nodejs";

type PostBody = {
  id?: unknown;
  ts?: unknown;
  exchange?: unknown;
  symbol?: unknown;
  type?: unknown;
  importantKey?: unknown;
  bucketMs?: unknown;
  payload?: unknown;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function toStr(v: unknown) {
  return String(v ?? "").trim();
}

function asPayload(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? "100") || 100, 1, 2000);
  const symbol = toStr(url.searchParams.get("symbol") ?? "");
  const type = toStr(url.searchParams.get("type") ?? "");
  const exchange = toStr(url.searchParams.get("exchange") ?? "");
  const sinceRaw = Number(url.searchParams.get("since") ?? Number.NaN);
  const sinceTs = Number.isFinite(sinceRaw) ? sinceRaw : undefined;

  const data = listEvents({
    limit,
    symbol: symbol || undefined,
    type: type || undefined,
    exchange: exchange || undefined,
    sinceTs,
  });

  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PostBody;

    const exchange = toStr(body.exchange).toLowerCase();
    const symbol = toStr(body.symbol).toUpperCase();
    const type = toStr(body.type).toLowerCase();

    if (!exchange || !symbol || !type) {
      return NextResponse.json({ ok: false, error: "exchange/symbol/type required" }, { status: 400 });
    }

    const tsRaw = Number(body.ts ?? Date.now());
    const ts = Number.isFinite(tsRaw) ? tsRaw : Date.now();

    const id =
      toStr(body.id) ||
      computeEventId({
        exchange,
        symbol,
        type,
        importantKey: toStr(body.importantKey),
        bucketMs: Number(body.bucketMs ?? 30_000) || 30_000,
        ts,
      });

    const event: EventRecord = {
      id,
      ts,
      exchange,
      symbol,
      type,
      payload: asPayload(body.payload),
    };

    putEvent(event, "ignore");
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid_json";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
