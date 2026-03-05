import { z } from "zod";
import { validateQuery, rateLimitOr429 } from "@/src/shared/api";

export const runtime = "nodejs";

const encoder = new TextEncoder();

const querySchema = z.object({
  pollMs: z.coerce.number().default(5000),
});

function sseChunk(event: "hello" | "hot" | "ping", data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(req: Request): Promise<Response> {
  const v = validateQuery(req, querySchema);
  if (!v.ok) return v.res;

  const rl = rateLimitOr429(req, { keyPrefix: "api:stream-hot", max: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.res;

  const reqUrl = new URL(req.url);
  const pollMs = Math.max(2000, Math.min(10_000, v.data.pollMs));
  const hotParams = new URLSearchParams(reqUrl.searchParams);
  hotParams.delete("pollMs");

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let lastTs = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: "hello" | "hot" | "ping", data: unknown) => {
        if (closed) return;
        controller.enqueue(sseChunk(event, data));
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const hotUrl = new URL("/api/hot", reqUrl.origin);
          hotUrl.search = hotParams.toString();
          const res = await fetch(hotUrl.toString(), { cache: "no-store" });
          if (!res.ok) return;
          const json = (await res.json()) as Record<string, unknown>;
          const ts = Number(json.ts ?? 0);
          if (!Number.isFinite(ts) || ts <= 0) return;
          if (ts === lastTs) return;
          lastTs = ts;
          push("hot", json);
        } catch {
          // ignore transient tick errors
        }
      };

      push("hello", { ts: Date.now() });
      void tick();
      pollTimer = setInterval(() => {
        void tick();
      }, pollMs);
      pingTimer = setInterval(() => {
        push("ping", { ts: Date.now() });
      }, 30_000);

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
