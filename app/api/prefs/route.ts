import { NextResponse } from "next/server";
import { getJson, setJson } from "@/lib/repos/kvRepo";

export const runtime = "nodejs";

type PostBody = {
  key?: unknown;
  value?: unknown;
};

function toStr(v: unknown) {
  return String(v ?? "").trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = toStr(url.searchParams.get("key") ?? "");
  if (!key) {
    return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
  }

  const value = getJson<unknown>(key);
  return NextResponse.json({ ok: true, key, value });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PostBody;
    const key = toStr(body.key);
    if (!key) {
      return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
    }

    setJson(key, body.value ?? null);
    return NextResponse.json({ ok: true, key });
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalid_json";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
