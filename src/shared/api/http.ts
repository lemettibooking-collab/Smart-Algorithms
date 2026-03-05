export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const suffix = text ? ` ${text.slice(0, 120)}` : "";
    throw new Error(`HTTP ${res.status}${suffix}`);
  }
  return (await res.json()) as T;
}
