/**
 * Ambient page backdrop: three slow-drifting aurora fields, a masked grid,
 * and a film-grain veil. Purely decorative — fixed, behind everything,
 * and non-interactive.
 */
export default function Backdrop() {
  return (
    <>
      <div className="aurora-field" aria-hidden>
        <div
          className="aurora-blob animate-drift"
          style={{
            top: "-10%", left: "-6%", width: "62vw", height: "62vw",
            background: "radial-gradient(circle at 30% 30%, rgba(91,124,250,0.92), transparent 60%)",
          }}
        />
        <div
          className="aurora-blob animate-drift-slow"
          style={{
            top: "-4%", right: "-10%", width: "56vw", height: "56vw",
            background: "radial-gradient(circle at 60% 40%, rgba(148,85,245,0.78), transparent 60%)",
            animationDelay: "-8s",
          }}
        />
        <div
          className="aurora-blob animate-drift"
          style={{
            bottom: "-18%", left: "20%", width: "64vw", height: "52vw",
            background: "radial-gradient(circle at 50% 50%, rgba(34,184,208,0.5), transparent 62%)",
            animationDelay: "-16s",
          }}
        />
      </div>
      <div className="grid-veil" aria-hidden />
      <div className="vignette-veil" aria-hidden />
      <div className="grain-veil" aria-hidden />
    </>
  );
}
