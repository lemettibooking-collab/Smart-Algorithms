import { z } from "zod";
import { validateQuery, rateLimitOr429 } from "@/src/shared/api";
import { MARKET_PULSE_STREAM } from "@/src/shared/config/market-pulse";
import { getMarketPulseSnapshot, getBtcPulseSnapshot } from "@/src/shared/api/server/market-pulse";

export const runtime = "nodejs";

const encoder = new TextEncoder();

const querySchema = z.object({
  pollMs: z.coerce.number().default(MARKET_PULSE_STREAM.btcPollMs),
});

type MarketPulseEvent = "hello" | "snapshot" | "btc" | "ping";

function sseChunk(event: MarketPulseEvent, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(req: Request): Promise<Response> {
  const v = validateQuery(req, querySchema);
  if (!v.ok) return v.res;

  const rl = rateLimitOr429(req, { keyPrefix: "api:stream-market-pulse", max: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const pollMs = Math.max(2_000, Math.min(10_000, v.data.pollMs));
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let lastBtcTs = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: MarketPulseEvent, data: unknown) => {
        if (closed) return;
        controller.enqueue(sseChunk(event, data));
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (pingTimer) clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          // ignored
        }
      };

      const tickBtc = async () => {
        if (closed) return;
        try {
          const btc = await getBtcPulseSnapshot();
          if (btc.updatedAt <= lastBtcTs) return;
          lastBtcTs = btc.updatedAt;
          push("btc", btc);
        } catch {
          // ignore transient BTC issues
        }
      };

      push("hello", { ts: Date.now() });
      void getMarketPulseSnapshot()
        .then((snapshot) => push("snapshot", snapshot))
        .catch(() => {});
      void tickBtc();

      pollTimer = setInterval(() => {
        void tickBtc();
      }, pollMs);
      pingTimer = setInterval(() => {
        push("ping", { ts: Date.now() });
      }, MARKET_PULSE_STREAM.heartbeatMs);

      req.signal.addEventListener("abort", shutdown, { once: true });
    },
    cancel() {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (pingTimer) clearInterval(pingTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
