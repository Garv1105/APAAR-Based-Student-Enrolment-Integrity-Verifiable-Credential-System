import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion";

/** Fixed full-screen canvas of faint particles that drift upward and twinkle. Static with reduced motion. */
export default function Starfield({ count = 110 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.25,
      vy: Math.random() * 0.12 + 0.03, vx: (Math.random() - 0.5) * 0.05, ph: Math.random() * Math.PI * 2, sp: Math.random() * 0.012 + 0.004,
      hue: Math.random() < 0.7 ? "190, 205, 255" : "190, 170, 255",
    }));
    const draw = (move: boolean) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        if (move) {
          p.y -= p.vy; p.x += p.vx; p.ph += p.sp;
          if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
          if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
        }
        const a = 0.18 + 0.5 * (0.5 + 0.5 * Math.sin(p.ph));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue}, ${a.toFixed(3)})`; ctx.fill();
      }
    };
    const loop = () => { if (document.visibilityState === "visible") draw(true); raf = requestAnimationFrame(loop); };
    if (reduce) draw(false); else raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [count, reduce]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
