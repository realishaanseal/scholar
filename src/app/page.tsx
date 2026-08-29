import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import HomeIntroGate from "@/components/HomeIntroGate";
import LandingPage from "@/components/landing/LandingPage";

/**
 * Signed-out landing page. Structure and copy live in <LandingPage> (a client
 * component — the whole page is Motion choreography); this server component
 * only bounces an already-signed-in visitor straight to their dashboard.
 */
export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <HomeIntroGate>
      <LandingPage />
    </HomeIntroGate>
  );
}
