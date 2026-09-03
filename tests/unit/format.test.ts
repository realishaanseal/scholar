import { describe, it, expect } from "vitest";
import {
  compareNames, formatDate, formatDuration, formatList, formatNumber,
  formatPercent, formatRelative, plural,
} from "@/lib/i18n/format";
import {
  isRTL, LOCALES, offeredLocales, PLANNED_LOCALES, resolveLocale,
} from "@/lib/i18n/locales";

/*
  The formatting layer, tested against the languages it is supposed to serve
  rather than only against English — which is the whole point of having one.
*/

describe("a locale is offered only when it is finished", () => {
  it("offers nothing that has no catalogue", () => {
    // Fourteen were offered and one existed. Choosing Hindi produced an
    // English interface, silently.
    const offered = offeredLocales().map((l) => l.code);
    for (const p of PLANNED_LOCALES) expect(offered).not.toContain(p.code);
  });

  it("keeps a draft translation out of a student's hands", () => {
    const hi = LOCALES.find((l) => l.code === "hi");
    expect(hi?.status).toBe("draft");
    expect(offeredLocales().map((l) => l.code)).not.toContain("hi");
  });

  it("falls back rather than breaking for someone who chose one already", () => {
    // A student who picked Bengali last year should see a working interface
    // today, and be told why on the settings screen rather than on whatever
    // page they happened to open.
    expect(resolveLocale("bn")).toBe("en");
    expect(resolveLocale("hi")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale("en")).toBe("en");
  });

  it("knows which scripts read right to left", () => {
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("ur")).toBe(true);
    expect(isRTL("en")).toBe(false);
  });
});

describe("plurals, in languages that do not have two forms", () => {
  const forms = { one: "# piece", other: "# pieces" };

  it("picks the English forms in English", () => {
    expect(plural(1, forms, "en")).toBe("1 piece");
    expect(plural(3, forms, "en")).toBe("3 pieces");
    expect(plural(0, forms, "en")).toBe("0 pieces");
  });

  it("uses the language's own rule, not English's", () => {
    // Polish: 2 takes 'few' where English takes 'other'. A ternary on
    // n === 1 cannot express this, which is why the ternaries had to go.
    const pl = { one: "# zadanie", few: "# zadania", many: "# zadań", other: "# zadania" };
    expect(plural(1, pl, "pl")).toBe("1 zadanie");
    expect(plural(2, pl, "pl")).toBe("2 zadania");
    expect(plural(5, pl, "pl")).toBe("5 zadań");
  });

  it("handles a language with a single form", () => {
    // Japanese does not inflect for number at all.
    const ja = { other: "#件" };
    expect(plural(1, ja, "ja")).toBe("1件");
    expect(plural(9, ja, "ja")).toBe("9件");
  });

  it("falls back to other rather than producing undefined", () => {
    // Arabic asks for forms this catalogue does not carry. Wrong-sounding
    // beats broken.
    expect(plural(2, { one: "one", other: "many" }, "ar")).toBe("many");
  });

  it("puts the number where the language puts it", () => {
    expect(plural(3, { one: "# thing", other: "totaal #" }, "nl")).toBe("totaal 3");
  });
});

describe("numbers and percentages", () => {
  it("uses the locale's own separators", () => {
    expect(formatNumber(1234.5, "de")).toBe("1.234,5");
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
  });

  it("groups the way Indian English does", () => {
    // Lakhs and crores group differently, and a grade report that gets this
    // wrong looks amateur to every reader who noticed.
    expect(formatNumber(1234567, "en-IN")).toBe("12,34,567");
  });

  it("writes a percentage as a percentage", () => {
    expect(formatPercent(86.67, "en", 2)).toBe("86.67%");
    expect(formatPercent(100, "en")).toBe("100%");
  });

  it("survives a locale it has never heard of", () => {
    expect(() => formatNumber(5, "xx-nonsense")).not.toThrow();
  });
});

describe("durations", () => {
  it("says minutes under an hour", () => {
    expect(formatDuration(45, "en")).toBe("45 min");
  });

  it("says whole hours without a stray zero", () => {
    expect(formatDuration(120, "en")).toBe("2 hr");
  });

  it("says both parts when there are both", () => {
    expect(formatDuration(90, "en")).toBe("1 hr 30 min");
  });

  it("takes its unit words from the caller", () => {
    // So the module stays translatable without importing a translator.
    expect(formatDuration(90, "hi", { hr: "घंटे", min: "मिनट" })).toBe("1 घंटे 30 मिनट");
  });

  it("never renders a negative duration", () => {
    expect(formatDuration(-30, "en")).toBe("0 min");
  });
});

describe("dates and relative time", () => {
  const at = new Date("2026-09-11T18:29:00.000Z");

  it("renders in the requested zone", () => {
    expect(formatDate(at, "en", "time", "Asia/Kolkata")).toMatch(/11:59|23:59/);
  });

  it("orders the parts the way the locale does", () => {
    // en-GB puts the day first; en-US puts the month first.
    const gb = formatDate(at, "en-GB", "date");
    const us = formatDate(at, "en-US", "date");
    expect(gb).not.toBe(us);
  });

  it("returns empty for an unparseable date rather than 'Invalid Date'", () => {
    expect(formatDate("not a date", "en")).toBe("");
    expect(formatRelative("not a date", "en")).toBe("");
  });

  it("says how long ago in the reader's language", () => {
    const now = new Date("2026-09-11T18:29:00.000Z");
    const threeDaysAgo = new Date("2026-09-08T18:29:00.000Z");
    expect(formatRelative(threeDaysAgo, "en", now)).toMatch(/3 days ago/);
    expect(formatRelative(threeDaysAgo, "de", now)).toMatch(/Tagen/);
  });
});

describe("lists and sorting", () => {
  it("joins with the language's own conjunction", () => {
    expect(formatList(["a", "b", "c"], "en")).toBe("a, b, and c");
    expect(formatList(["a", "b", "c"], "de")).toMatch(/und/);
  });

  it("handles one item and none", () => {
    expect(formatList(["only"], "en")).toBe("only");
    expect(formatList([], "en")).toBe("");
  });

  it("sorts names the way the language orders them", () => {
    // Code-point order puts Ö after Z. Swedish does not.
    const names = ["Zulu", "Ödegaard", "Andersson"];
    const sorted = [...names].sort((a, b) => compareNames(a, b, "sv"));
    expect(sorted[0]).toBe("Andersson");
    expect(sorted.indexOf("Ödegaard")).toBeGreaterThan(sorted.indexOf("Zulu"));
  });

  it("sorts numbers inside names sensibly", () => {
    const rooms = ["Room 10", "Room 2", "Room 1"];
    const sorted = [...rooms].sort((a, b) => compareNames(a, b, "en"));
    expect(sorted).toEqual(["Room 1", "Room 2", "Room 10"]);
  });
});
