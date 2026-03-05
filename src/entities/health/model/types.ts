export type StreamStatus = "connected" | "connecting" | "reconnecting" | "error";

export type StreamHealth = {
  status: StreamStatus;
  lastMessageTs?: number;
  error?: string;
};

export type RateLimitState = {
  untilTs?: number;
  retryInSec?: number;
  source: "hot" | "events" | "alerts";
};

export type GlobalHealth = {
  hot: StreamHealth;
  events: StreamHealth;
  degraded?: boolean;
  rateLimit?: RateLimitState[];
};
