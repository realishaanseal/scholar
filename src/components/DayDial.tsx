"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import {
  clockTime,
  dayEndMins,
  dayStartMins,
  meta,
  type ClassSlot,
} from "@/lib/scholar/timetableView";

/**
 * The day as a dial.
 *
 * The panel used to be a large digital clock floating in an empty box — the
 * clock told you the time, which you already knew, and the rest of the space
 * said nothing. Here the ring *is* the school day: every period is an arc
 * drawn to scale on it, the hand is where you are in that day, and the space
 * inside the ring carries the status. One glance answers "how much of today
 * is left, and what's around me", which is the question the panel exists for.
 *
 * The geometry is a plain SVG arc — no chart library for one ring.
 */

const SIZE = 300;
const C = SIZE / 2;
/** Radius of the period track. */
const R = 118;
const TRACK_W = 18;
/* The dial is a gauge, not a full circle: the gap gives the start and end
   of the day a definite beginning and end rather than meeting in an
   ambiguous seam. Angles run clockwise from 12 o clock (0 = top, 90 = right,
   180 = bottom), so starting at -125 and sweeping 250 leaves a 110-degree
   gap centred on the bottom, where the day bounds are labelled. */
const START_ANGLE = -125;
const SWEEP = 250;
/** Below this the arc is too thin to read, so it is padded out. */
const MIN_ARC_DEG = 2.2;
/* Back-to-back periods share an edge, and round caps overhang their arc by
   half the stroke width — so lunch ending exactly as library begins drew the
   two caps on top of each other and read as a smudge. Butt caps plus a
   hairline angular inset give a clean joint instead. */
const JOINT_DEG = 1.1;

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function arcPath(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export type DayWindow = { from: number; to: number };

/** The plotted window: the day's own span, snapped out to whole hours, with
 *  a floor so a single short day isn't stretched around the whole dial. */
export function dayWindow(today: ClassSlot[]): DayWindow {
  if (today.length === 0) return { from: 8 * 60, to: 17 * 60 };
  const lo = Math.min(...today.map(dayStartMins));
  const hi = Math.max(...today.map(dayEndMins));
  const from = Math.floor(lo / 60) * 60;
  return { from, to: Math.max(Math.ceil(hi / 60) * 60, from + 300) };
}

export default function DayDial({
  today,
  now,
  children,
  hidden = false,
}: {
  today: ClassSlot[];
  now: Date;
  /** Rendered inside the ring — the status the dial is framing. */
  children?: React.ReactNode;
  /** Drop the ring and render only the centre content. */
  hidden?: boolean;
}) {
  const { from, to } = useMemo(() => dayWindow(today), [today]);
  const span = to - from;
  const nowOfDay = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const angleAt = (mins: number) =>
    START_ANGLE + (Math.min(to, Math.max(from, mins)) - from) / span * SWEEP;

  const hourTicks = useMemo(() => {
    const out: number[] = [];
    for (let m = from; m <= to; m += 60) out.push(m);
    return out;
  }, [from, to]);

  const inWindow = nowOfDay >= from && nowOfDay <= to;
  const nowAngle = angleAt(nowOfDay);
  const [nx, ny] = polar(R, nowAngle);

  if (hidden) {
    return (
      <div className="grid place-items-center py-6 text-center">
        {children}
        <p className="mt-3 text-[12.5px] text-slate-500">No classes scheduled today</p>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="absolute inset-0"
        aria-hidden
      >
        <defs>
          <linearGradient id="dial-elapsed" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent-h) var(--accent-s) calc(var(--accent-l) + 8%))" />
            <stop offset="100%" stopColor="hsl(var(--accent-h-2) var(--accent-s) calc(var(--accent-l) + 4%))" />
          </linearGradient>
          <filter id="dial-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Empty track */}
        <path
          d={arcPath(R, START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={TRACK_W}
          strokeLinecap="round"
        />

        {/* Hour ticks, just inside the track */}
        {hourTicks.map((m) => {
          const a = angleAt(m);
          const [x0, y0] = polar(R - TRACK_W / 2 - 5, a);
          const [x1, y1] = polar(R - TRACK_W / 2 - 11, a);
          return (
            <line
              key={m}
              x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Periods */}
        {today.map((slot, i) => {
          const km = meta(slot.kind);
          const rawStart = angleAt(dayStartMins(slot));
          const rawEnd = Math.max(rawStart + MIN_ARC_DEG, angleAt(dayEndMins(slot)));
          const a0 = rawStart + JOINT_DEG / 2;
          const a1 = Math.max(a0 + 0.4, rawEnd - JOINT_DEG / 2);
          const live = dayStartMins(slot) <= nowOfDay && nowOfDay < dayEndMins(slot);
          const done = dayEndMins(slot) <= nowOfDay;
          return (
            <motion.path
              key={slot.id}
              d={arcPath(R, a0, a1)}
              fill="none"
              stroke={km.hex}
              strokeWidth={live ? TRACK_W + 4 : TRACK_W}
              strokeLinecap="butt"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: done ? 0.3 : live ? 1 : 0.72 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.12 + i * 0.05 }}
            />
          );
        })}

        {/* Now hand */}
        {inWindow && (
          <g>
            <circle cx={nx} cy={ny} r={9} fill="#fff" opacity={0.22} filter="url(#dial-soft)" />
            <motion.circle
              cx={nx} cy={ny} r={5}
              fill="#fff"
              animate={{ scale: [1, 1.25, 1], opacity: [1, 0.75, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: `${nx}px ${ny}px` }}
            />
          </g>
        )}
      </svg>

      {/* Day bounds, sat in the dial's gap */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[6px] flex justify-center gap-8 text-[10px] tabular-nums text-slate-600"
        aria-hidden
      >
        <span>{clockTime(from)}</span>
        <span>{clockTime(to)}</span>
      </div>

      <div className="absolute inset-0 grid place-items-center px-12 text-center">{children}</div>
    </div>
  );
}
