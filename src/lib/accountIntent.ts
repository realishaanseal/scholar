/**
 * The three doors into Scholar.
 *
 * A person chooses one at signup and at sign-in. It is a statement of what
 * they are here to do, and it shapes what they are told and where they land.
 *
 * It grants nothing. Real authority comes from organization_memberships, which
 * an institution controls — so choosing "Teacher" here makes the product speak
 * to a teacher, and makes no difference whatsoever to what the policy engine
 * will allow. That separation is the point, and it is why the teacher and
 * administrator doors say plainly that access has to be granted rather than
 * implying the choice did something.
 */

export const ACCOUNT_INTENTS = ["student", "teacher", "admin"] as const;
export type AccountIntent = (typeof ACCOUNT_INTENTS)[number];

export function isAccountIntent(v: unknown): v is AccountIntent {
  return typeof v === "string" && (ACCOUNT_INTENTS as readonly string[]).includes(v);
}

/** Narrow an untrusted query parameter without throwing. */
export function parseIntent(v: string | undefined | null): AccountIntent | null {
  return isAccountIntent(v) ? v : null;
}

type Copy = {
  label: string;
  /** One line on the chooser, saying what this door is for. */
  blurb: string;
  signInTitle: string;
  signInSubtitle: string;
  signUpTitle: string;
  signUpSubtitle: string;
  /**
   * Shown after signing up through this door. Absent for students, because
   * nothing further needs to happen for them.
   */
  afterSignUp?: string;
  icon: string;
};

export const INTENT_COPY: Record<AccountIntent, Copy> = {
  student: {
    label: "Student",
    blurb: "Track your work, plan your week, and see what your teachers set.",
    signInTitle: "Welcome back",
    signInSubtitle: "Pick up where your work left off.",
    signUpTitle: "Start with Scholar",
    signUpSubtitle: "Your homework, your timetable, your plan — yours alone.",
    icon: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c3 3 9 3 12 0v-5",
  },
  teacher: {
    label: "Teacher",
    blurb: "Set work, hand out materials, and mark what comes back.",
    signInTitle: "Welcome back",
    signInSubtitle: "Your classes and anything waiting to be marked.",
    signUpTitle: "Create your account",
    signUpSubtitle: "You will need your school to add you to a class before you can teach.",
    // Said plainly, because the alternative is someone signing up, seeing
    // nothing, and assuming the product is broken.
    afterSignUp:
      "Your account is ready. Teaching appears once your school adds you to a class — " +
      "ask whoever administers Scholar there to add this email address.",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  admin: {
    label: "Administrator",
    blurb: "Set up courses, people and terms for an institution.",
    signInTitle: "Welcome back",
    signInSubtitle: "Your institution, its people and its courses.",
    signUpTitle: "Create your account",
    signUpSubtitle: "Administration has to be granted by the institution itself.",
    afterSignUp:
      "Your account is ready. Administration is granted by the institution, not chosen " +
      "here — if you are setting Scholar up for the first time, the bootstrap command " +
      "in the project README links this email address to a new institution.",
    icon: "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z",
  },
};
