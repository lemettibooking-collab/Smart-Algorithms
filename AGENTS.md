# AGENTS.md

Project: Smart Algorithms

## Product context
- Crypto scanner / analytics platform.
- Stack: Next.js App Router, Tailwind.
- Heavy API/DB routes use Node runtime.
- SQLite MVP storage.
- SSE realtime.
- TradingView chart in drawer.
- Current core modules:
  - Hot Scanner
  - Alerts / Events
  - Symbol / Drawer / Chart
  - Market Pulse

## Collaboration model
- User is product manager.
- AI acts as tech lead / architect / reviewer.
- Codex in VS Code applies narrow patches only.

## Global rules
- Minimal diff only.
- No broad refactor.
- No unrelated file changes.
- Do not change API shape unless explicitly requested.
- Do not drift business logic while "cleaning up" code.
- If you find a broader issue outside task scope, mention it briefly and do not fix it in the same patch.

## Architecture rules
- Keep UI, domain logic, transport, persistence, and provider adapters separate.
- Do not move business logic into React components.
- Do not parse raw provider payloads in UI.
- For endpoint changes, keep a clear flow:
  - validation
  - orchestration
  - normalization/mapping
  - response shaping
- Prefer explicit DTO boundaries and stable response mapping.

## Sensitive zones
- /api/hot
- /api/klines
- /api/alerts
- /api/alerts/events
- /api/events
- /api/prefs
- /api/stream/events
- /api/stream/hot
- /api/stream/market-pulse
- /api/walls
- /api/market-pulse

## Data and provider rules
- External providers may fail, degrade, or return partial/malformed data.
- Handle partial data explicitly.
- Preserve fallback chains unless the task explicitly changes them.
- Do not silently drop invalid or stale provider data without reasoned handling.
- Keep null safety high.

## Realtime rules
- Be careful with SSE payload shape and update cadence.
- Do not introduce unnecessary reconnection or stream noise.
- Do not break empty/loading/error states for live modules.

## Performance and reliability rules
- Avoid unnecessary heavy recomputation in route handlers.
- Respect caching and in-flight dedupe patterns where already present.
- Be careful with rate limiting.
- Do not add polling or expensive provider calls without necessity.

## Output expectations for code changes
- Keep patch focused.
- Explain changes in a short structured list.
- Mention if env or provider behavior matters.
- State what should be manually verified after the patch.

## Forbidden unless explicitly requested
- Redis migration
- Postgres migration
- Broad storage abstraction rewrite
- New service extraction
- Large folder restructuring
- API response redesign
- Unrelated UI polish during data-layer tasks