# Project Context — Smart Algorithms

## What we are building
Crypto scanner / analytics platform with realtime data, alerts, market monitoring, and symbol-level analysis.

## Stack
- Next.js App Router
- Tailwind
- Node runtime for heavy routes
- SQLite MVP
- SSE realtime
- TradingView chart in drawer

## Current core modules
- Hot Scanner
- Alerts / Events
- Symbol / Drawer / Chart
- Market Pulse

## Key engineering priorities
- Stable API contracts
- Safe provider normalization
- Realtime reliability
- Predictable empty/error/loading states
- Minimal-diff changes
- Controlled growth of architecture

## Working model
- Product manager defines outcome
- AI turns request into narrow engineering task
- Codex applies minimal patch
- AI reviews diff and release readiness

## Critical engineering rules
- No silent API shape changes
- No broad refactor
- Preserve fallback chains unless explicitly changing them
- Keep transport, domain, provider mapping, and UI separated
- Be careful with cache, rate limiting, and SSE behavior

## Critical risk areas
- provider partial failures
- stale data
- empty states
- DTO drift
- hidden business-logic drift
- stream instability