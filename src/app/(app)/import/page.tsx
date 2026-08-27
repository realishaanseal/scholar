import LmsImport from "@/components/LmsImport";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Import</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Bring in assignments from your school's LMS or a pasted notice.</p>
      </div>
      <LmsImport />
    </div>
  );
}
