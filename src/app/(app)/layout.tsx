import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { availableWorkspaces } from "@/lib/workspaces.server";
import { isEnrolledAnywhere } from "@/domains/learning";

export const dynamic = "force-dynamic";

/**
 * Shared shell for every authenticated page — Homework, Timetable, Import,
 * Calendar, Extension, Insights, Groups, and Settings all render inside this
 * one layout, so the auth check and the nav rail live in exactly one place
 * rather than being copy-pasted per page (as the old per-page headers were).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Which sides of the product this person actually has a relationship for.
  // Read from the database, never from a role someone claimed at signup.
  const [workspaces, enrolled] = session.user.id
    ? await Promise.all([
        availableWorkspaces(session.user.id),
        isEnrolledAnywhere(session.user.id),
      ])
    : [(["personal"] as const).slice(), false];

  return (
    <AppShell
      userEmail={session.user.email ?? null}
      userImage={session.user.image ?? null}
      workspaces={workspaces}
      enrolled={enrolled}
    >
      {children}
    </AppShell>
  );
}
