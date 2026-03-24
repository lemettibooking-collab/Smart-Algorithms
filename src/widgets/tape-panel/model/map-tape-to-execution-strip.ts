import type {
  TerminalDomLevelDto,
  TerminalTapeTradeDto,
} from "@/src/shared/model/terminal/contracts";

export type ExecutionStripRow = {
  price: string;
  trade: TerminalTapeTradeDto | null;
  count: number;
};

function toNumber(value?: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function findNearestRowIndex(dom: TerminalDomLevelDto[], price: string) {
  const tradePrice = toNumber(price);
  if (tradePrice === null || !dom.length) return -1;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < dom.length; index += 1) {
    const rowPrice = toNumber(dom[index]?.price);
    if (rowPrice === null) continue;

    const distance = Math.abs(rowPrice - tradePrice);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestDistance === Number.POSITIVE_INFINITY ? -1 : nearestIndex;
}

export function mapTapeToExecutionStripRows(dom: TerminalDomLevelDto[], tape: TerminalTapeTradeDto[]): ExecutionStripRow[] {
  const buckets = new Map<number, { trade: TerminalTapeTradeDto; count: number }>();

  for (const trade of tape) {
    const rowIndex = findNearestRowIndex(dom, trade.price);
    if (rowIndex < 0) continue;

    const current = buckets.get(rowIndex);
    if (!current || trade.ts > current.trade.ts) {
      buckets.set(rowIndex, {
        trade,
        count: (current?.count ?? 0) + 1,
      });
      continue;
    }

    buckets.set(rowIndex, {
      trade: current.trade,
      count: current.count + 1,
    });
  }

  return dom.map((row, index) => {
    const bucket = buckets.get(index);
    return {
      price: row.price,
      trade: bucket?.trade ?? null,
      count: bucket?.count ?? 0,
    };
  });
}
