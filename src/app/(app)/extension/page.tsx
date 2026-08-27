import ExtensionSetup from "@/components/ExtensionSetup";

export const dynamic = "force-dynamic";

export default function ExtensionPage() {
  return (
    <div>
      <div className="mb-7 animate-riseIn">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="gradient-text">Browser extension</span>
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Send assignments straight from any page on the web.</p>
      </div>
      <ExtensionSetup />
    </div>
  );
}
