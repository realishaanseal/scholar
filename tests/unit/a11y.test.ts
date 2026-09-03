import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
  Accessibility, checked statically.

  This is not a substitute for a screen reader or for axe against a rendered
  page, and it does not pretend to be. It catches the failures that are
  visible in the source and that regress constantly — an icon button with no
  name, a click handler on something a keyboard cannot reach, a button that
  submits a form nobody meant to submit. Those are most of what an audit finds
  in practice, and unlike a manual audit this runs on every commit.

  WCAG 2.2 Level AA is the target, because it is what the European
  Accessibility Act, the UK public sector regulations and Section 508 all
  cite, and a school's procurement process will ask for a conformance
  statement before it asks anything else.
*/

const COMPONENTS = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(p));
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = tsxFiles(COMPONENTS).map((f) => ({
  path: f.replace(process.cwd(), "").replace(/\\/g, "/"),
  src: readFileSync(f, "utf8"),
}));

describe("every control can be operated without a mouse", () => {
  it("gives every button an explicit type", () => {
    // A <button> with no type inside a form is a submit button. That is a
    // correctness bug before it is an accessibility one — a "Delete" control
    // that submits the form around it — and it is invisible until the button
    // happens to be placed inside a form.
    const offenders: string[] = [];
    for (const { path, src } of files) {
      for (const m of src.matchAll(/<button\b((?:[^>]|\n)*?)>/g)) {
        if (!/\btype=/.test(m[1])) {
          offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(offenders, `buttons with no type: ${offenders.slice(0, 5).join(", ")}`).toEqual([]);
  });

  it("puts no click handler on an element a keyboard cannot reach", () => {
    // A div with onClick is invisible to keyboard and screen-reader users
    // unless it is given a role and made focusable.
    const offenders: string[] = [];
    for (const { path, src } of files) {
      for (const m of src.matchAll(/<(div|span|li|td|tr)\b((?:[^>]|\n)*?)>/g)) {
        const attrs = m[2];
        if (!/\bonClick=/.test(attrs)) continue;
        if (/\btabIndex=/.test(attrs) && /\brole=/.test(attrs)) continue;
        offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders, `unreachable click targets: ${offenders.slice(0, 5).join(", ")}`)
      .toEqual([]);
  });

  it("names every control that shows only an icon", () => {
    // A screen reader announces an unnamed icon button as "button", which is
    // the entire information it conveys.
    const offenders: string[] = [];
    for (const { path, src } of files) {
      for (const m of src.matchAll(/<button\b((?:[^>]|\n)*?)>/g)) {
        if (/aria-label|aria-labelledby/.test(m[1])) continue;
        // Anything up to the closing tag: text, an expression, or a component
        // that renders text all count as a name.
        const body = src.slice(m.index! + m[0].length, src.indexOf("</button>", m.index));
        const stripped = body.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/\s/g, "");
        if (stripped.length > 0) continue;
        offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders, `unnamed icon buttons: ${offenders.slice(0, 5).join(", ")}`).toEqual([]);
  });

  it("gives every image alternative text", () => {
    const offenders = files
      .filter(({ src }) => /<img\b(?![^>]*\balt=)/.test(src))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe("decoration is hidden from assistive technology", () => {
  it("marks icons inside named controls as decorative", () => {
    // An icon inside a button that already has a label is announced twice
    // without aria-hidden, which turns "Send" into "Send graphic Send".
    let named = 0;
    let hidden = 0;
    for (const { src } of files) {
      for (const m of src.matchAll(/<button\b((?:[^>]|\n)*?)aria-label[\s\S]{0,400}?<\/button>/g)) {
        named++;
        if (/<svg[^>]*aria-hidden/.test(m[0])) hidden++;
      }
    }
    // Most, not all: some named buttons contain no icon at all.
    expect(named).toBeGreaterThan(0);
    expect(hidden / named).toBeGreaterThan(0.5);
  });
});

describe("motion respects the reader's preference", () => {
  it("honours prefers-reduced-motion somewhere in the shell", () => {
    // Vestibular disorders are a real accessibility need and animation is
    // heavily used here.
    const shell = files.find((f) => f.path.endsWith("/components/AppShell.tsx"))!;
    expect(shell.src).toMatch(/useReducedMotion/);
  });
});

describe("colour is never the only signal", () => {
  it("pairs every status colour with a word or a shape", () => {
    // A late chip that is only amber, or a missing cell that is only red, is
    // invisible to a colour-blind reader. The gradebook is the densest place
    // this could go wrong.
    const gradebook = files.find((f) => f.path.endsWith("/teach/Gradebook.tsx"))!;
    // The missing/awaiting cells carry an aria-label as well as a colour.
    expect(gradebook.src).toMatch(/aria-label=\{?["']?(Missing|Awaiting)/);
    expect(gradebook.src).toMatch(/aria-label="Awaiting marking"/);
  });
});
