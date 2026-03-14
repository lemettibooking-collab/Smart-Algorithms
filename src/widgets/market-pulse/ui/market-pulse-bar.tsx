"use client";

import { useEffect, useState } from "react";
import type { BtcPulseDto, MarketPulseDto } from "@/src/entities/market-pulse";
import { BtcLiveCard, FearGreedCard, GlobalRiskCard, NewsSentimentCard } from "@/src/entities/market-pulse";
import { fetchMarketPulseSnapshot, marketPulseStreamUrl } from "@/src/shared/api/market-pulse";

function emptySnapshot(): MarketPulseDto {
  const now = Date.now();
  return {
    fearGreed: {
      value: 50,
      label: "neutral",
      updatedAt: now,
      nextUpdateInSec: 0,
      source: "alternative.me",
    },
    btc: {
      price: 0,
      change24hPct: 0,
      direction: "flat",
      updatedAt: now,
      source: "binance",
    },
    sentiment: {
      score: 0,
      label: "neutral",
      drivers: ["Loading sentiment snapshot..."],
      updatedAt: now,
      source: "marketaux",
      isAvailable: false,
      isFallback: true,
      errorCode: "provider_unavailable",
    },
    equities: {
      label: "mixed",
      breadth: 0.5,
      items: [
        { key: "sp500", name: "S&P 500", price: 0, changePct24h: 0, isAvailable: false },
        { key: "dow", name: "Dow Jones", price: 0, changePct24h: 0, isAvailable: false },
        { key: "nasdaq", name: "Nasdaq", price: 0, changePct24h: 0, isAvailable: false },
        { key: "russell", name: "Russell 2000", price: 0, changePct24h: 0, isAvailable: false },
      ],
      updatedAt: now,
      source: "fmp",
      isAvailable: false,
      isFallback: true,
      errorCode: "provider_unavailable",
    },
  };
}

function PulseSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadowSm)]">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-20 rounded bg-[var(--panel2)]" />
            <div className="h-7 w-16 rounded bg-[var(--panel2)]" />
            <div className="h-2 w-full rounded bg-[var(--panel2)]" />
            <div className="h-3 w-28 rounded bg-[var(--panel2)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketPulseBar() {
  const [snapshot, setSnapshot] = useState<MarketPulseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastBtcTs, setLastBtcTs] = useState<number>(0);

  useEffect(() => {
    const ac = new AbortController();

    void fetchMarketPulseSnapshot(ac.signal)
      .then((data) => {
        setSnapshot(data);
        setLastBtcTs(data.btc.updatedAt);
      })
      .catch(() => {
        setSnapshot((prev) => prev ?? emptySnapshot());
      })
      .finally(() => {
        setLoading(false);
      });

    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource(marketPulseStreamUrl());

    const onSnapshot = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as MarketPulseDto;
        setSnapshot((prev) => ({ ...(prev ?? emptySnapshot()), ...data }));
        setLastBtcTs(data.btc.updatedAt);
      } catch {
        // ignore bad payload
      }
    };

    const onBtc = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as BtcPulseDto;
        setSnapshot((prev) => ({ ...(prev ?? emptySnapshot()), btc: data }));
        setLastBtcTs(data.updatedAt);
      } catch {
        // ignore bad payload
      }
    };

    es.addEventListener("snapshot", onSnapshot as EventListener);
    es.addEventListener("btc", onBtc as EventListener);
    es.onopen = () => setStreamConnected(true);
    es.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      es.removeEventListener("snapshot", onSnapshot as EventListener);
      es.removeEventListener("btc", onBtc as EventListener);
      es.close();
      setStreamConnected(false);
    };
  }, []);

  if (loading && !snapshot) return <PulseSkeleton />;

  const data = snapshot ?? emptySnapshot();
  const btcStale = !streamConnected && lastBtcTs > 0;

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <FearGreedCard data={data.fearGreed} />
      <BtcLiveCard data={data.btc} stale={btcStale} streamConnected={streamConnected} />
      <NewsSentimentCard data={data.sentiment} />
      <GlobalRiskCard data={data.equities} />
    </div>
  );
}
