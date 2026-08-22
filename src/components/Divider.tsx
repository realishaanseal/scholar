export default function Divider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="rail-divider flex-1" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <div className="rail-divider flex-1" />
    </div>
  );
}
