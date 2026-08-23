import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import OAuthButtons from "@/components/OAuthButtons";
import EmailSignUpForm from "@/components/EmailSignUpForm";
import Divider from "@/components/Divider";

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthShell
      title="Create your account"
      subtitle="One tap with a provider, or an email and password."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="inline-block py-2 text-vx-400 hover:text-vx-200">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons enabled={enabledOAuthProviders} />
      <Divider label="or" />
      <EmailSignUpForm />
    </AuthShell>
  );
}
