/**
 * Browser-side fetch that never throws a raw JSON parse error.
 *
 * A route can return an empty body (crash, timeout, aborted connection) and
 * calling res.json() on that produces "Unexpected end of JSON input", which
 * surfaces as a red error overlay instead of a message the user can act on.
 */
export type JsonResult<T> = { ok: boolean; status: number; data: T | null; error: string | null };

export async function fetchJson<T = any>(
  input: string,
  init?: RequestInit
): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, data: null, error: "Couldn't reach the server. Is it still running?" };
  }

  const text = await res.text().catch(() => "");

  if (!text.trim()) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: res.ok
        ? "The server returned an empty response — the request may have timed out."
        : `Request failed (${res.status}) with an empty response.`,
    };
  }

  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Unexpected response from the server (${res.status}).`,
    };
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    error: res.ok ? null : data?.error ?? `Request failed (${res.status}).`,
  };
}
