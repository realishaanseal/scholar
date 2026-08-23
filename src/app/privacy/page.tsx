import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy — Varaxis Scholar",
  description: "How Varaxis Scholar collects, uses, and lets you delete your data.",
};

/**
 * Static, unauthenticated page — required by Google/GitHub/Facebook OAuth
 * app review and general good practice. Keep this in plain language; it's
 * read by users, not just platforms.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[720px] px-5 py-14">
      <Link href="/" className="mb-10 flex items-center gap-3">
        <Logo size={34} />
        <div className="text-left leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">
            Varaxis <span className="text-vx-300">Scholar</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">by Varaxis</div>
        </div>
      </Link>

      <div className="card p-7 xl:p-9">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Privacy Policy</h1>
        <p className="mt-1.5 text-sm text-slate-500">Last updated: August 23, 2026</p>

        <div className="mt-7 space-y-7 text-[14.5px] leading-relaxed text-slate-300">
          <section>
            <p>
              Varaxis Scholar (&ldquo;Scholar&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a homework
              organiser built by Varaxis. This page explains what information we collect, why, and how
              you can control or delete it. It applies to the Scholar web app at{" "}
              <span className="text-slate-200">scholar-varaxis.vercel.app</span> and to sign-in via
              Google, GitHub, or Facebook.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Information we collect</h2>
            <ul className="mt-2.5 list-disc space-y-1.5 pl-5">
              <li>
                <span className="text-slate-200">Account info:</span> your name and email address, either
                entered directly or provided by the sign-in method you choose (Google, GitHub, or
                Facebook). We only ever request basic profile info and an email address — never posts,
                friends lists, or other social data.
              </li>
              <li>
                <span className="text-slate-200">Homework data:</span> the tasks, deadlines, subjects, and
                notes you add — typed, spoken, imported from a Canvas/LMS calendar feed, or synced from
                Google Calendar if you connect it.
              </li>
              <li>
                <span className="text-slate-200">Usage data:</span> basic technical logs (timestamps,
                error reports) used only to keep the app working and to debug issues.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">How we use it</h2>
            <p className="mt-2.5">
              Solely to run Scholar for you: showing your tasks, sending reminders, generating AI
              summaries of your own workload, and — if you turn it on — keeping your tasks in sync with
              Google Calendar. We do not sell your data, share it with advertisers, or use it to train
              third-party AI models beyond the request needed to answer your own question inside the app.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Third-party sign-in</h2>
            <p className="mt-2.5">
              When you sign in with Google, GitHub, or Facebook, that provider shares only your name,
              email address, and profile picture with us — enough to create your Scholar account. We
              never receive your password for that provider, and we never post on your behalf. You can
              review or remove connected sign-in methods any time from{" "}
              <span className="text-slate-200">Settings → Account</span>.
            </p>
          </section>

          <section id="data-deletion">
            <h2 className="text-base font-semibold text-white">Deleting your data</h2>
            <p className="mt-2.5">
              You're always in control of your data. To delete it:
            </p>
            <ul className="mt-2.5 list-disc space-y-1.5 pl-5">
              <li>
                <span className="text-slate-200">Delete individual tasks</span> any time from your
                dashboard — this removes them immediately and permanently.
              </li>
              <li>
                <span className="text-slate-200">Disconnect Google Calendar sync</span> from{" "}
                <span className="text-slate-200">Settings → Calendar</span>, which also revokes
                Scholar&rsquo;s access token with Google.
              </li>
              <li>
                <span className="text-slate-200">Delete your whole account</span> by emailing{" "}
                <a className="text-vx-300 hover:text-vx-200" href="mailto:ishaan.seal2007@gmail.com">
                  ishaan.seal2007@gmail.com
                </a>{" "}
                from the address on your account, with the subject &ldquo;Delete my Scholar
                account&rdquo;. We&rsquo;ll permanently delete your account, homework data, and any
                stored sign-in or calendar-sync tokens within 30 days, and confirm by email once it&rsquo;s
                done.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Data storage &amp; security</h2>
            <p className="mt-2.5">
              Your data is stored in a managed Postgres database and encrypted in transit (HTTPS)
              everywhere. Sensitive tokens (like calendar sync credentials) are additionally encrypted at
              rest. Only you can see your own homework data through your authenticated account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Changes to this policy</h2>
            <p className="mt-2.5">
              If this policy changes meaningfully, we&rsquo;ll update the date at the top of this page.
              Continued use of Scholar after a change means you accept the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Contact</h2>
            <p className="mt-2.5">
              Questions about privacy or data handling? Email{" "}
              <a className="text-vx-300 hover:text-vx-200" href="mailto:ishaan.seal2007@gmail.com">
                ishaan.seal2007@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-600">
        <Link href="/" className="inline-block py-2 hover:text-slate-400">
          ← Back to Varaxis Scholar
        </Link>
      </p>
    </main>
  );
}
