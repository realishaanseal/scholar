/**
 * Every outbound provider call goes through this.
 *
 * Without a timeout, an unreachable or slow provider leaves the request hanging
 * until something upstream kills it — which surfaces in the browser as an empty
 * response body and a confusing "Unexpected end of JSON input" crash.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`No response within ${Math.round(timeoutMs / 1000)}s — the provider may be unreachable.`);
    }
    if (err?.cause?.code === "ENOTFOUND" || err?.cause?.code === "EAI_AGAIN") {
      throw new Error("Could not resolve the provider's address. Check your internet connection.");
    }
    if (err?.cause?.code === "ECONNREFUSED") {
      throw new Error("Connection refused — nothing is listening at that address.");
    }
    throw new Error(err?.message ?? "Network request failed.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a Response as JSON without ever throwing a raw parse error.
 * Returns null when the body is empty or not JSON.
 */
export async function safeJson<T = any>(res: Response): Promise<T | null> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
