import { NextResponse } from "next/server";
import * as binance from "@/lib/binance";
import * as mexc from "@/lib/mexc";

export const runtime = "nodejs";

type Exchange = "binance" | "mexc";

function getExchange(sp: URLSearchParams): Exchange {
  const ex = (sp.get("exchange") || "binance").trim().toLowerCase();
  return ex === "mexc" ? "mexc" : "binance";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const exchange = getExchange(sp);
  const symbol = (sp.get("symbol") || "").trim().toUpperCase();
  const interval = (sp.get("interval") || "15m").trim();
  const limit = clamp(Number(sp.get("limit") || "60"), 1, 1000);

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "symbol is required" }, { status: 400 });
  }

  const api = exchange === "mexc" ? mexc : binance;

  if (!api.isValidInterval(interval)) {
    return NextResponse.json({ ok: false, error: `invalid interval: ${interval}` }, { status: 400 });
  }

  try {
    const candles = await api.fetchKlinesCached(symbol, interval, limit);
    return NextResponse.json({ ok: true, exchange, symbol, interval, limit, candles });
  } catch (e: any) {
    // ✅ мягко: не валим UI и не спамим 500 на "symbol not found"
    const msg = String(e?.message ?? e);

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