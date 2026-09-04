/**
 * What finishing early has actually been worth to this student.
 *
 * The obvious version of this feature would relate starting early to the mark
 * received. Two problems with it. Scholar does not record when a piece of work
 * was started — task_events carries completedAt and dueAt and no start time —
 * so "started early" is not a measurable thing. And relating anything to the
 * mark invites a causal claim the data cannot support: a student who finishes
 * early on the pieces they find easy would produce exactly that correlation.
 *
 * So this measures what is actually there: how far ahead of the deadline work
 * was finished, against how far the estimate held. That is a fact about their
 * own working, it does not mention a grade, and the reading is left to them.
 *
 * Pure, and free of any database import, for the same reason plan.ts and
 * week.ts are: a student told something about how they work will reasonably
 * want to check it.
 */

export type FinishedPiece = {
  /** When the work was due. */
  dueAt: Date;
  /** When they actually finished it. */
  completedAt: Date;
  estimateMins: number;
  actualMins: number;
};

export type Band = {
  label: string;
  pieces: number;
  /** Actual over estimated. Above 1 means the work ran long. */
  ratio: number;
  /** How many finished after the deadline. */
  late: number;
};

export type Margins = {
  /** Comfortable first, then tight. Bands with too little evidence are absent. */
  bands: Band[];
  /** The difference in overrun between the roomiest and tightest band, or null. */
  gap: number | null;
};

/** Fewer than this in a band and it is a couple of afternoons, not a habit. */
export const MIN_PER_BAND = 3;

/** Below this the two bands are the same story told twice. */
export const MIN_GAP = 0.2;

const HOUR = 3_600_000;

/** More than a day, within a day, or after it was due. */
function bandOf(hoursSpare: number): 0 | 1 | 2 {
  if (hoursSpare >= 24) return 0;
  if (hoursSpare >= 0) return 1;
  return 2;
}

const LABELS = [
  "Finished with a day or more to spare",
  "Finished on the last day",
  "Finished after the deadline",
] as const;

/**
 * How overrun relates to how much room was left.
 *
 * Reported as bands rather than a correlation coefficient, because three
 * labelled rows are checkable by the person they describe and a coefficient is
 * not. Nothing is scored and nothing is predicted — this says what happened on
 * work already finished.
 */
export function finishingMargins(pieces: FinishedPiece[]): Margins {
  const buckets: FinishedPiece[][] = [[], [], []];

  for (const p of pieces) {
    if (!(p.estimateMins > 0) || !(p.actualMins > 0)) continue;
    const spare = (p.dueAt.getTime() - p.completedAt.getTime()) / HOUR;
    if (!Number.isFinite(spare)) continue;
    buckets[bandOf(spare)].push(p);
  }

  const bands: Band[] = buckets
    .map((group, i): Band | null => {
      if (group.length < MIN_PER_BAND) return null;
      const est = group.reduce((n, p) => n + p.estimateMins, 0);
      const act = group.reduce((n, p) => n + p.actualMins, 0);
      return {
        label: LABELS[i],
        pieces: group.length,
        ratio: Math.round((act / est) * 100) / 100,
        late: group.filter((p) => p.completedAt.getTime() > p.dueAt.getTime()).length,
      };
    })
    .filter((b): b is Band => b !== null);

  if (bands.length < 2) return { bands, gap: null };

  const spread = bands[bands.length - 1].ratio - bands[0].ratio;
  return {
    bands,
    gap: Math.abs(spread) >= MIN_GAP ? Math.round(spread * 100) / 100 : null,
  };
}
