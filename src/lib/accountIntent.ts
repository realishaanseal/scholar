/**
 * The three doors into Scholar.
 *
 * Chosen at signup and sign-in; shapes where somebody lands. It grants
 * nothing — authority comes from organization_memberships, which the
 * institution controls. Hence the note on the teacher and administrator
 * doors, so the choice does not read as having granted something.
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
  signInTitle: string;
  signUpTitle: string;
  /** Access this door cannot grant. Absent for students, who need nothing. */
  note?: string;
  icon: string;
};

export const INTENT_COPY: Record<AccountIntent, Copy> = {
  student: {
    label: "Student",
    signInTitle: "Welcome back",
    signUpTitle: "Create your account",
    icon: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c3 3 9 3 12 0v-5",
  },
  teacher: {
    label: "Teacher",
    signInTitle: "Welcome back",
    signUpTitle: "Create your account",
    // Without this, somebody signs up, sees nothing, and assumes it is broken.
    note: "Your classes appear once your school adds this email address to them.",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  admin: {
    label: "Administrator",
    signInTitle: "Welcome back",
    signUpTitle: "Create your account",
    note: "Administration is granted by the institution, not chosen here.",
    icon: "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z",
  },
};
