import { NextResponse } from "next/server";
import { z } from "zod";
import { computeEventId, listEvents, putEvent, type EventRecord } from "@/lib/repos/eventsRepo";
import { validateBody, validateQuery } from "@/src/shared/api";

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

const getQuerySchema = z.object({
  limit: z.coerce.number().default(100),
  symbol: z.string().trim().optional().default(""),
  type: z.string().trim().optional().default(""),
  exchange: z.string().trim().optional().default(""),
  since: z.coerce.number().optional(),
});

const postBodySchema = z.object({
  id: z.unknown().optional(),
  ts: z.unknown().optional(),
  exchange: z.unknown(),
  symbol: z.unknown(),
  type: z.unknown(),
  importantKey: z.unknown().optional(),
  bucketMs: z.unknown().optional(),
  payload: z.unknown().optional(),
});

export async function GET(req: Request) {
  const v = validateQuery(req, getQuerySchema);
  if (!v.ok) return v.res;
  const limit = clamp(v.data.limit, 1, 2000);
  const symbol = v.data.symbol;
  const type = v.data.type;
  const exchange = v.data.exchange;
  const sinceTs = v.data.since;

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
  const v = await validateBody(req, postBodySchema);
  if (!v.ok) return v.res;
  const body = v.data as PostBody;

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
}
