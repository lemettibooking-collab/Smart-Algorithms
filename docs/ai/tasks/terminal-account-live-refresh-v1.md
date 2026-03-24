# Terminal Account Live Refresh v1

## Task summary

Implement **Terminal Account Live Refresh v1** for Smart Algorithms Trading Terminal.

This task must improve the **account-side live feeling** of the terminal without changing the paper/demo-first execution model.

Target result:
- one unified terminal account snapshot
- one account SSE stream
- action-driven hard refresh after submit/cancel/fill
- mark-driven soft refresh for unrealized pnl / equity
- Chart Mode consumes one unified account source instead of fragmented account fan-out

This task is for:
- `tradeMode=paper`
- `exchange=binance | mexc`

This task does **not** implement:
- live exchange execution
- exchange private auth
- private user-data streams
- real exchange account sync

---

## Context

We already have a working paper/demo Trading Terminal for Binance and MEXC inside Smart Algorithms.

Current foundation already exists:
- exchange-aware terminal contracts
- shared terminal session
- Chart Mode usable
- Scalp Mode usable
- durable paper execution
- durable paper balances
- durable fill ledger
- realized/unrealized PnL
- equity valuation
- positions
- stream-first real market transport
- snapshot fallback
- paper-only execution
- live mode blocked

Problem:
- market-side already feels live enough
- account-side still feels more fragmented and less live

We need:
- one unified read model for account state
- one SSE stream for account-side updates
- server-driven refresh orchestration
- full snapshot payloads for atomic UI replacement

---

## Goals

### Primary goal
Make terminal account-side feel live and consistent:
- balances
- open orders
- history
- positions
- realized pnl
- unrealized pnl
- equity

### Secondary goal
Create a read-side foundation that can later evolve into:
- user-scoped accounts
- live account projections
- future live execution architecture

---

## Non-goals

Do not implement:
- live exchange execution
- exchange private auth / API key storage
- exchange private user-data streams
- real live balances/positions sync
- live positions from exchange
- bracket order backend semantics
- OMS/risk engine
- auth/user model
- product gating
- Redis/Kafka/event sourcing
- patch/delta streaming protocol
- broad Scalp UI changes
- removal of old account routes

---

## Architecture intent

We are **not** rewriting the execution engine.

We are adding a **read-side layer on top of existing durable paper state**.

### Write-side stays as-is
Existing sources remain the source of state:
- durable paper order repo
- durable paper balances repo
- durable fill ledger
- paper limit matcher
- positions / pnl services
- equity / valuation services

### New read-side layer
Add a unified read model that:
- builds one account snapshot
- versions/invalidate snapshots durably
- streams fresh snapshots over SSE
- orchestrates hard and soft refresh
- keeps UI synchronized with atomic full payload replacement

---

## Scope model

Use this v1 scope model:

```ts
type TerminalTradeMode = "paper" | "live";
type TerminalExchange = "binance" | "mexc";

type TerminalAccountScope = {
  tradeMode: "paper";
  exchange: TerminalExchange;
};

type ScopeKey = `paper:${"binance" | "mexc"}`;

Use a helper:

function toScopeKey(scope: TerminalAccountScope): ScopeKey

For v1, only support:

paper:binance
paper:mexc

Model should be easy to extend later into user/account-scoped live models.

Snapshot contract

Use a unified DTO similar to:

type TerminalAccountSnapshot = {
  scope: {
    tradeMode: "paper";
    exchange: "binance" | "mexc";
  };
  version: number;
  updatedAt: string;
  refreshReason:
    | "initial"
    | "order_submit"
    | "order_cancel"
    | "fill"
    | "market_mark"
    | "periodic"
    | "reconnect";

  marketHealth: {
    state: "connected" | "stale" | "disconnected";
    asOf: string | null;
  };

  balances: TerminalBalanceRow[];
  openOrders: TerminalOpenOrderRow[];
  history: TerminalHistoryRow[];
  positions: TerminalPositionRow[];

  pnl: {
    realized: number;
    unrealized: number;
  };

  equity: {
    total: number;
    cash: number;
    locked: number;
  };
};

Important:

SSE must send full snapshot payloads
client must replace snapshot atomically
do not implement delta/patch streaming in this task
SQLite addition

Add a small durable version table:

CREATE TABLE IF NOT EXISTS terminal_account_versions (
  scope_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_reason TEXT NOT NULL
);

Purpose:

durable snapshot invalidation/versioning
survive restart
support reconnect/bootstrap safety
avoid in-memory-only version semantics
Proposed file layout

Follow existing project structure where practical. Prefer this target layout unless a nearby existing folder is clearly better.

src/server/terminal/account/
  domain/
    terminal-account.types.ts
    terminal-account-scope.ts
    terminal-account-snapshot.ts
  application/
    build-terminal-account-snapshot.ts
    terminal-account-refresh-orchestrator.ts
    terminal-account-refresh-scheduler.ts
  infrastructure/
    terminal-account-version-repo.ts
    terminal-account-stream-hub.ts
    terminal-account-cache.ts
    market-mark-bridge.ts
  public/
    index.ts

app/api/terminal/account/snapshot/route.ts
app/api/stream/terminal/account/route.ts

src/entities/terminal-account/model/types.ts
src/features/terminal-account/model/use-terminal-account.ts

If the repo already has a more suitable nearby structure for terminal server modules, align with it rather than forcing a conflicting layout.

API design
1. Initial snapshot route

GET /api/terminal/account/snapshot?exchange=binance&tradeMode=paper

Requirements:

validate exchange
validate tradeMode
reject unsupported values
only allow tradeMode=paper in v1
use runtime = "nodejs"
return full unified snapshot

Purpose:

initial load
fallback refetch
reconnect-safe bootstrap fallback
2. SSE account stream

GET /api/stream/terminal/account?exchange=binance&tradeMode=paper

Requirements:

use SSE
immediately send latest snapshot on connect
send full snapshot payloads
send heartbeat events
reconnect-safe behavior
no delta/patch protocol

Suggested SSE event types:

snapshot
heartbeat
Refresh model
Hard refresh

Trigger immediate refresh after:

order submit
order cancel
cancel all
market fill
limit matcher fill
relevant reject paths such as insufficient funds
Soft refresh

Trigger throttled refresh after:

market mark changes affecting held assets / positions / valuation
unrealized pnl changes
equity valuation changes
Periodic refresh

Add safety refresh approximately every 10 seconds to prevent drift and improve reconnect safety.

Important behavioral rules
Durable state update must happen before refresh orchestration.
Refresh orchestration must not invent state; it only rebuilds projection from current durable/read services.
Full snapshot replacement must keep account panels synchronized.
Market-driven refresh must not recompute for irrelevant symbols/assets.
Refresh bursts should be coalesced safely.
Prefer one in-flight recompute per scope where practical.
Keep Binance and MEXC behavior symmetric where possible.
Client integration
Chart Mode

Chart Mode should move toward consuming one unified account source via a new hook:

useTerminalAccount({
  exchange,
  tradeMode: "paper",
});

This unified source should drive:

balances panel
open orders panel
history panel
positions tab
pnl summary
equity summary

Important:

update client state atomically from full snapshot
do not stitch multiple fragmented account payloads in UI for this flow
Scalp Mode

For v1:

do not add heavy account chrome inside scalp cards
it is acceptable to wire shared account snapshot internally without rendering large new UI blocks
do not do layout rewrites
Implementation phases
PHASE 1 — Unified snapshot route
Goal

Build a server-side unified account snapshot and expose it at:

GET /api/terminal/account/snapshot

Work
Add domain types:
TerminalAccountScope
TerminalAccountSnapshot
RefreshReason
Add version repo:
terminal-account-version-repo.ts
get(scopeKey)
bump(scopeKey, reason)
optional ensure(scopeKey)
Add snapshot builder:
build-terminal-account-snapshot.ts
Build snapshot from current sources:
paper balances repo
open orders repo
history/fill repo
positions/pnl services
equity service
market health source
Add route:
app/api/terminal/account/snapshot/route.ts
Route requirements:
runtime = "nodejs"
validate query params
allow only tradeMode=paper in v1
return full snapshot
Definition of Done
route works for Binance and MEXC
route returns full snapshot
values match current existing account sources
no regression in paper execution logic
Manual checks
call snapshot route for Binance paper
call snapshot route for MEXC paper
confirm payload contains:
balances
openOrders
history
positions
pnl
equity
marketHealth
version
updatedAt
refreshReason
PHASE 2 — SSE stream for account-side
Goal

Add a live account stream:

GET /api/stream/terminal/account

Work
Add stream hub:
terminal-account-stream-hub.ts
subscriber registry per scope
push latest snapshot
heartbeat
disconnect cleanup
Add cache/state module:
terminal-account-cache.ts
latest snapshot per scope
latest version
dirty flag
in-flight refresh promise
soft refresh throttle metadata
Add SSE route:
app/api/stream/terminal/account/route.ts
SSE requirements:
send latest snapshot immediately on connect
send snapshot events
send heartbeat events
reconnect-safe bootstrap behavior
Add client modules:
src/entities/terminal-account/model/types.ts
src/features/terminal-account/model/use-terminal-account.ts
Client hook requirements:
initial fetch from snapshot route
open SSE connection
replace snapshot atomically
reconnect on disconnect
expose loading/error/streaming state
Definition of Done
Chart Mode can load snapshot and receive SSE updates
reconnect works
no manual refresh required for common account-side flow
no stream spam / obvious reconnect loops
Manual checks
open terminal
confirm initial snapshot loads
confirm SSE connects
refresh page / simulate disconnect
confirm reconnect/bootstrap works
confirm account state stays consistent after reconnect
PHASE 3 — Hard refresh orchestration
Goal

Refresh account-side automatically after execution-side state changes.

Work
Add orchestrator:
terminal-account-refresh-orchestrator.ts
requestRefresh({ scope, reason, priority })
hard refresh now
version bump
recompute snapshot
push snapshot to subscribers
coalesce redundant refreshes safely
Integrate orchestrator into write-side points:
paper order submit
cancel
cancel all
market fill path
limit matcher fill path
relevant reject paths
Use refresh reasons:
order_submit
order_cancel
fill
Critical ordering:
durable state update first
refresh orchestration second
Definition of Done

After:

MARKET order
LIMIT order
cancel
cancel-all
auto-fill LIMIT
insufficient funds reject

UI updates automatically for:

balances
open orders
history
positions
realized pnl
unrealized pnl
equity
Manual checks

Test all flows:

MARKET BUY
MARKET SELL
LIMIT NEW
LIMIT fill after market move
CANCEL one
CANCEL ALL
reject on insufficient funds

No manual page reload should be required.

PHASE 4 — Soft mark-driven refresh
Goal

Refresh unrealized pnl / equity when market prices move even without new executions.

Work
Add market bridge:
market-mark-bridge.ts
listen to market updates
determine which scopes are affected
ignore irrelevant symbols/assets
Add refresh scheduler:
terminal-account-refresh-scheduler.ts
soft refresh throttle around 500–1000ms
one refresh per scope within throttle window
periodic safety refresh around every 10 seconds
Use refresh reasons:
market_mark
periodic
Recompute and push full snapshot after throttled refresh
Definition of Done

When market price changes and account holds affected assets or positions:

unrealized pnl updates
equity updates
mark-related position values update if included in snapshot
Manual checks
open a position
wait for market move
confirm unrealized pnl changes without user action
confirm equity changes without user action
verify stream is not spamming excessive refreshes
Technical rules for this task
minimal diff only
no broad refactor
no unrelated file changes
do not break paper execution logic
keep live mode blocked
reuse existing repos/services
heavy routes must use runtime = "nodejs"
use SQLite for durable versioning
do not add Redis/Kafka/event sourcing
do not add patch/delta streaming
do not remove old routes yet
keep backward compatibility where practical
prefer focused modules over large mixed-responsibility files
keep server aggregation out of client components
logs/debug must be useful and not noisy in hot paths
Output requirements for Codex

After each phase, report:

changed files
new files/routes/modules
touched existing files
summary of behavior changes
verification commands:
npm run lint
npm run typecheck
npm run build -- --webpack
concise manual test checklist
Recommended execution mode

Do not implement this as one giant patch.

Preferred approach:

finish PHASE 1 completely
verify
then PHASE 2
verify
then PHASE 3
verify
then PHASE 4

Each phase should be a safe narrow patch.

Final expected result

After all phases are complete:

terminal account-side has one unified snapshot
Chart Mode consumes one unified account hook
account panels update consistently and atomically
submit/cancel/fill trigger immediate account refresh
market mark movement updates unrealized pnl / equity
behavior works for:
paper + Binance
paper + MEXC

And the system is better prepared for future evolution toward:

user-scoped accounts
live account projections
eventual live execution architecture