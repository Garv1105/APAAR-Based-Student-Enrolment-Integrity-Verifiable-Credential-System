import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion";

/**
 * Full-screen canvas of faint particles. Each wanders freely on its own slowly turning heading, and particles
 * sit at three depths so they shift with page scroll (parallax) instead of looking pinned to the screen.
 * Draws one still frame when the user prefers reduced motion; pauses while the tab is hidden.
 */
export default function Starfield({ count = 36 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const ps = Array.from({ length: Math.min(count, 40) }, () => {
      const z = [0.25, 0.5, 0.9][Math.floor(Math.random() * 3)]; // depth: far, mid, near
      return {
        x: rnd(0, w), y: rnd(0, h), z, r: 0.35 + z * rnd(0.5, 1.1),
        dir: rnd(0, Math.PI * 2), turn: rnd(-0.25, 0.25), speed: rnd(3, 9) * z, // slow px per second
        ph: rnd(0, Math.PI * 2), tw: rnd(0.4, 1.1),
        tint: Math.random() < 0.8 ? "212, 175, 55" : "247, 224, 138", // gold and champagne dust
      };
    });
    const draw = (dt: number) => {
      const scroll = window.scrollY;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        if (dt) {
          p.turn += rnd(-0.5, 0.5) * dt;
          p.turn = Math.max(-0.4, Math.min(0.4, p.turn));
          p.dir += p.turn * dt;
          p.x += Math.cos(p.dir) * p.speed * dt;
          p.y += Math.sin(p.dir) * p.speed * dt;
          p.ph += p.tw * dt;
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
        }
        const y = (((p.y - scroll * p.z * 0.6) % (h + 20)) + h + 20) % (h + 20) - 10; // parallax with scroll
        const a = (0.04 + 0.18 * p.z) * (0.55 + 0.45 * Math.sin(p.ph));
        ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.tint}, ${a.toFixed(3)})`; ctx.fill();
      }
    };
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (document.visibilityState === "visible") draw(dt);
      raf = requestAnimationFrame(loop);
    };
    const onScroll = () => { if (reduce) draw(0); };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("scroll", onScroll); };
  }, [count, reduce]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
