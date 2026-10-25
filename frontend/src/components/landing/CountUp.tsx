import { useEffect, useState } from "react";

/** Counts up from 0 once the value arrives (eased, ~1.2 s); shows the final value at once when motion is reduced. */
export default function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0, start = 0;
    const step = (t: number) => {
      start ||= t;
      const p = Math.min((t - start) / 1200, 1);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="tabular-nums">{shown.toLocaleString("en-IN")}</span>;
}
