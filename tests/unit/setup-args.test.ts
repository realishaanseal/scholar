import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholder } from "../../scripts/loadEnv";

/*
  Both of these are bugs that reached a real terminal before being caught, and
  both failed in the worst way available to them — quietly. The quote-stripping
  one would have created an institution called "Varaxis" instead of "Varaxis
  Demo School", and the placeholder one would have surfaced as an unreadable
  parse error from the database driver several steps away from the cause.
*/

/** The parser under test, lifted from the script so it can be exercised. */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null;
  let value: string[] = [];
  const flush = () => {
    if (key) out[key] = value.length ? value.join(" ") : "true";
  };
  for (const token of argv) {
    if (token.startsWith("--")) {
      flush();
      key = token.slice(2);
      value = [];
    } else if (key) {
      value.push(token);
    }
  }
  flush();
  return out;
}

describe("argument parsing survives a shell that ate the quotes", () => {
  it("rejoins a multi-word value npm split apart", () => {
    // Exactly what npm forwarded on Windows. A naive parser takes "Varaxis"
    // and creates an institution with the wrong name, without complaining.
    const args = parseArgs([
      "--org", "Varaxis", "Demo", "School",
      "--slug", "varaxis-demo",
      "--course-title", "Physics", "I",
    ]);
    expect(args.org).toBe("Varaxis Demo School");
    expect(args.slug).toBe("varaxis-demo");
    expect(args["course-title"]).toBe("Physics I");
  });

  it("gives the same result whether or not the quotes survived", () => {
    const quoted = parseArgs(["--org", "Varaxis Demo School", "--slug", "x"]);
    const stripped = parseArgs(["--org", "Varaxis", "Demo", "School", "--slug", "x"]);
    expect(quoted).toEqual(stripped);
  });

  it("treats a flag with no value as a boolean", () => {
    expect(parseArgs(["--dry-run", "--slug", "x"])).toEqual({ "dry-run": "true", slug: "x" });
  });

  it("keeps the last flag's value", () => {
    // A trailing flag has no following flag to trigger the flush, so the
    // parser has to flush at the end or silently drop it.
    expect(parseArgs(["--slug", "x", "--section", "A"]).section).toBe("A");
  });

  it("ignores stray tokens before any flag", () => {
    expect(parseArgs(["junk", "--slug", "x"])).toEqual({ slug: "x" });
  });

  it("parses an email and a comma list unchanged", () => {
    const args = parseArgs(["--admin", "a@b.com", "--students", "c@d.com,e@f.com"]);
    expect(args.admin).toBe("a@b.com");
    expect(args.students).toBe("c@d.com,e@f.com");
  });
});

describe("Vercel sensitive placeholders are not connection strings", () => {
  it("recognises what vercel env pull writes for a Sensitive variable", () => {
    // Marking a variable Sensitive makes it permanently unreadable; the pull
    // writes this rather than failing, so it has to be caught explicitly.
    expect(isPlaceholder("[SENSITIVE]")).toBe(true);
    expect(isPlaceholder("[REDACTED]")).toBe(true);
    expect(isPlaceholder("[sensitive]")).toBe(true);
    expect(isPlaceholder("  [SENSITIVE]  ")).toBe(true);
  });

  it("treats empty and unset as unusable", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });

  it("accepts a real connection string", () => {
    expect(isPlaceholder("postgresql://u:p@host.neon.tech/db?sslmode=require")).toBe(false);
  });
});

describe("the script keeps its parser in step with the tested copy", () => {
  it("still parses values as every token up to the next flag", () => {
    // The parser is duplicated above to be testable. If the script's own copy
    // is rewritten, this catches the drift rather than letting the test pass
    // while the real thing regresses.
    const src = readFileSync(join(process.cwd(), "scripts/institution-setup.ts"), "utf8");
    expect(src).toMatch(/value\.push\(token\)/);
    expect(src).toMatch(/value\.join\(" "\)/);
  });
});
