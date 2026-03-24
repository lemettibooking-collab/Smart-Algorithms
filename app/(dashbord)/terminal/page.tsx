import { TerminalShell, normalizeTerminalSearchParams } from "@/src/widgets/terminal-shell";
import { getTerminalBootstrap } from "@/src/server/terminal/repositories/get-terminal-bootstrap";

type TerminalPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TerminalPage({ searchParams }: TerminalPageProps) {
  const params = normalizeTerminalSearchParams((await searchParams) ?? {});
  const bootstrap = await getTerminalBootstrap({
    symbol: params.symbol,
    exchange: params.exchange,
  });

  return <TerminalShell {...params} bootstrap={bootstrap} />;
}
