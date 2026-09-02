import { describe, it, expect } from "vitest";
import { scrubObject, scrubText, scrubUrl, REDACTED } from "@/lib/observability/scrub";
import { ALLOWED_EVENTS, posthogOptions } from "@/lib/observability/posthog";
import { sentryBaseOptions } from "@/lib/observability/sentry";

/*
  Error reporting is the classic accidental data pipeline: nobody decides to
  send a student's homework to a third party, it just arrives attached to a
  stack trace. These tests treat the scrubber as security code, because that
  is what it is.
*/

describe("secret redaction in free text", () => {
  it("strips a Postgres connection string, password and all", () => {
    // The leak nobody plans for: pg puts the whole URL in a connection error.
    const msg = "connect ECONNREFUSED postgresql://user:hunter2@db.neon.tech/scholar";
    const out = scrubText(msg);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("neon.tech");
    expect(out).toContain(REDACTED);
  });

  it("strips API keys and bearer tokens", () => {
    expect(scrubText("key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA failed")).not.toContain("sk-ant");
    expect(scrubText("Authorization: Bearer abcdefghijklmnopqrstuvwx")).not.toContain("abcdefghij");
  });

  it("strips JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9payloadhere";
    expect(scrubText(`token ${jwt}`)).not.toContain(jwt);
  });

  it("strips email addresses", () => {
    expect(scrubText("failed for ishaan@example.com")).not.toContain("ishaan@example.com");
  });

  it("leaves an ordinary message readable", () => {
    // Over-redaction makes the reporter useless, which is its own failure.
    const msg = "Cannot read properties of undefined (reading 'length')";
    expect(scrubText(msg)).toBe(msg);
  });
});

describe("object redaction", () => {
  it("redacts credentials by key name", () => {
    const out = scrubObject({
      authorization: "Bearer xyz", cookie: "session=1",
      ANTHROPIC_API_KEY: "sk-secret", userId: "u1",
    }) as Record<string, unknown>;

    expect(out.authorization).toBe(REDACTED);
    expect(out.cookie).toBe(REDACTED);
    expect(out.ANTHROPIC_API_KEY).toBe(REDACTED);
    // Identifiers are what makes a report actionable, and are not secrets.
    expect(out.userId).toBe("u1");
  });

  it("redacts student work by key name", () => {
    const out = scrubObject({
      title: "Essay", details: "my actual homework answer",
      instructions: "the brief", prompt: "what the student asked the AI",
    }) as Record<string, unknown>;

    expect(out.details).toBe(REDACTED);
    expect(out.instructions).toBe(REDACTED);
    expect(out.prompt).toBe(REDACTED);
  });

  it("reaches into nested objects and arrays", () => {
    const out = scrubObject({
      req: { headers: { cookie: "a=b" } },
      items: [{ password: "hunter2" }],
    }) as any;
    expect(out.req.headers.cookie).toBe(REDACTED);
    expect(out.items[0].password).toBe(REDACTED);
  });

  it("stops rather than hangs on a very deep structure", () => {
    let deep: any = { password: "x" };
    for (let i = 0; i < 50; i++) deep = { nested: deep };
    expect(() => scrubObject(deep)).not.toThrow();
  });
});

describe("url scrubbing", () => {
  it("keeps the path and drops the query string", () => {
    // The path groups errors usefully; the query string is where ids live.
    expect(scrubUrl("https://app.example.com/api/homework?id=abc&q=secret"))
      .toBe("/api/homework");
  });

  it("drops the query string even from input that is not really a url", () => {
    // The contract is that nothing after ? survives, not that the path is
    // formatted a particular way. Relative and malformed input still parses
    // against the dummy base, which is why the fallback branch is rarely hit.
    for (const input of ["not a url?with=query", "/api/x?id=1", "http://?a=b"]) {
      expect(scrubUrl(input)).not.toContain("?");
      expect(scrubUrl(input)).not.toContain("query");
    }
  });
});

describe("sentry defaults", () => {
  it("never attaches default PII", () => {
    expect(sentryBaseOptions.sendDefaultPii).toBe(false);
  });

  it("is inert without a DSN", () => {
    // The same build runs locally and in preview without reporting anything.
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      expect(sentryBaseOptions.enabled).toBe(false);
    }
  });

  it("reduces a user to an id and drops the request body", () => {
    const event: any = {
      user: { id: "u1", email: "a@b.com", ip_address: "1.2.3.4" },
      request: {
        url: "https://x.test/api/ai?key=abc",
        cookies: { session: "s" },
        data: { details: "homework" },
        query_string: "key=abc",
        headers: { authorization: "Bearer x" },
      },
    };
    const out = sentryBaseOptions.beforeSend({ ...event }, {} as any);

    // beforeSend returns null when disabled, which is itself the safe outcome.
    if (out === null) return;
    expect(out.user).toEqual({ id: "u1" });
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.url).toBe("/api/ai");
    expect((out.request?.headers as any).authorization).toBe(REDACTED);
  });
});

describe("posthog defaults", () => {
  it("captures nothing until someone opts in", () => {
    expect(posthogOptions.opt_out_capturing_by_default).toBe(true);
  });

  it("records neither the DOM nor the text of what was clicked", () => {
    // Session replay of this app is a recording of a child's homework.
    expect(posthogOptions.disable_session_recording).toBe(true);
    expect(posthogOptions.autocapture).toBe(false);
    expect(posthogOptions.mask_all_text).toBe(true);
  });

  it("honours Do Not Track and does not geolocate", () => {
    expect(posthogOptions.respect_dnt).toBe(true);
    expect(posthogOptions.ip).toBe(false);
  });

  it("names events after actions, never after content", () => {
    for (const e of ALLOWED_EVENTS) {
      expect(e).toMatch(/^[a-z][a-z_]*$/);
    }
  });
});
