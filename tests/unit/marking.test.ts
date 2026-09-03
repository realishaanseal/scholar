import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  forStudent, markQuestion, markQuiz,
  type Question, type Response,
} from "@/domains/assessment/marking";

/*
  Quiz marking is machine-made and immediate, which makes it the part of this
  system a student is most likely to dispute and least likely to get a human
  explanation for. Tested accordingly: on the cases where the obvious
  implementation gives an answer that is hard to defend out loud.
*/

const choice = (over: Partial<Question> = {}): Question => ({
  id: "q1", kind: "choice", prompt: "Pick one", points: 10,
  spec: {
    options: [
      { id: "a", body: "Right", correct: true },
      { id: "b", body: "Wrong" },
      { id: "c", body: "Also wrong" },
    ],
  },
  ...over,
});

const multi = (over: Partial<Question> = {}): Question => ({
  id: "q2", kind: "multi", prompt: "Pick all", points: 12,
  spec: {
    options: [
      { id: "a", body: "Right", correct: true },
      { id: "b", body: "Right too", correct: true },
      { id: "c", body: "Wrong" },
      { id: "d", body: "Wrong too" },
    ],
  },
  ...over,
});

const short = (over: Partial<Question> = {}): Question => ({
  id: "q3", kind: "short", prompt: "Name it", points: 5,
  spec: { accept: [{ text: "Mitochondria" }] },
  ...over,
});

const open = (over: Partial<Question> = {}): Question => ({
  id: "q4", kind: "open", prompt: "Explain", points: 20, spec: {},
  ...over,
});

const r = (x: Response): Response => x;

describe("single-answer questions", () => {
  it("awards full marks for the right option", () => {
    expect(markQuestion(choice(), r({ optionIds: ["a"] })).awarded).toBe(10);
  });

  it("awards nothing for the wrong option", () => {
    const res = markQuestion(choice(), r({ optionIds: ["b"] }));
    expect(res.awarded).toBe(0);
    expect(res.correct).toBe(false);
  });

  it("treats two picks on a one-answer question as wrong, not half right", () => {
    // Selecting the correct option and another one is a misread question, not
    // partial understanding.
    expect(markQuestion(choice(), r({ optionIds: ["a", "b"] })).awarded).toBe(0);
  });

  it("scores an unanswered question zero without needing a human", () => {
    const res = markQuestion(choice(), undefined);
    expect(res.awarded).toBe(0);
    expect(res.answered).toBe(false);
    expect(res.needsReview).toBe(false);
  });
});

describe("multi-select partial credit", () => {
  it("gives full marks for exactly the correct set", () => {
    expect(markQuestion(multi(), r({ optionIds: ["a", "b"] })).awarded).toBe(12);
  });

  it("gives half for one of two correct answers", () => {
    expect(markQuestion(multi(), r({ optionIds: ["a"] })).awarded).toBe(6);
  });

  it("cancels a right pick with a wrong one", () => {
    // One hit, one miss, over two correct → zero. A student who ticked one
    // right and one wrong has not demonstrated half the knowledge.
    expect(markQuestion(multi(), r({ optionIds: ["a", "c"] })).awarded).toBe(0);
  });

  it("scores zero for ticking every box", () => {
    // The property that makes partial credit honest: if picking everything
    // paid, picking everything would be the correct strategy.
    expect(markQuestion(multi(), r({ optionIds: ["a", "b", "c", "d"] })).awarded).toBe(0);
  });

  it("never goes negative", () => {
    // Two wrong picks, no right ones. A question cannot take marks off the
    // rest of the quiz.
    expect(markQuestion(multi(), r({ optionIds: ["c", "d"] })).awarded).toBe(0);
  });

  it("counts a repeated option once", () => {
    // Otherwise a crafted payload earns the mark twice.
    expect(markQuestion(multi(), r({ optionIds: ["a", "a", "a"] })).awarded).toBe(6);
  });

  it("ignores option ids that are not on the question", () => {
    expect(markQuestion(multi(), r({ optionIds: ["a", "b", "zzz"] })).awarded).toBe(12);
  });
});

describe("short answers", () => {
  it("ignores case by default", () => {
    expect(markQuestion(short(), r({ text: "mitochondria" })).awarded).toBe(5);
  });

  it("ignores surrounding whitespace", () => {
    expect(markQuestion(short(), r({ text: "  Mitochondria  " })).awarded).toBe(5);
  });

  it("respects an exact-match requirement when the teacher sets one", () => {
    const q = short({ spec: { accept: [{ text: "NaCl", mode: "exact" }] } });
    expect(markQuestion(q, r({ text: "NaCl" })).awarded).toBe(5);
    expect(markQuestion(q, r({ text: "nacl" })).awarded).toBe(0);
  });

  it("accepts any of several allowed answers", () => {
    const q = short({ spec: { accept: [{ text: "H2O" }, { text: "water" }] } });
    expect(markQuestion(q, r({ text: "Water" })).awarded).toBe(5);
  });

  it("does not accept a near miss", () => {
    // No edit-distance matching. Deciding a misspelling is close enough is a
    // teaching judgement, not a default.
    expect(markQuestion(short(), r({ text: "mitochondra" })).awarded).toBe(0);
  });

  it("treats whitespace as no answer at all", () => {
    const res = markQuestion(short(), r({ text: "   " }));
    expect(res.answered).toBe(false);
    expect(res.awarded).toBe(0);
  });
});

describe("open questions are never marked by machine", () => {
  it("returns no score and flags review even for a full answer", () => {
    const res = markQuestion(open(), r({ text: "A long and thoughtful essay." }));
    expect(res.awarded).toBeNull();
    expect(res.correct).toBeNull();
    expect(res.needsReview).toBe(true);
  });

  it("still needs a person when nothing was written", () => {
    // "They wrote nothing" and "nobody has looked" are different states, and
    // only one of them is the student's fault. A machine must not record the
    // zero on a teacher's behalf.
    const res = markQuestion(open(), undefined);
    expect(res.awarded).toBeNull();
    expect(res.needsReview).toBe(true);
    expect(res.answered).toBe(false);
  });
});

describe("a whole attempt", () => {
  it("totals the auto-marked questions", () => {
    const out = markQuiz([choice(), multi(), short()], {
      q1: { optionIds: ["a"] },
      q2: { optionIds: ["a"] },
      q3: { text: "mitochondria" },
    });
    expect(out.awarded).toBe(21);      // 10 + 6 + 5
    expect(out.possible).toBe(27);     // 10 + 12 + 5
    expect(out.needsReview).toBe(false);
  });

  it("holds the whole quiz open while one question needs a person", () => {
    // The half a machine can mark must not present itself as a final score
    // while a human still owes the student an answer — the same principle as
    // unmarked work not counting as zero in the gradebook.
    const out = markQuiz([choice(), open()], {
      q1: { optionIds: ["a"] },
      q4: { text: "An essay." },
    });
    expect(out.needsReview).toBe(true);
    expect(out.reviewCount).toBe(1);
    expect(out.awarded).toBe(10);
    expect(out.possible).toBe(30);
  });

  it("counts a missing response rather than crashing on it", () => {
    const out = markQuiz([choice(), short()], { q1: { optionIds: ["a"] } });
    expect(out.awarded).toBe(10);
    expect(out.answeredCount).toBe(1);
  });

  it("survives a quiz with no questions", () => {
    const out = markQuiz([], {});
    expect(out.awarded).toBe(0);
    expect(out.possible).toBe(0);
    expect(out.needsReview).toBe(false);
  });

  it("rounds without a floating point tail", () => {
    const out = markQuiz([multi({ points: 10 })], { q2: { optionIds: ["a"] } });
    expect(String(out.awarded)).not.toMatch(/\d{6,}/);
    expect(out.awarded).toBe(5);
  });
});

/* ── The answer key must not reach the student ─────────────────────────── */

describe("redaction", () => {
  it("strips correctness from the options a student is shown", () => {
    const out = forStudent(multi());
    expect(out.options).toEqual([
      { id: "a", body: "Right" },
      { id: "b", body: "Right too" },
      { id: "c", body: "Wrong" },
      { id: "d", body: "Wrong too" },
    ]);
    expect(JSON.stringify(out)).not.toContain("correct");
  });

  it("never carries the accepted answers of a short question", () => {
    const out = forStudent(short());
    expect(JSON.stringify(out)).not.toContain("Mitochondria");
  });

  it("never carries the explanation, which gives the answer away", () => {
    const q = choice({ explanation: "The answer is A because…" });
    expect(JSON.stringify(forStudent(q))).not.toContain("because");
  });

  it("does not mutate the question it was given", () => {
    // A mutation here would be one shared reference away from stripping the
    // answers the marker is about to need.
    const q = multi();
    forStudent(q);
    expect(q.spec.options!.find((o) => o.id === "a")!.correct).toBe(true);
  });

  it("emits no spec field at all", () => {
    // Not "an empty spec" — no spec. A key that is present but blank is one
    // refactor away from being present and populated.
    expect(Object.keys(forStudent(choice()))).not.toContain("spec");
  });
});

describe("marking is decided on the server", () => {
  const src = readFileSync(join(process.cwd(), "src/domains/assessment/marking.ts"), "utf8");

  it("imports no database", () => {
    // Pure by construction: this module is the arithmetic, nothing else.
    expect(src).not.toMatch(/from "@\/lib\/db"/);
  });

  it("has exactly one function that shapes a question for a student", () => {
    // More than one redaction path is how a payload eventually ships with the
    // answers still in it.
    expect(src.match(/export function forStudent/g)?.length).toBe(1);
  });
});
