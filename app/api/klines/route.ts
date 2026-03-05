import { NextResponse } from "next/server";
import { z } from "zod";
import * as binance from "@/lib/binance";
import * as mexc from "@/lib/mexc";
import { validateQuery } from "@/src/shared/api";

export const runtime = "nodejs";

type Exchange = "binance" | "mexc";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

const querySchema = z.object({
  exchange: z.preprocess(
    (v) => (typeof v === "string" && v.trim().toLowerCase() === "mexc" ? "mexc" : "binance"),
    z.enum(["binance", "mexc"])
  ).default("binance"),
  symbol: z.string().trim().min(1, "symbol is required"),
  interval: z.string().trim().min(1).default("15m"),
  limit: z.coerce.number().default(60),
});

export async function GET(req: Request) {
  const v = validateQuery(req, querySchema);
  if (!v.ok) return v.res;

  const exchange = v.data.exchange as Exchange;
  const symbol = v.data.symbol.trim().toUpperCase();
  const interval = v.data.interval.trim();
  const limit = clamp(v.data.limit, 1, 1000);

  const api = exchange === "mexc" ? mexc : binance;

  if (!api.isValidInterval(interval)) {
    return NextResponse.json({ ok: false, error: `invalid interval: ${interval}` }, { status: 400 });
  }

  try {
    const candles = await api.fetchKlinesCached(symbol, interval, limit);
    return NextResponse.json({ ok: true, exchange, symbol, interval, limit, candles });
  } catch (e: unknown) {
    // ✅ мягко: не валим UI и не спамим 500 на "symbol not found"
    const msg = e instanceof Error ? e.message : String(e);

    // Частый кейс: 400/404 от биржи => отдаём пусто
    if (msg.includes(" 400") || msg.includes(" 404") || msg.toLowerCase().includes("invalid symbol")) {
      return NextResponse.json({ ok: true, exchange, symbol, interval, limit, candles: [] });
    }

    return NextResponse.json(
      { ok: false, exchange, symbol, interval, limit, error: msg },
      { status: 500 }
    );
  }
}
