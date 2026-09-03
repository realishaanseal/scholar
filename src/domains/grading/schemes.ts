/**
 * How a grade is written down.
 *
 * Phase 6 refused to add A–F letters, on the grounds that shipping one
 * country's convention as though it were universal is worse than shipping
 * none. That was right, and the consequence was that Scholar expressed
 * exactly one convention anyway — a percentage — and presented it as
 * neutral. A percentage is not neutral. It is the British and Indian answer;
 * it is not the German one, the French one, or the IB one.
 *
 * So a scheme is a first-class object, and the arithmetic stays underneath it.
 * `courseGrade()` still computes a normalised fraction from marks and weights,
 * and that number never changes. A scheme decides only how it is written and
 * which direction counts as better.
 *
 * That second part is the trap. The German scale runs 1.0 (sehr gut) to 6.0
 * (ungenügend): **lower is better**. Every piece of code that assumes a bigger
 * number is a better outcome breaks silently against it — a "sort by grade"
 * control puts the failing students at the top, a colour scale paints the best
 * work red, and nothing errors. Direction is therefore a property of the
 * scheme that the comparison functions consult, not a display flag applied at
 * the end.
 *
 * Pure, and free of any database import, for the same reason the rest of this
 * domain is: a student will one day ask why their 78% is a 2 and not a 1, and
 * the answer should be readable without a running system.
 */

export type Direction = "higher-better" | "lower-better";

export type Band = {
  /** Lowest percentage that earns this band, inclusive. */
  min: number;
  /** What the student sees: "A", "2", "First", "6". */
  label: string;
  /** The band's own name, where it has one worth showing. */
  name?: string;
  /** Numeric value for averaging, where the scale is numeric (GPA, CGPA). */
  points?: number;
};

export type GradingScheme = {
  id: string;
  name: string;
  /** Where this convention is used, for an administrator choosing one. */
  region: string;
  direction: Direction;
  /** Ordered best-first, whatever "best" means for this scheme. */
  bands: Band[];
  /** Lowest percentage that counts as a pass. */
  passMark: number;
  /** Show the percentage alongside the band. */
  showPercent: boolean;
};

/**
 * The schemes Scholar ships with.
 *
 * Deliberately a fixed set rather than a builder. An institution choosing
 * "Germany" is choosing something a German teacher will recognise; an
 * institution assembling its own bands from scratch is one typo away from a
 * scale that quietly fails a year group. Custom schemes are a later feature
 * with a confirmation step, not a text field.
 *
 * Boundaries vary between states, boards and schools everywhere on this list.
 * These are the common conventions, and an institution that needs different
 * cut-offs needs the custom scheme rather than a silently-wrong default.
 */
export const SCHEMES: GradingScheme[] = [
  {
    id: "percent",
    name: "Percentage",
    region: "Common in India, the UK and much of the Commonwealth",
    direction: "higher-better",
    passMark: 40,
    showPercent: true,
    bands: [],
  },
  {
    id: "us-letter",
    name: "Letter grades (A–F)",
    region: "United States",
    direction: "higher-better",
    passMark: 60,
    showPercent: true,
    bands: [
      { min: 97, label: "A+", points: 4.0 },
      { min: 93, label: "A", points: 4.0 },
      { min: 90, label: "A−", points: 3.7 },
      { min: 87, label: "B+", points: 3.3 },
      { min: 83, label: "B", points: 3.0 },
      { min: 80, label: "B−", points: 2.7 },
      { min: 77, label: "C+", points: 2.3 },
      { min: 73, label: "C", points: 2.0 },
      { min: 70, label: "C−", points: 1.7 },
      { min: 67, label: "D+", points: 1.3 },
      { min: 63, label: "D", points: 1.0 },
      { min: 60, label: "D−", points: 0.7 },
      { min: 0, label: "F", points: 0 },
    ],
  },
  {
    id: "uk-classification",
    name: "Degree classification",
    region: "United Kingdom, higher education",
    direction: "higher-better",
    passMark: 40,
    showPercent: true,
    bands: [
      { min: 70, label: "1st", name: "First-class" },
      { min: 60, label: "2:1", name: "Upper second" },
      { min: 50, label: "2:2", name: "Lower second" },
      { min: 40, label: "3rd", name: "Third-class" },
      { min: 0, label: "Fail", name: "Fail" },
    ],
  },
  {
    id: "de-noten",
    name: "Noten (1–6)",
    region: "Germany, Austria",
    // The one that breaks naive code. 1.0 is the best grade available.
    direction: "lower-better",
    passMark: 50,
    showPercent: false,
    bands: [
      { min: 92, label: "1", name: "sehr gut", points: 1 },
      { min: 81, label: "2", name: "gut", points: 2 },
      { min: 67, label: "3", name: "befriedigend", points: 3 },
      { min: 50, label: "4", name: "ausreichend", points: 4 },
      { min: 30, label: "5", name: "mangelhaft", points: 5 },
      { min: 0, label: "6", name: "ungenügend", points: 6 },
    ],
  },
  {
    id: "fr-vingt",
    name: "Notation sur 20",
    region: "France",
    direction: "higher-better",
    passMark: 50,
    showPercent: false,
    bands: [],
  },
  {
    id: "ib-seven",
    name: "IB (1–7)",
    region: "International Baccalaureate",
    direction: "higher-better",
    passMark: 57,
    showPercent: false,
    bands: [
      { min: 90, label: "7", points: 7 },
      { min: 80, label: "6", points: 6 },
      { min: 70, label: "5", points: 5 },
      { min: 57, label: "4", points: 4 },
      { min: 44, label: "3", points: 3 },
      { min: 30, label: "2", points: 2 },
      { min: 0, label: "1", points: 1 },
    ],
  },
  {
    id: "in-cgpa",
    name: "CGPA (10-point)",
    region: "India, CBSE and many universities",
    direction: "higher-better",
    passMark: 33,
    showPercent: true,
    bands: [
      { min: 91, label: "10", name: "A1", points: 10 },
      { min: 81, label: "9", name: "A2", points: 9 },
      { min: 71, label: "8", name: "B1", points: 8 },
      { min: 61, label: "7", name: "B2", points: 7 },
      { min: 51, label: "6", name: "C1", points: 6 },
      { min: 41, label: "5", name: "C2", points: 5 },
      { min: 33, label: "4", name: "D", points: 4 },
      { min: 0, label: "E", name: "Needs improvement", points: 0 },
    ],
  },
  {
    id: "nl-tien",
    name: "Cijfers (1–10)",
    region: "Netherlands",
    direction: "higher-better",
    passMark: 55,
    showPercent: false,
    bands: [],
  },
];

export const DEFAULT_SCHEME_ID = "percent";

export function scheme(id: string | null | undefined): GradingScheme {
  return SCHEMES.find((s) => s.id === id) ?? SCHEMES[0];
}

/* ── Rendering a grade ─────────────────────────────────────────────────── */

export type DisplayedGrade = {
  /** What the student reads. */
  text: string;
  /** The band's full name, where it has one. */
  name?: string;
  /** The underlying percentage, unchanged and always available. */
  percent: number;
  /** True when this is at or above the scheme's pass mark. */
  passing: boolean;
  /** Numeric value on the scheme's own scale, for averaging. */
  points?: number;
};

/**
 * Write a percentage the way this institution writes grades.
 *
 * The percentage is carried through untouched. Whatever a scheme does to the
 * presentation, the number the arithmetic produced stays available — so a
 * disputed grade can always be traced back to marks and weights rather than
 * to a band boundary.
 */
export function displayGrade(
  percent: number | null,
  s: GradingScheme
): DisplayedGrade | null {
  if (percent === null || !Number.isFinite(percent)) return null;

  const passing = percent >= s.passMark;

  // Continuous scales have no bands: the percentage is rescaled directly.
  if (s.bands.length === 0) {
    if (s.id === "fr-vingt") {
      const v = round(percent / 5, 1);
      return { text: v.toFixed(1).replace(".", ","), percent, passing, points: v };
    }
    if (s.id === "nl-tien") {
      const v = round(percent / 10, 1);
      return { text: v.toFixed(1).replace(".", ","), percent, passing, points: v };
    }
    return { text: `${round(percent, 2)}%`, percent, passing };
  }

  // Bands are ordered best-first by percentage, so the first one the value
  // clears is the right one regardless of which direction the labels run.
  const band = s.bands.find((b) => percent >= b.min) ?? s.bands[s.bands.length - 1];

  return {
    text: s.showPercent ? `${band.label} (${round(percent, 1)}%)` : band.label,
    name: band.name,
    percent,
    passing,
    points: band.points,
  };
}

/* ── Comparison, which is where direction actually matters ─────────────── */

/**
 * Order two grades best-first, in this scheme's terms.
 *
 * Always compare the underlying percentage rather than the displayed value.
 * A German "2" sorts above a "3" because 85% is above 70%, not because 2 is
 * less than 3 — and building it on the label would break the moment a scheme
 * used non-numeric labels like "2:1" and "Fail".
 *
 * Direction is not consulted here on purpose: a higher percentage is a better
 * outcome in every scheme, and that is what makes this safe. Direction exists
 * for the moment a UI has the *displayed* number in hand and needs to know
 * whether bigger looks better.
 */
export function compareGrades(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/**
 * Does a bigger number on the face of it mean a better result?
 *
 * The question a sort control, a colour scale or an arrow icon needs
 * answered, and the one that produced silent nonsense before schemes existed.
 */
export function higherIsBetter(s: GradingScheme): boolean {
  return s.direction === "higher-better";
}

/**
 * Where a grade sits between failing and full marks, 0–1.
 *
 * For colour scales and progress bars. Always oriented so that 1 is good,
 * whatever the scheme's own numbers do, so a UI can use it without knowing
 * which convention it is rendering.
 */
export function gradeStrength(percent: number | null): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return Math.min(1, Math.max(0, percent / 100));
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}
