import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  WORKSPACES, defaultWorkspace, workspaceForPath, type WorkspaceId,
} from "@/lib/workspaces";
import { ACCOUNT_INTENTS, parseIntent, INTENT_COPY } from "@/lib/accountIntent";

/*
  Two separate ideas that must never merge: what someone said they are, and
  what an institution has actually granted them. The signup form asks the
  first; every permission decision reads only the second. A test enforces the
  gap, because the failure mode is a self-service privilege escalation button.
*/

describe("account intent grants nothing", () => {
  it("is never read by authorization code", () => {
    // The whole point. If account_intent ever reaches a policy decision, the
    // signup form becomes a way to award yourself teaching rights.
    const dirs = ["src/lib/authz", "src/lib/api"];
    for (const dir of dirs) {
      for (const file of readdirSync(join(process.cwd(), dir))) {
        if (!file.endsWith(".ts")) continue;
        const src = readFileSync(join(process.cwd(), dir, file), "utf8");
        expect(src, `${dir}/${file} reads account_intent`).not.toMatch(/account_intent|accountIntent/);
      }
    }
  });

  it("is never read when resolving what someone can do", () => {
    for (const f of ["src/lib/workspaces.ts", "src/lib/workspaces.server.ts"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8"), f)
        .not.toMatch(/account_intent|accountIntent/);
    }

    // Workspaces come from real relationships instead. The query lives in the
    // .server module, split out so the client shell can import the route
    // vocabulary without dragging pg into the browser bundle.
    const server = readFileSync(join(process.cwd(), "src/lib/workspaces.server.ts"), "utf8");
    expect(server).toMatch(/section_teachers/);
    expect(server).toMatch(/organization_memberships/);
  });

  it("only accepts the three known doors", () => {
    expect(parseIntent("student")).toBe("student");
    expect(parseIntent("teacher")).toBe("teacher");
    expect(parseIntent("admin")).toBe("admin");
    // A query parameter is untrusted input like any other.
    expect(parseIntent("SUPER_ADMIN")).toBeNull();
    expect(parseIntent("")).toBeNull();
    expect(parseIntent(undefined)).toBeNull();
  });

  it("tells teachers and admins that access must be granted", () => {
    // Silence here means someone signs up, sees nothing, and concludes the
    // product is broken.
    expect(INTENT_COPY.teacher.note).toBeTruthy();
    expect(INTENT_COPY.admin.note).toBeTruthy();
    // A student needs nothing granted, so there is nothing to say.
    expect(INTENT_COPY.student.note).toBeUndefined();
  });

  it("keeps the doors to a label and at most one sentence", () => {
    // The chooser is three named doors, not three pitches. Anything longer
    // than a sentence is explaining the product to somebody already at it.
    for (const intent of ACCOUNT_INTENTS) {
      const copy = INTENT_COPY[intent];
      expect(copy.label).toBeTruthy();
      expect(copy.label.split(" ")).toHaveLength(1);
      if (copy.note) {
        expect(copy.note.split(". ").filter(Boolean)).toHaveLength(1);
        expect(copy.note.length).toBeLessThan(90);
      }
    }
  });
});

describe("workspace routing", () => {
  it("puts teaching routes in the teaching workspace", () => {
    expect(workspaceForPath("/teach")).toBe("teaching");
    expect(workspaceForPath("/teach/abc123")).toBe("teaching");
    expect(workspaceForPath("/teach/marking")).toBe("teaching");
  });

  it("keeps student routes personal", () => {
    for (const p of ["/dashboard", "/timetable", "/insights", "/groups"]) {
      expect(workspaceForPath(p), p).toBe("personal");
    }
  });

  it("does not confuse a prefix for a match", () => {
    // /teaching-notes is not /teach.
    expect(workspaceForPath("/teaching-notes")).toBeNull();
    expect(workspaceForPath("/administration")).toBeNull();
  });

  it("lands on the most institutional workspace available", () => {
    // Someone signs in to do a job; the institutional one is why they came.
    expect(defaultWorkspace(["personal"])).toBe("personal");
    expect(defaultWorkspace(["personal", "teaching"])).toBe("teaching");
    expect(defaultWorkspace(["personal", "teaching", "admin"])).toBe("admin");
  });

  it("gives every workspace a home inside its own routes", () => {
    for (const id of Object.keys(WORKSPACES) as WorkspaceId[]) {
      const ws = WORKSPACES[id];
      expect(workspaceForPath(ws.home), `${id} home`).toBe(id);
    }
  });
});

describe("navigation is separated by job", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/AppShell.tsx"), "utf8");

  const navBlock = (name: string) => {
    const start = shell.indexOf(`const ${name}: NavItem[] = [`);
    expect(start, `${name} missing`).toBeGreaterThan(-1);
    return shell.slice(start, shell.indexOf("];", start));
  };

  it("keeps homework and coursework tools out of the teaching nav", () => {
    // The complaint that prompted this: a teacher was being offered Homework,
    // Import and Focus — tools for doing coursework, shown to whoever sets it.
    const teaching = navBlock("TEACHING_NAV");
    for (const href of ["/dashboard", "/import", "/groups", "/insights", "/calendar"]) {
      expect(teaching, `teaching nav still offers ${href}`).not.toContain(`"${href}"`);
    }
  });

  it("keeps teaching and admin tools out of the student nav", () => {
    const personal = navBlock("PERSONAL_NAV");
    expect(personal).not.toContain('"/teach"');
    expect(personal).not.toContain('"/admin"');
  });

  it("keeps student tools out of the admin nav", () => {
    const admin = navBlock("ADMIN_NAV");
    for (const href of ["/dashboard", "/timetable", "/import"]) {
      expect(admin, `admin nav still offers ${href}`).not.toContain(`"${href}"`);
    }
  });

  it("only links to routes each workspace owns", () => {
    for (const [name, id] of [
      ["PERSONAL_NAV", "personal"],
      ["TEACHING_NAV", "teaching"],
      ["ADMIN_NAV", "admin"],
    ] as const) {
      for (const href of navBlock(name).matchAll(/href: "([^"]+)"/g)) {
        expect(workspaceForPath(href[1]), `${name} → ${href[1]}`).toBe(id);
      }
    }
  });
});

describe("every navigated route exists", () => {
  it("has a page file behind each nav destination", () => {
    // A nav item pointing at nothing is a 404 the moment someone trusts it.
    const shell = readFileSync(join(process.cwd(), "src/components/AppShell.tsx"), "utf8");
    const hrefs = [...shell.matchAll(/href: "(\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of hrefs) {
      const page = join(process.cwd(), "src/app/(app)", href, "page.tsx");
      let exists = false;
      try {
        exists = statSync(page).isFile();
      } catch {
        exists = false;
      }
      expect(exists, `${href} has no page at src/app/(app)${href}/page.tsx`).toBe(true);
    }
  });
});

describe("client components do not import the database", () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (/\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }

  it("keeps pg out of the browser bundle", () => {
    // A client component importing lib/db pulls in pg, which needs node's fs,
    // and the build fails with a message pointing at pg-connection-string
    // rather than at the component that did it. Caught here instead.
    const offenders: string[] = [];

    for (const file of walk(join(process.cwd(), "src/components"))) {
      const src = readFileSync(file, "utf8");
      if (!/^["']use client["']/m.test(src)) continue;
      if (/from ["']@\/lib\/db["']|from ["'].*\.server["']/.test(src)) {
        offenders.push(file.replace(process.cwd(), ""));
      }
    }

    expect(offenders, "client components importing server-only modules").toEqual([]);
  });
});
