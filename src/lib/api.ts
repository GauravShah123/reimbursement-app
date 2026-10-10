// Same call shape as the real product's fetch wrapper, but in this public preview
// nothing goes over the network: every call is answered by the in-browser demo
// backend (src/demo/backend.ts). There is no server behind this site.
import { handle } from "../demo/backend.js";

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<{ res: { ok: boolean; status: number }; data: T }> {
  let body: unknown;
  if (options.body) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = undefined;
    }
  }
  const { status, data } = await handle((options.method || "GET").toUpperCase(), path, body);
  return { res: { ok: status >= 200 && status < 300, status }, data: data as T };
}
