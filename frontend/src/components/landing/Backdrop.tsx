/** Public-site backdrop: a deep charcoal gradient (graphite on the left, warming toward the map on the right) with eased
 *  stops for a smooth transition, two broad low-contrast lights, a gentle vignette and fine grain (which also prevents
 *  colour banding). Static; no blobs, beams, stars or horizon arcs. */
export default function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[linear-gradient(155deg,#16181C_0%,#141519_18%,#121316_36%,#111113_52%,#100F0F_66%,#110F0D_80%,#14110C_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_80%_28%,rgba(212,175,55,0.07)_0%,rgba(212,175,55,0.035)_35%,transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_0%_100%,rgba(140,155,180,0.04)_0%,rgba(140,155,180,0.015)_40%,transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.18)_75%,rgba(0,0,0,0.4)_100%)]" />
      <div className="grain absolute inset-0" />
    </div>
  );
}
