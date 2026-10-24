/** Living backdrop for the public site: obsidian base, three slow-drifting lights (gold, teal, indigo), vignette and grain.
 *  Transform-only animations; frozen by the global reduced-motion rule. */
export default function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#05070B]">
      <div className="orb orb-a right-[-12%] top-[-18%] h-[75vh] w-[60vw] bg-[radial-gradient(closest-side,rgba(212,175,55,0.24),transparent)]" />
      <div className="orb orb-b bottom-[-25%] left-[-12%] h-[75vh] w-[55vw] bg-[radial-gradient(closest-side,rgba(14,116,144,0.22),transparent)]" />
      <div className="orb orb-c left-[28%] top-[38%] h-[60vh] w-[45vw] bg-[radial-gradient(closest-side,rgba(79,70,229,0.13),transparent)]" />
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-[conic-gradient(from_200deg_at_70%_-10%,transparent_0deg,rgba(253,224,71,0.06)_25deg,transparent_55deg)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.72)_100%)]" />
      <div className="grain absolute inset-0" />
    </div>
  );
}
