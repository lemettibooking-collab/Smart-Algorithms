Smart Algorithms — Trading Terminal v1

Статус: draft for implementation
Тип документа: dev-ready product + technical spec
Приоритет: high
Связанные модули: Hot Scanner, Symbol Drawer, Alerts/Events, Market Pulse
Архитектурный контекст: Next.js App Router, TypeScript, Tailwind, FSD-oriented structure, Node runtime on heavy routes, planned migration to Supabase

1. Цель

Добавить продукт в отдельную вкладку Trading Terminal которая уже создана в проекте и позволяет пользователю:

перейти из Hot Scanner / Symbol / Alerts в торговый интерфейс

работать в двух режимах:

Chart Mode

Scalp Mode

получать live market data

видеть баланс, активные ордера, историю

выставлять и отменять ордера

хранить пользовательские настройки терминала

2. Ключевое продуктово-архитектурное решение
2.1 Не делать два разных терминала

Терминал должен быть реализован как:

один общий terminal engine

два UI workspace-режима

2.2 Режимы
A. Chart Mode

Классический терминал:

большой график в центре

ордер-тикет справа

ордера / история / баланс снизу

symbol tabs сверху

B. Scalp Mode

Скальпинг-терминал:

DOM / ladder как центральный блок

tape / recent trades

быстрые торговые действия

акцент на скорость работы

2.3 Общие части для обоих режимов

Должны быть едиными:

symbol context

exchange context

account context

market data streams

order execution

order reconciliation

balances / open orders / history

settings / layouts / presets / hotkeys

3. Scope v1
3.1 Входит в v1

вкладка /terminal

два режима: chart, scalp

общий shared terminal state

Binance Spot first

Demo mode first

Live mode after validation layer

order types:

MARKET

LIMIT

balances

open orders

order history

symbol sync from scanner/drawer

persistent terminal settings

initial Supabase-compatible persistence design

3.2 Не входит в v1

futures

margin

OCO/bracket production-ready logic

full drag-and-drop workspace editor

multi-account portfolio OMS

advanced broker routing

raw exchange multiplexer for many venues at once

bots execution from terminal

full trading-from-chart advanced integration

4. Product goals
4.1 Основные цели

сделать terminal usable как отдельный продуктовый слой

связать scanner → signal → terminal → execution

не дублировать логику между режимами

не ломать текущую архитектуру проекта

заложить основу под Supabase и дальнейший live trading layer

4.2 Критерии успеха

terminal открывается из scanner/drawer по deep link

оба режима работают на одном symbol/account context

user может выставить и отменить ордер

есть live данные и понятный order state

интерфейс сохраняет базовые prefs/layout

кодовая база остаётся FSD-oriented, без хаотичного смешения UI и execution logic

5. Основные пользовательские сценарии
5.1 Open from scanner

Пользователь в Hot Scanner нажимает Open in Terminal
Результат:

переход на /terminal?symbol=BTCUSDT&exchange=binance&mode=chart

5.2 Open from symbol drawer

Пользователь в drawer нажимает Trade
Результат:

переход на /terminal?symbol=BTCUSDT&exchange=binance&mode=scalp или chart

5.3 Work in Chart Mode

Пользователь:

открывает символ

видит график

вводит цену и количество

ставит ордер

отслеживает open orders / history / balances

5.4 Work in Scalp Mode

Пользователь:

открывает DOM

кликает по уровню цены

ставит лимит / маркет

следит за tape

быстро отменяет ордера

6. UX layout requirements
6.1 Общие элементы

Обязательны в обоих режимах:

terminal topbar

symbol tabs

exchange indicator

demo/live badge

connection status

current symbol summary

mode switch

order/account state sync

6.2 Chart Mode layout
Верх

symbol tabs

exchange

mode switch

demo/live state

connection status

Центр

chart area

timeframe controls

indicators button

symbol summary strip

Правая колонка

symbol card

last price

order ticket

order type selector

price field

qty / notional field

quick % buttons

buy / sell actions

Низ

balances

open orders

history

trades/fills

6.3 Scalp Mode layout
Левая колонка

watchlist / quick symbol switch

favorites / hot / alerts shortcuts

Центр

DOM / ladder

spread

best bid/ask

highlighted depth

clickable price levels

Правая колонка

tape

quick entry controls

market/limit actions

cancel all / close / reverse placeholders

Низ

open orders

fills

account events

connection/risk notices

7. Functional requirements
7.1 Shared terminal requirements

Система должна:

поддерживать symbol selection

поддерживать exchange selection

поддерживать mode switch

отображать live price/ticker

отображать order book

отображать recent trades

отображать balances

отображать open orders

отображать order history

создавать ордера

отменять ордера

выполнять cancel all by symbol

сохранять настройки терминала

7.2 Orders v1

Поддержать:

MARKET

LIMIT

Поля:

side: BUY | SELL

type: MARKET | LIMIT

symbol

exchange

quantity

optional price for limit

optional quote notional helper in UI

7.3 Validation

Обязательная валидация:

symbol exists

exchange supported

qty > 0

price > 0 for LIMIT

minQty

stepSize

tickSize

minNotional

demo/live mode guard

stale connection guard

duplicate submit guard

7.4 Tables/panels

Нужны панели:

balances

open orders

order history

fills/trades

8. Non-functional requirements
8.1 Performance

Цели:

terminal first usable state < 2s

symbol switch usable state < 500ms after bootstrap where possible

order action acknowledgement < 300ms to optimistic UI

reconnect recovery < 3s target

8.2 Reliability

auto reconnect

snapshot re-sync after reconnect

no duplicate optimistic orders

stale state detection

deterministic order lifecycle handling

8.3 Security

API keys never in client

execution only server-side

audit log for trading actions

idempotent order placement

demo/live always visible in UI

safe default = demo

9. Technical architecture
9.1 Frontend

Текущий стек:

Next.js App Router

TypeScript

Tailwind

FSD-oriented slices

Использовать:

React client components for terminal UI

shared terminal store for runtime state

isolated workspace components for chart/scalp

transport abstraction for streams

9.2 Backend layers

Терминал нельзя строить только на текущей витринной SSE-модели.
Нужен отдельный terminal-oriented realtime and execution layer.

A. Market Data Gateway

Задачи:

подписка на exchange streams

order book snapshots + deltas

recent trades

ticker updates

symbol-based subscriptions

reconnect/resync

B. Execution Gateway

Задачи:

place order

validate order

cancel order

cancel all

normalize exchange responses

maintain idempotency

reconcile optimistic UI with exchange state

C. Account Sync Layer

Задачи:

balances

order updates

fills

account-level events

D. Persistent Settings Layer

Задачи:

save layouts

save mode prefs

save pinned symbols

save presets

save hotkeys later

save recent terminal state

10. Realtime transport
10.1 v1 transport decision

Разрешается временно использовать:

dedicated terminal SSE streams

Желаемая целевая архитектура:

separate websocket transport for terminal market/account streams

10.2 Required streams

Нужны отдельные каналы:

terminal market stream

terminal account stream

11. Deep links

Поддержать:

/terminal

/terminal?symbol=BTCUSDT

/terminal?symbol=BTCUSDT&exchange=binance

/terminal?symbol=BTCUSDT&exchange=binance&mode=chart

/terminal?symbol=BTCUSDT&exchange=binance&mode=scalp

/terminal?symbol=BTCUSDT&exchange=binance&mode=chart&interval=1h

12. Domain model
12.1 Core entities

TerminalWorkspace

TerminalMode

TradingAccount

ExchangeConnection

MarketSymbol

OrderBookSnapshot

OrderBookDelta

TapeTrade

OrderDraft

ExchangeOrder

Fill

Balance

TerminalPreset

TerminalLayout

TerminalSession

12.2 Order statuses

Нормализованный набор:

NEW

PARTIALLY_FILLED

FILLED

CANCELED

REJECTED

EXPIRED

13. FSD target structure
src/
  app/
    (terminal)/
      terminal/
        page.tsx

  widgets/
    terminal-shell/
    terminal-topbar/
    terminal-chart-workspace/
    terminal-scalp-workspace/
    terminal-bottom-panels/
    terminal-order-ticket/
    terminal-watchlist/

  features/
    terminal-mode-switch/
    terminal-symbol-switch/
    terminal-exchange-switch/
    open-in-terminal/
    place-order/
    cancel-order/
    cancel-all-orders/
    save-terminal-layout/
    manage-terminal-presets/

  entities/
    market-symbol/
    orderbook/
    trade/
    order/
    balance/
    exchange-account/
    terminal-layout/
    terminal-preset/

  shared/
    api/
    lib/
    ui/
    config/
    model/

  server/
    terminal/
      market-gateway/
      execution-gateway/
      account-sync/
      validators/
      normalizers/
      repositories/
14. UI component list
14.1 Shared

TerminalShell

TerminalTopbar

TerminalModeSwitch

TerminalSymbolTabs

TerminalConnectionStatus

TerminalDemoLiveBadge

14.2 Chart Mode

TerminalChartWorkspace

TerminalChartPanel

TerminalOrderTicket

TerminalBalancesPanel

TerminalOrdersTabsPanel

14.3 Scalp Mode

TerminalScalpWorkspace

DomLadder

TapePanel

ScalpQuickActions

ScalpOrderEntry

ScalpOrdersPanel

15. API contracts v1
15.1 Bootstrap
GET /api/terminal/bootstrap

Возвращает:

default exchange

default symbol

supported modes

user settings

pinned symbols

basic account summary

symbol meta if current symbol selected

Пример ответа:

type TerminalBootstrapResponse = {
  ok: true;
  terminal: {
    defaultExchange: "binance";
    defaultMode: "chart" | "scalp";
    pinnedSymbols: string[];
    supportedModes: Array<"chart" | "scalp">;
  };
  account: {
    demo: boolean;
    connected: boolean;
    balancesPreview: Array<{
      asset: string;
      free: string;
      locked: string;
    }>;
  };
  symbol?: {
    exchange: string;
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    tickSize?: string;
    stepSize?: string;
    minQty?: string;
    minNotional?: string;
  };
};
15.2 Symbol meta
GET /api/terminal/symbol-meta?exchange=binance&symbol=BTCUSDT
type TerminalSymbolMetaResponse = {
  ok: true;
  symbol: {
    exchange: string;
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    status: string;
    filters: {
      tickSize?: string;
      stepSize?: string;
      minQty?: string;
      minNotional?: string;
    };
  };
};
15.3 Balances
GET /api/terminal/balances
type TerminalBalancesResponse = {
  ok: true;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
    usdValue?: number | null;
  }>;
};
15.4 Open orders
GET /api/terminal/open-orders?exchange=binance&symbol=BTCUSDT
type TerminalOpenOrdersResponse = {
  ok: true;
  orders: Array<{
    id: string;
    exchange: string;
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    status: string;
    price: string | null;
    origQty: string;
    executedQty: string;
    createdAt: string;
  }>;
};
15.5 Order history
GET /api/terminal/history?exchange=binance&symbol=BTCUSDT&limit=50
type TerminalOrderHistoryResponse = {
  ok: true;
  orders: Array<{
    id: string;
    exchange: string;
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    status: string;
    price: string | null;
    origQty: string;
    executedQty: string;
    createdAt: string;
    updatedAt?: string | null;
  }>;
};
15.6 Test order
POST /api/terminal/order/test
type TerminalOrderTestRequest = {
  exchange: "binance";
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: string;
  price?: string;
  mode: "demo" | "live";
};

type TerminalOrderTestResponse = {
  ok: boolean;
  errors?: Array<{
    code: string;
    message: string;
    field?: string;
  }>;
};
15.7 Place order
POST /api/terminal/order
type TerminalPlaceOrderRequest = {
  exchange: "binance";
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: string;
  price?: string;
  mode: "demo" | "live";
  clientOrderId?: string;
};

type TerminalPlaceOrderResponse = {
  ok: true;
  order: {
    id: string;
    exchange: string;
    symbol: string;
    side: "BUY" | "SELL";
    type: "MARKET" | "LIMIT";
    status: string;
    price: string | null;
    origQty: string;
    executedQty: string;
    createdAt: string;
  };
} | {
  ok: false;
  error: {
    code: string;
    message: string;
    field?: string;
  };
};
15.8 Cancel order
POST /api/terminal/order/cancel
type TerminalCancelOrderRequest = {
  exchange: "binance";
  symbol: string;
  orderId: string;
  mode: "demo" | "live";
};

type TerminalCancelOrderResponse = {
  ok: true;
  canceledOrderId: string;
} | {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};
15.9 Cancel all by symbol
POST /api/terminal/order/cancel-all
type TerminalCancelAllOrdersRequest = {
  exchange: "binance";
  symbol: string;
  mode: "demo" | "live";
};

type TerminalCancelAllOrdersResponse = {
  ok: true;
  canceledCount: number;
} | {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};
15.10 Layout read/write
GET /api/terminal/layout
POST /api/terminal/layout
type TerminalLayoutDto = {
  mode: "chart" | "scalp";
  chart: {
    timeframe?: string;
    indicators?: string[];
  };
  panels: {
    leftWidth?: number;
    rightWidth?: number;
    bottomHeight?: number;
  };
  pinnedSymbols: string[];
};

type TerminalLayoutResponse = {
  ok: true;
  layout: TerminalLayoutDto | null;
};
16. Stream contracts v1
16.1 Terminal market stream

События:

ticker

orderbookSnapshot

orderbookDelta

recentTrade

symbolState

connectionState

Пример:

type TerminalMarketStreamEvent =
  | {
      type: "ticker";
      exchange: string;
      symbol: string;
      lastPrice: string;
      change24hPct?: number | null;
      volume24h?: string | null;
      ts: number;
    }
  | {
      type: "orderbookSnapshot";
      exchange: string;
      symbol: string;
      bids: Array<[string, string]>;
      asks: Array<[string, string]>;
      ts: number;
    }
  | {
      type: "orderbookDelta";
      exchange: string;
      symbol: string;
      bids?: Array<[string, string]>;
      asks?: Array<[string, string]>;
      ts: number;
    }
  | {
      type: "recentTrade";
      exchange: string;
      symbol: string;
      side: "buy" | "sell";
      price: string;
      qty: string;
      ts: number;
    }
  | {
      type: "connectionState";
      state: "connecting" | "connected" | "stale" | "reconnecting" | "disconnected";
      ts: number;
    };
16.2 Terminal account stream

События:

balanceUpdate

orderUpdate

fill

accountConnectionState

17. Supabase persistence design

Сразу проектировать с расчётом на Supabase.

17.1 Таблицы
terminal_user_settings

id

user_id

default_mode

default_exchange

default_symbol

confirm_live_orders

sound_enabled

created_at

updated_at

terminal_layouts

id

user_id

mode

layout_json

created_at

updated_at

terminal_presets

id

user_id

exchange

symbol

preset_type

label

value_json

created_at

updated_at

terminal_favorite_symbols

id

user_id

exchange

symbol

sort_order

created_at

connected_exchange_accounts

id

user_id

exchange

label

key_encrypted

secret_encrypted

mode

is_active

created_at

updated_at

order_audit_log

id

user_id

exchange

symbol

action

request_json

response_json

status

created_at

17.2 Не хранить как primary persistence

Не писать в Postgres как сырой поток:

raw order book ticks

raw trade tape

micro depth deltas

18. Integration points with current product
18.1 Hot Scanner

Добавить action:

Open in Terminal

18.2 Symbol Drawer

Добавить action:

Open Full Terminal

18.3 Alerts / Events

Добавить action:

Trade Signal

18.4 Shared preferences

Использовать:

theme

global user prefs

shared exchange/symbol helpers where possible

19. Delivery plan by epics
Epic 1 — Terminal route and shell
Scope

route /terminal

topbar

mode switch

symbol tabs

basic shell layout

deep link parsing

Done criteria

страница открывается

переключение mode работает

symbol/exchange читаются из query params

layout skeleton готов

Epic 2 — Shared terminal state
Scope

terminal store

symbol context

exchange context

demo/live context

connection state

terminal bootstrap API integration

Done criteria

state единый для chart/scalp

bootstrap загружается

symbol switch работает без дублирования логики

Epic 3 — Chart Mode MVP UI
Scope

chart workspace

order ticket

balances panel

open orders panel

history panel

Done criteria

chart mode usable

order form отображается

нижние панели работают на mock/live data contracts

Epic 4 — Market data layer
Scope

terminal market stream

ticker

order book snapshot/delta

recent trades

reconnect/resync

Done criteria

symbol market data обновляются live

reconnect state отображается

order book не ломается при переключении символа

Epic 5 — Order actions
Scope

order test

place order

cancel order

cancel all

client validation + server validation

Done criteria

MARKET/LIMIT проходят через shared flow

optimistic UI работает

ошибки нормализованы

duplicate submit guarded

Epic 6 — Account sync
Scope

balances refresh/account stream

order update sync

fills sync

history refresh

Done criteria

order state больше не “зависает”

fills отражаются в UI

balances синхронизируются после действий

Epic 7 — Scalp Mode MVP
Scope

DOM ladder

tape panel

quick order actions

click price level → populate order price

scalp orders strip

Done criteria

scalp mode реально usable

DOM и tape live

быстрый order flow работает на общем engine

Epic 8 — Persistence
Scope

layout save/load

mode persistence

pinned symbols

presets foundation

Done criteria

пользовательские настройки сохраняются

after reload terminal restores last workspace basics

Epic 9 — Hardening
Scope

audit log

stale connection guards

confirm live order

error handling polish

monitoring hooks

Done criteria

live actions guarded

stale transport blocks unsafe actions

audit trail exists

20. Acceptance criteria for v1

v1 считается готовым, если:

Есть вкладка /terminal

Есть режимы chart и scalp

Оба режима используют один shared terminal state

Есть переход из scanner/drawer

Есть live ticker/order book/trades

Есть balances

Есть open orders

Есть order history

Можно сделать MARKET и LIMIT

Можно отменить один ордер

Можно сделать cancel all by symbol

Есть demo/live state

Demo по умолчанию безопасен

Настройки терминала сохраняются

После reconnect UI не разваливается

Код не дублирует order execution logic между режимами

21. Main risks
R1. Слишком ранний упор в визуал

Риск: красивый UI без устойчивого order/account engine.
Решение: сначала shared state + market/execution/account layers.

R2. Попытка сразу сделать full pro terminal

Риск: scope explosion.
Решение: сначала Chart Mode MVP, потом Scalp Mode поверх того же ядра.

R3. Смешивание display streams и terminal streams

Риск: текущая SSE-витрина не потянет реальный DOM-grade UX.
Решение: terminal market/account streams выделять отдельно.

R4. SQLite thinking при уже согласованном Supabase direction

Риск: временные решения потом больно мигрировать.
Решение: проектировать persistence contracts сразу Supabase-friendly.

22. Implementation rules for Codex

При выполнении задач соблюдать:

minimal diff

не делать широкий рефакторинг без явной причины

не менять shape существующих API без необходимости

не смешивать terminal UI и exchange execution logic

использовать FSD-oriented placement

сначала foundation, потом polish

если данных/интеграции не хватает — сначала mock-safe contract, потом connect layer

приоритет: correctness > polish

23. Recommended first implementation order

Правильный порядок работ:

/terminal route + shell

shared terminal state

bootstrap + symbol/exchange context

Chart Mode MVP

market data layer

order actions

account sync

Scalp Mode MVP

persistence

hardening

24. Final implementation decision

Trading Terminal v1 для Smart Algorithms реализуется как:

единый terminal engine

два режима интерфейса

Chart Mode

Scalp Mode

Binance Spot first

Demo first

Supabase-compatible persistent layer

отдельный terminal realtime/execution layer

FSD-oriented структура без дублирования ядра между режимами

Trading Terminal — Implementation Rules and Guardrails
1. Core architectural principle

The Trading Terminal must be implemented as one shared terminal engine with two UI workspaces:

Chart Mode

Scalp Mode

These are two interface modes built on top of the same trading foundation.
They are not two separate trading applications.

Required

Use one shared symbol context

Use one shared exchange context

Use one shared account/order state

Use one shared execution flow

Use one shared validation layer

Use one shared set of domain contracts and normalized types

Forbidden

Separate order logic for Chart Mode

Separate order logic for Scalp Mode

Duplicated place/cancel/reconcile flows per workspace

Separate incompatible order state models per mode

2. Shared order flow only

All trading actions must go through the same shared order lifecycle:

order draft

validation

test order

place order

cancel order

cancel all

order state reconciliation

fills/account sync

Required

Use shared request/response contracts

Use a shared normalized order model

Use a shared normalized order status model

Use the same order actions in both Chart and Scalp modes

Forbidden

A special hidden order flow only for DOM/scalp

A separate chart-only execution implementation

Different validation behavior for the same order type across modes

3. No execution logic inside UI widgets

UI widgets must remain presentation-oriented and orchestration-oriented.
Trading execution, exchange integration, normalization, and validation must live outside UI components.

Required

Keep exchange calls in server/execution layers

Keep validation in shared/domain/server layers

Keep normalization in dedicated domain/server utilities

Let widgets call prepared actions/use-cases only

Forbidden

Direct exchange execution inside chart panels

Direct exchange execution inside scalp/DOM panels

Mixing render logic and exchange transport logic in the same file

Embedding execution code inside UI widgets

4. Engine and contracts first, polish later

Implementation order must always be:

domain model

contracts and types

shared terminal state

market/account/execution flows

usable workspace UI

visual polish

Required

Build the foundation first

Prioritize correctness before visual complexity

Define contracts before advanced UI behavior

Finish shared flow before deep workspace polish

Forbidden

Starting from visual cloning of other terminals

Building DOM/scalp polish before shared order flow exists

Making layout more complex before state/contracts are stable

5. No visual cloning of external terminals

External products such as Stakan, Capico, or similar references may be used only as inspiration for UX patterns and layout ideas.

Required

Adapt patterns to Smart Algorithms

Preserve the visual language of the existing product

Build around real domain and data flow requirements

Forbidden

Pixel-perfect cloning of external terminals

Shaping architecture around visual imitation

Forcing product decisions because a reference looks attractive

6. FSD-oriented placement

The terminal must follow the project’s FSD-oriented architecture direction.

Placement rules

widgets → layout/workspaces/panels/composed UI blocks

features → user actions and use-cases

entities → domain models and domain state slices

shared → base UI, config, utilities, contracts, common helpers

server → gateways, repositories, validators, execution logic, normalizers

Required

Respect feature/domain boundaries

Keep page.tsx thin

Keep business logic out of route/page UI files

Keep workspace components focused on composition

Forbidden

Putting terminal business logic in page.tsx

Flattening everything into one terminal folder with no boundaries

Mixing widget/entity/feature responsibilities randomly

7. Realtime transport must be terminal-specific

The terminal realtime layer must not be blindly coupled to showcase/dashboard/scanner streaming assumptions.

Required

Isolate terminal market transport from showcase streams

Isolate terminal account transport from showcase streams

Design symbol subscription, reconnect, and resync specifically for terminal use cases

Forbidden

Building a DOM-grade terminal on top of display-only streams

Reusing scanner-oriented transport assumptions for execution-grade terminal logic

Treating terminal streaming as “just another dashboard feed”

8. Demo-first safety rule

The terminal must be safe by default.

Required

Default trade mode = demo

Show demo/live status clearly in the UI

Gate live execution behind validation and safety checks

Block unsafe execution on stale connection state

Forbidden

Implicit live execution

Hidden trading mode

Live order submission without explicit safe flow

9. Correctness over visual complexity

If there is a tradeoff between visual sophistication and system correctness, correctness always wins.

Priority order

correctness

stability

consistency

usability

polish

Practical meaning

A simpler but honest terminal is better than a visually rich but fake one

A stable shared order flow is more important than advanced micro-interactions

A correct DOM foundation is more important than decorative DOM visuals

10. Minimal-diff implementation policy

All terminal work must follow narrow, safe, incremental delivery.

Required

Use minimal diff patches

Extend the existing architecture carefully

Avoid destabilizing already working product areas

Prefer additive changes over broad rewrites

Forbidden

Broad refactors without clear necessity

Rewriting working modules for style reasons

Expanding scope mid-task without a strong reason

11. Preserve existing API contracts unless necessary

Existing API shapes must not be changed casually.

Required

Preserve current API contracts where possible

Add terminal-specific contracts as new isolated endpoints/layers

Make changes only when there is a strong architectural reason

Forbidden

Unnecessary breaking API changes

Hidden changes in shared response shape

Broad backend rewrites just to “clean things up”

12. Mock-safe first, then real integration

If live integration is not ready yet, implementation should still move forward on stable contracts.

Required

Start with contract-first, mock-safe implementations where needed

Keep response shapes realistic from the beginning

Swap transport/repository adapters later without rewriting UI contracts

Forbidden

Blocking UI foundation on perfect backend readiness

Hardcoding temporary mock structures that do not match future contracts

Building throwaway UI that will need full replacement later

13. Shared state, not duplicated workspace state

Chart and Scalp workspaces must read from and write to shared terminal state wherever possible.

Required

Shared symbol state

Shared exchange state

Shared trade mode state

Shared connection state

Shared order draft/state where appropriate

Shared account/order collections where appropriate

Forbidden

Independent symbol state per workspace

Independent mode-specific account state

Diverging state models for the same terminal concepts

14. Terminal-specific persistence must be future-ready

Persistence must be designed with the planned Supabase migration in mind.

Required

Make settings/layout contracts Supabase-friendly

Separate persistent user configuration from realtime transport

Store layouts, presets, favorites, and terminal settings cleanly

Forbidden

Designing persistence as SQLite-only thinking

Coupling UI directly to one storage implementation

Storing raw realtime market micro-events as primary relational persistence

15. Thin page layer

The route/page layer must remain thin and compositional.

Required

Read params

Load bootstrap data

Compose terminal shell

Delegate logic to proper layers

Forbidden

Business logic in page files

Execution logic in page files

Direct stream management in page files unless wrapped in dedicated abstractions

16. Done criteria are mandatory

Every task must include explicit done criteria.

Required

Each implementation task should define:

target outcome

affected files/slices

scope boundaries

done criteria

constraints and non-goals if needed

Forbidden

Vague “implemented terminal support”

Tasks without verifiable completion rules

Hidden scope expansion during implementation

17. Incremental delivery order

Terminal work must be delivered in the correct sequence.

Recommended implementation order

terminal route and shell

shared terminal state

bootstrap contracts

Chart Mode MVP shell

symbol meta and validation

order ticket

order actions

balances/open orders/history

market stream layer

Scalp Mode shell

DOM/tape integration

persistence

hardening

Required

Build a usable Chart Mode foundation first

Add Scalp Mode on top of the same engine

Delay advanced DOM polish until the shared flow is stable

Forbidden

Starting with Scalp Mode first

Building DOM before shared order flow exists

Skipping foundation in favor of visuals

18. Codex delivery rules

When Codex implements terminal tasks, it must follow these rules:

Required

Prefer minimal safe patches

Do not introduce broad refactors without necessity

Keep logic in the correct architectural layer

Reuse existing project primitives where reasonable

Keep types/contracts explicit

Add only the minimum needed abstractions for the current step

Preserve current working flows

Build foundation before polish

Forbidden

Massive restructuring during early terminal tasks

Duplicating code paths for chart and scalp

Hiding architectural shortcuts inside UI components

Mixing transport, domain logic, and rendering in one place

Adding speculative complexity too early

19. Short implementation doctrine

One engine, two modes. Shared contracts, shared state, shared order flow. Execution outside UI. Foundation first, polish later.