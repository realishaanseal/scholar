/**
 * What must never leave the building.
 *
 * Scholar holds a student's homework, their notes, their AI conversations and
 * their institution's coursework. An error reporter that helpfully attaches
 * request bodies and query strings would quietly ship all of it to a third
 * party, which is precisely the failure this project's own rules forbid:
 * never log API keys, never expose private student data.
 *
 * So the default is inverted. Nothing is sent unless it is known to be safe,
 * rather than everything being sent unless someone remembered to redact it.
 */

export const REDACTED = "[redacted]";

/**
 * Header and field names whose values are secret or personal.
 *
 * Matched case-insensitively as substrings, so `x-api-key`, `apiKey` and
 * `ANTHROPIC_API_KEY` are all caught by `key`.
 */
const SENSITIVE_KEYS = [
  "authorization", "cookie", "set-cookie", "token", "secret", "password",
  "apikey", "api_key", "key", "session", "credential", "signature",
  // Application-specific: these carry student work and personal context.
  "body", "details", "instructions", "content", "message", "prompt",
  "transcript", "note", "answer", "feedback", "rawinput", "email",
];

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

/**
 * Recursively redact sensitive values in an object.
 *
 * Depth-limited because an error payload can contain a cyclic or very deep
 * object, and a scrubber that hangs on one is worse than no scrubber.
 */
export function scrubObject(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || typeof input !== "object") return input;

  if (Array.isArray(input)) return input.map((v) => scrubObject(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = isSensitive(k) ? REDACTED : scrubObject(v, depth + 1);
  }
  return out;
}

/**
 * Strip the query string from a URL.
 *
 * A path is useful for grouping errors; a query string is where identifiers
 * and search terms live. Keeping the path and dropping the rest gets the
 * diagnostic value without the payload.
 */
export function scrubUrl(url: string): string {
  try {
    const u = new URL(url, "http://local");
    return u.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/** Patterns that look like credentials wherever they appear in free text. */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,            // OpenAI / Anthropic style
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9._-]{20,}\b/g,           // JWT
  /\bpostgres(?:ql)?:\/\/[^\s]+/gi,        // connection strings
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // email addresses
];

/**
 * Redact anything credential-shaped from a message.
 *
 * Error messages are the leak nobody plans for: a database driver happily
 * puts the whole connection string, password included, into the text of a
 * connection failure.
 */
export function scrubText(text: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, REDACTED), text);
}
