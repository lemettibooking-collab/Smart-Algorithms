import { listEvents } from "@/lib/repos/eventsRepo";

export const runtime = "nodejs";

const encoder = new TextEncoder();

type EventType = "hello" | "ping" | "event";

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function toNum(v: string | null | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function sseChunk(event: EventType, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const tf = (url.searchParams.get("tf") ?? "").trim();
  const limit = clamp(toNum(url.searchParams.get("limit"), 200), 1, 1000);
  const pollMs = clamp(toNum(url.searchParams.get("pollMs"), 2000), 500, 10_000);
  const includeCalm = (url.searchParams.get("includeCalm") ?? "0") === "1";
  const minScore = toNum(url.searchParams.get("minScore"), 0);
  const signalsRaw = (url.searchParams.get("signals") ?? "").trim();
  const signals = new Set(
    signalsRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  );

  let lastTs = toNum(url.searchParams.get("since"), Date.now());

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: EventType, data: unknown) => {
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

      const tick = () => {
        if (closed) return;

        const rows = listEvents({ limit, sinceTs: lastTs + 1 });
        if (!rows.length) return;

        const asc = [...rows].sort((a, b) => a.ts - b.ts);
        for (const row of asc) {
          const payload = asObj(row.payload);
          if (!payload) continue;

          const payloadTf = typeof payload.tf === "string" ? payload.tf : "";
          if (tf && payloadTf !== tf) continue;

          const score = Number(payload.score ?? 0);
          if (Number.isFinite(score) && score < minScore) continue;

          const signal = typeof payload.signal === "string" ? payload.signal : "";
          if (!includeCalm && signal.toLowerCase() === "calm") continue;
          if (signals.size > 0 && !signals.has(signal)) continue;

          const out = {
            ...payload,
            eventId: typeof payload.eventId === "string" && payload.eventId
              ? payload.eventId
              : row.id,
            ts: Number(payload.ts ?? row.ts) || row.ts,
          };

          push("event", out);
          if (row.ts > lastTs) lastTs = row.ts;
        }
      };

      push("hello", { ts: Date.now() });
      tick();

      pollTimer = setInterval(tick, pollMs);
      pingTimer = setInterval(() => {
        push("ping", { ts: Date.now() });
      }, 30_000);

      req.signal.addEventListener("abort", shutdown, { once: true });
    },
    cancel() {
      closed = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
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
