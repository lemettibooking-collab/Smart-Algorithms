import { NextResponse } from "next/server";
import { z } from "zod";
import { getJson, setJson } from "@/lib/repos/kvRepo";
import { validateBody, validateQuery } from "@/src/shared/api";

export const runtime = "nodejs";

const getQuerySchema = z.object({
  key: z.string().trim().min(1, "key is required"),
});

const postBodySchema = z.object({
  key: z.string().trim().min(1, "key is required"),
  value: z.unknown().optional(),
});

export async function GET(req: Request) {
  const v = validateQuery(req, getQuerySchema);
  if (!v.ok) return v.res;
  const key = v.data.key;

  const value = getJson<unknown>(key);
  return NextResponse.json({ ok: true, key, value });
}

export async function POST(req: Request) {
  const v = await validateBody(req, postBodySchema);
  if (!v.ok) return v.res;

  const key = v.data.key;
  setJson(key, v.data.value ?? null);
  return NextResponse.json({ ok: true, key });
}
