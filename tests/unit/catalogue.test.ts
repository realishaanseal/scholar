import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, offeredLocales } from "@/lib/i18n/locales";

/*
  The catalogue and the code drift apart silently: a key renamed in a
  component leaves a dead string behind, and a string added to a component
  without a key throws at render in the one language nobody on the team reads.
  These tests are the thing that notices.
*/

const MESSAGES = join(process.cwd(), "messages");

type Tree = Record<string, unknown>;

function load(locale: string): Tree {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8"));
}

function keysOf(tree: Tree, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(tree)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of keysOf(v as Tree, `${prefix}${k}.`)) out.add(nested);
    } else {
      out.add(`${prefix}${k}`);
    }
  }
  return out;
}

const en = load("en");
const enKeys = keysOf(en);

describe("every offered locale is actually complete", () => {
  it("has a catalogue on disk for each locale it lists", () => {
    const files = new Set(
      readdirSync(MESSAGES).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    );
    for (const l of LOCALES) {
      expect(files.has(l.code), `${l.code} is listed but messages/${l.code}.json is missing`)
        .toBe(true);
    }
  });

  it("offers no locale that is missing a single key", () => {
    // This is the test that would have caught the original problem: thirteen
    // languages in the picker and one file on disk.
    for (const l of offeredLocales()) {
      const missing = [...enKeys].filter((k) => !keysOf(load(l.code)).has(k));
      expect(
        missing,
        `${l.code} is offered but missing ${missing.length} keys, e.g. ${missing.slice(0, 3).join(", ")}`
      ).toEqual([]);
    }
  });

  it("keeps draft locales out of the offered list", () => {
    const offered = offeredLocales().map((l) => l.code);
    for (const l of LOCALES) {
      if (l.status === "draft") expect(offered).not.toContain(l.code);
    }
  });
});

describe("no catalogue invents keys English does not have", () => {
  it("holds nothing untranslatable back to the source", () => {
    // A key only a translation has is a key nothing renders — usually a
    // rename that was applied to one file and not the other.
    for (const l of LOCALES) {
      if (l.code === "en") continue;
      const extra = [...keysOf(load(l.code))].filter((k) => !enKeys.has(k));
      expect(extra, `${l.code} has keys en does not: ${extra.slice(0, 5).join(", ")}`)
        .toEqual([]);
    }
  });
});

describe("ICU placeholders survive translation", () => {
  function placeholders(s: string): Set<string> {
    // Names only. Which plural categories a language uses is its own
    // business — Hindi needs no `few`, Polish does — so comparing whole
    // plural bodies would fail on correct translations.
    //
    // The identifier must be followed by a comma or a closing brace, which is
    // what separates a real placeholder from the start of a nested message
    // body: `{count, plural, =0 {Nothing outstanding} ...}` contains one
    // variable, not two, and matching `{Nothing` would report every
    // translation of that string as broken.
    return new Set([...s.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]));
  }

  function flat(tree: Tree, prefix = ""): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(tree)) {
      if (v && typeof v === "object") out.push(...flat(v as Tree, `${prefix}${k}.`));
      else if (typeof v === "string") out.push([`${prefix}${k}`, v]);
    }
    return out;
  }

  const enFlat = new Map(flat(en));

  it("carries the same variables in every language", () => {
    // A translation that drops {count} renders a sentence with a hole in it,
    // and a translation that invents {name} throws at render.
    for (const l of LOCALES) {
      if (l.code === "en") continue;
      for (const [key, value] of flat(load(l.code))) {
        const source = enFlat.get(key);
        if (!source) continue;
        const want = placeholders(source);
        const got = placeholders(value);
        // Plural category names are not variables; drop the known ones.
        const CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
        const wantVars = [...want].filter((p) => !CATEGORIES.has(p)).sort();
        const gotVars = [...got].filter((p) => !CATEGORIES.has(p)).sort();
        expect(gotVars, `${l.code} ${key}: placeholders differ`).toEqual(wantVars);
      }
    }
  });

  it("keeps a plural where English has one", () => {
    for (const l of LOCALES) {
      if (l.code === "en") continue;
      for (const [key, value] of flat(load(l.code))) {
        const source = enFlat.get(key);
        if (!source?.includes(", plural,")) continue;
        expect(value, `${l.code} ${key} lost its plural form`).toContain(", plural,");
      }
    }
  });
});

describe("the catalogue does not describe features that were removed", () => {
  it("carries no namespace for the extension or the external LMS import", () => {
    // Those paths were removed when Scholar became a native LMS. Strings for
    // them are 197 lines a translator would otherwise be asked to translate.
    for (const dead of ["capture", "extension-insights", "lms-calendar"]) {
      expect(Object.keys(en)).not.toContain(dead);
    }
  });
});
