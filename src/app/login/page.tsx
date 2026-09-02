import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import OAuthButtons from "@/components/OAuthButtons";
import EmailSignInForm from "@/components/EmailSignInForm";
import Divider from "@/components/Divider";
import RoleChooser from "@/components/RoleChooser";
import { INTENT_COPY, parseIntent } from "@/lib/accountIntent";
import { defaultWorkspace, WORKSPACES } from "@/lib/workspaces";
import { availableWorkspaces } from "@/lib/workspaces.server";

/**
 * Sign in, by door.
 *
 * Which door was chosen changes the copy and nothing else — the credentials
 * are the same and so is the resulting session. Where someone lands afterwards
 * is decided by what they can actually reach, not by what they picked here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    const available = await availableWorkspaces(session.user.id);
    redirect(WORKSPACES[defaultWorkspace(available)].home);
  }

  const intent = parseIntent((await searchParams).as);

  if (!intent) {
    return (
      <AuthShell
        title="Sign in to Scholar"
        subtitle="Which of these are you?"
        footer={
          <>
            New here?{" "}
            <Link href="/signup" className="inline-block py-2 text-vx-400 hover:text-vx-200">
              Create an account
            </Link>
          </>
        }
      >
        <RoleChooser mode="login" />
      </AuthShell>
    );
  }

  const copy = INTENT_COPY[intent];

  return (
    <AuthShell
      title={copy.signInTitle}
      subtitle={copy.signInSubtitle}
      footer={
        <>
          <Link href="/login" className="inline-block py-2 text-slate-500 hover:text-slate-300">
            ← Not a {copy.label.toLowerCase()}?
          </Link>
          <span className="mx-2 text-slate-700">·</span>
          <Link
            href={`/signup?as=${intent}`}
            className="inline-block py-2 text-vx-400 hover:text-vx-200"
          >
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
