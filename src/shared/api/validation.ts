import { NextResponse } from "next/server";
import { z } from "zod";

type ValidationIssue = { path: string; message: string };

function zodIssues(err: z.ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
}

export function badRequest(issues: ValidationIssue[], message = "bad_request") {
  return NextResponse.json({ ok: false, error: message, issues }, { status: 400 });
}

export function parseSearchParams(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of sp.entries()) {
    const prev = out[k];
    if (prev === undefined) {
      out[k] = v;
      continue;
    }
    if (Array.isArray(prev)) {
      prev.push(v);
      continue;
    }
    out[k] = [prev, v];
  }
  return out;
}

export function validateQuery<T>(
  req: Request,
  schema: z.ZodType<T>
): { ok: true; data: T } | { ok: false; res: NextResponse } {
  const url = new URL(req.url);
  const parsed = schema.safeParse(parseSearchParams(url.searchParams));
  if (!parsed.success) {
    return { ok: false, res: badRequest(zodIssues(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

export async function validateBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: badRequest([{ path: "body", message: "invalid_json" }]) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: badRequest(zodIssues(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

export const boolFromQuery = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off" || s === "") return false;
  return v;
}, z.boolean());
