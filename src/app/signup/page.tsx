import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, enabledOAuthProviders } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import OAuthButtons from "@/components/OAuthButtons";
import EmailSignUpForm from "@/components/EmailSignUpForm";
import Divider from "@/components/Divider";
import RoleChooser from "@/components/RoleChooser";
import { INTENT_COPY, parseIntent } from "@/lib/accountIntent";
import { defaultWorkspace, WORKSPACES } from "@/lib/workspaces";
import { availableWorkspaces } from "@/lib/workspaces.server";

/**
 * Create an account, by door.
 *
 * The teacher and administrator doors say outright that access is granted by
 * an institution. That is not a disclaimer, it is the truth of the model —
 * choosing "Teacher" here records an intention and confers nothing — and
 * saying so is the difference between a person waiting patiently for their
 * school and a person concluding the product is broken.
 */
export default async function SignUpPage({
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
        title="Create your account"
        subtitle="Which of these are you?"
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="inline-block py-2 text-vx-400 hover:text-vx-200">
              Sign in
            </Link>
          </>
        }
      >
        <RoleChooser mode="signup" />
      </AuthShell>
    );
  }

  const copy = INTENT_COPY[intent];

  return (
    <AuthShell
      title={copy.signUpTitle}
      footer={
        <>
          <Link href="/signup" className="inline-block py-2 text-slate-500 hover:text-slate-300">
            ← Not a {copy.label.toLowerCase()}?
          </Link>
          <span className="mx-2 text-slate-700">·</span>
          <Link
            href={`/login?as=${intent}`}
            className="inline-block py-2 text-vx-400 hover:text-vx-200"
          >
            Sign in
          </Link>
        </>
      }
    >
      {copy.note && (
        <p className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-400">
          {copy.note}
        </p>
      )}
      <OAuthButtons enabled={enabledOAuthProviders} />
      <Divider label="or" />
      <EmailSignUpForm intent={intent} />
    </AuthShell>
  );
}
