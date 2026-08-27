import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ThemeLoader from "@/components/ThemeLoader";

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

  return (
    <AppShell userEmail={session.user.email ?? null} userImage={session.user.image ?? null}>
      <ThemeLoader />
      {children}
    </AppShell>
  );
}
