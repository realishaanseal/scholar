import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { errorResponse, isDriverError, BadRequest, NotFound, Unauthenticated } from "@/lib/api/errors";
import { Forbidden } from "@/lib/authz";

/*
  Two things are checked here. First, that a refusal never tells the caller
  more than it should. Second — and this is the one that keeps mattering as the
  app grows — that every institutional route actually goes through the guard.
  A single handler exported without it is a hole no amount of correct policy
  code elsewhere can close.
*/

const body = async (res: Response) => (await res.json()) as { error: string };

describe("error responses disclose nothing useful to an attacker", () => {
  it("returns the same 404 for forbidden and for missing", async () => {
    // A distinct 403 on a resource that exists is an enumeration oracle: it
    // confirms which ids are real to anyone willing to try a few.
    const forbidden = errorResponse(
      new Forbidden("assignment:grade", { organizationId: "o1" }, "does not teach this section")
    );
    const missing = errorResponse(new NotFound());

    expect(forbidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await body(forbidden)).toEqual(await body(missing));
  });

  it("never leaks the authorization reason to the caller", async () => {
    const res = errorResponse(
      new Forbidden("grade:publish", { organizationId: "o1" }, "does not teach this section")
    );
    const text = JSON.stringify(await body(res));
    expect(text).not.toContain("teach");
    expect(text).not.toContain("grade:publish");
  });

  it("distinguishes not-signed-in from not-allowed", async () => {
    // 401 is safe to be specific about: it says nothing about what exists.
    const res = errorResponse(new Unauthenticated());
    expect(res.status).toBe(401);
  });

  it("shows a deliberate validation message verbatim", async () => {
    const res = errorResponse(new BadRequest("Give the assignment a title."));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Give the assignment a title.");
  });

  it("hides database driver errors, which name tables and carry credentials", async () => {
    const pgError = Object.assign(new Error('relation "assignments" does not exist'), {
      code: "42P01",
    });
    const res = errorResponse(pgError);
    expect(res.status).toBe(500);
    expect((await body(res)).error).not.toContain("assignments");
  });

  it("recognises a SQLSTATE and does not mistake ordinary errors for one", () => {
    expect(isDriverError({ code: "23505" })).toBe(true);
    expect(isDriverError({ code: "ENOENT" })).toBe(false);
    expect(isDriverError(new Error("plain"))).toBe(false);
    expect(isDriverError(null)).toBe(false);
  });
});

/* ── The structural check ──────────────────────────────────────────────── */

const INSTITUTION_API = join(process.cwd(), "src/app/api/institution");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

describe("every institutional route goes through the guard", () => {
  const files = routeFiles(INSTITUTION_API);

  it("finds routes to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.split("api")[1].replace(/\\/g, "/"), f]))(
    "%s declares a permission and resolves scope from the database",
    (_name, file) => {
      const src = readFileSync(file, "utf8");

      // Every exported HTTP method must be wrapped. A bare `export const GET =
      // async (...)` would reach the database with no check at all.
      const methods = [...src.matchAll(/export const (GET|POST|PATCH|PUT|DELETE)\s*=\s*(\w+)/g)];
      expect(methods.length).toBeGreaterThan(0);
      for (const [, method, wrapper] of methods) {
        expect(
          wrapper,
          `${method} must be wrapped in institutionalRoute`
        ).toBe("institutionalRoute");
      }

      // The scope must be resolved, not asserted. A route that reads an
      // organization id out of the request could be pointed at any tenant.
      expect(src).toMatch(/permission:\s*"[a-z]+:[a-z]+"/);
      expect(src).toMatch(/scopeOf(Section|Assignment|Submission)/);
      expect(
        src,
        "organizationId must never be read from params or the query string"
      ).not.toMatch(/params\.organizationId|searchParams\.get\("organizationId"\)/);
    }
  );
});
