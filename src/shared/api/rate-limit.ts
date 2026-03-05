import { NextResponse } from "next/server";

export type RateLimitConfig = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type Hit = {
  count: number;
  resetTs: number;
};

const hits = new Map<string, Hit>();
let nextSweepTs = 0;

function maybeSweep(now: number) {
  if (now < nextSweepTs) return;
  nextSweepTs = now + 30_000;
  for (const [k, v] of hits.entries()) {
    if (v.resetTs <= now) hits.delete(k);
  }
}

function safePart(v: string) {
  return v.replace(/[^\w:.-]/g, "_").slice(0, 120);
}

export function getClientIp(req: Request): string {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) {
    const first = xfwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export function rateLimitOr429(
  req: Request,
  cfg: RateLimitConfig,
  extraKeyParts: string[] = []
): { ok: true } | { ok: false; res: NextResponse } {
  const now = Date.now();
  maybeSweep(now);

  const ip = getClientIp(req);
  const key = [cfg.keyPrefix, ip, ...extraKeyParts.map((x) => safePart(String(x)))].join(":");
  const cur = hits.get(key);

  if (!cur || cur.resetTs <= now) {
    hits.set(key, { count: 1, resetTs: now + cfg.windowMs });
    return { ok: true };
  }

  if (cur.count >= cfg.max) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "rate_limited", retryAfterMs: Math.max(0, cur.resetTs - now) },
        { status: 429 }
      ),
    };
  }

  cur.count += 1;
  hits.set(key, cur);
  return { ok: true };
}
