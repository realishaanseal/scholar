import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import OAuthButtons from "@/components/OAuthButtons";
import EmailSignInForm from "@/components/EmailSignInForm";
import Divider from "@/components/Divider";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where your homework left off."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="inline-block py-2 text-vx-400 hover:text-vx-200">
            Create an account
          </Link>
        </>
      }
    >
      <OAuthButtons enabled={enabledOAuthProviders} />
      <Divider label="or" />
      <EmailSignInForm />
    </AuthShell>
  );
}
