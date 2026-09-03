import type { AvailabilityProfile } from "./types";

const MS_PER_MIN = 60_000;

/**
 * Is this a day off for this particular student?
 *
 * Reads the profile rather than assuming Saturday and Sunday. The assumption
 * held for most of the world and failed for the part of it where the weekend
 * is Friday-Saturday — and it failed silently, by telling a student in Cairo
 * to start an essay on a Sunday they spend at school.
 *
 * An empty or missing list falls back to the conventional pair rather than
 * treating every day as a working day, because a profile that has not been
 * filled in should behave the way it always did.
 */
export function isRestDay(d: Date, profile: AvailabilityProfile): boolean {
  const rest = profile.restDays?.length ? profile.restDays : [0, 6];
  return rest.includes(d.getDay());
}

/** Study capacity in minutes for a given calendar day, per the student's profile. */
export function capacityForDay(day: Date, profile: AvailabilityProfile): number {
  return isRestDay(day, profile) ? profile.weekendMins : profile.weekdayMins;
}

/**
 * Realistic study minutes between `now` and `deadline`.
 *
 * This is the number that makes urgency meaningful: a 4-hour task due tomorrow
 * morning is in trouble in a way a 10-minute task due tomorrow morning is not,
 * and only a time-aware figure can tell them apart. Wall-clock hours would
 * wrongly count 3am as study time, so each day contributes only the portion of
 * the student's declared study window that actually remains.
 */
export function availableMinutesBefore(
  deadline: Date,
  profile: AvailabilityProfile,
  now: Date = new Date()
): number {
  if (deadline.getTime() <= now.getTime()) return 0;

  let total = 0;
  const cursor = new Date(now);

  // Walk day by day. Capped at a year so a far-future or malformed date can't spin.
  for (let guard = 0; guard < 366; guard++) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);

    const windowStart = new Date(dayStart);
    windowStart.setHours(profile.studyStartHour, 0, 0, 0);

    const windowEnd = new Date(dayStart);
    windowEnd.setHours(profile.studyEndHour, 0, 0, 0);

    // Clip the study window to what's left of the day and to the deadline itself.
    const from = new Date(Math.max(windowStart.getTime(), cursor.getTime()));
    const to = new Date(Math.min(windowEnd.getTime(), deadline.getTime()));

    if (to.getTime() > from.getTime()) {
      const windowMins = (to.getTime() - from.getTime()) / MS_PER_MIN;
      // The declared daily capacity is the real limit — a 6-hour window doesn't
      // mean 6 hours of studying actually happens.
      total += Math.min(windowMins, capacityForDay(dayStart, profile));
    }

    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    if (nextDay.getTime() >= deadline.getTime()) break;
    cursor.setTime(nextDay.getTime());
  }

  return Math.round(total);
}

/** Study minutes remaining today, from now until the end of the study window. */
export function minutesLeftToday(profile: AvailabilityProfile, now: Date = new Date()): number {
  const end = new Date(now);
  end.setHours(profile.studyEndHour, 0, 0, 0);
  if (end.getTime() <= now.getTime()) return 0;
  return Math.min(
    Math.round((end.getTime() - now.getTime()) / MS_PER_MIN),
    capacityForDay(now, profile)
  );
}
