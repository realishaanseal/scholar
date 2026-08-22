import Link from "next/link";
import Logo from "./Logo";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[440px]">
        <Link href="/" className="mb-8 flex animate-fadeIn items-center justify-center gap-3">
          <Logo size={38} />
          <div className="text-left leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">
              Varaxis <span className="text-vx-300">Scholar</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">by Varaxis</div>
          </div>
        </Link>

        <div className="card animate-riseIn p-7 xl:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 animate-fadeIn text-center text-sm text-slate-500">{footer}</p>
      </div>
    </main>
  );
}
