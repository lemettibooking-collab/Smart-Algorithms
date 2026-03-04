// lib/server-cache.ts
// Минимальный набор: TTL cache, in-flight dedupe, concurrency limiter, retry helper.
// Работает в Node runtime (Next.js API route).

type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

export class TTLCache<T> {
    private map = new Map<string, CacheEntry<T>>();

    constructor(private defaultTtlMs: number, private maxEntries = 2000) { }

    get(key: string): T | undefined {
        const ent = this.map.get(key);
        if (!ent) return undefined;
        if (Date.now() > ent.expiresAt) {
            this.map.delete(key);
            return undefined;
        }
        return ent.value;
    }

    set(key: string, value: T, ttlMs?: number) {
        // простая защита от разрастания
        if (this.map.size >= this.maxEntries) {
            // удаляем ~10% старых/первых
            const n = Math.max(1, Math.floor(this.maxEntries * 0.1));
            const it = this.map.keys();
            for (let i = 0; i < n; i++) {
                const k = it.next().value as string | undefined;
                if (!k) break;
                this.map.delete(k);
            }
        }
        const ttl = ttlMs ?? this.defaultTtlMs;
        this.map.set(key, { value, expiresAt: Date.now() + ttl });
    }

    has(key: string) {
        return this.get(key) !== undefined;
    }

    delete(key: string) {
        this.map.delete(key);
    }
}

// In-flight dedupe: одинаковые ключи возвращают один и тот же Promise
export class InFlight<T> {
    private map = new Map<string, Promise<T>>();

    get(key: string): Promise<T> | undefined {
        return this.map.get(key);
    }

    set(key: string, p: Promise<T>) {
        this.map.set(key, p);
        // гарантированно чистим
        p.finally(() => this.map.delete(key)).catch(() => { });
    }

    delete(key: string) {
        this.map.delete(key);
    }
}

// Concurrency limiter (семофор)
export function createLimiter(concurrency: number) {
    let active = 0;
    const queue: Array<() => void> = [];

    const next = () => {
        active--;
        const fn = queue.shift();
        if (fn) fn();
    };

    return async function limit<T>(fn: () => Promise<T>): Promise<T> {
        if (active >= concurrency) {
            await new Promise<void>((resolve) => queue.push(resolve));
        }
        active++;
        try {
            const out = await fn();
            next();
            return out;
        } catch (e) {
            next();
            throw e;
        }
    };
}

export function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
    url: string,
    init: RequestInit,
    opts?: { retries?: number; minDelayMs?: number; maxDelayMs?: number }
) {
    const retries = opts?.retries ?? 1; // 1 повтор достаточно
    const minDelay = opts?.minDelayMs ?? 200;
    const maxDelay = opts?.maxDelayMs ?? 600;

    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= retries) {
        try {
            const res = await fetch(url, init);
            // retry только на “временных” статусов
            if (res.status === 429 || res.status >= 500) {
                if (attempt === retries) return res;
                const jitter = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
                await sleep(jitter);
                attempt++;
                continue;
            }
            return res;
        } catch (e) {
            lastErr = e;
            if (attempt === retries) throw e;
            const jitter = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
            await sleep(jitter);
            attempt++;
        }
    }

    throw lastErr ?? new Error("fetchWithRetry failed");
}
