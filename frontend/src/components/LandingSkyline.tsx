import { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion";

/**
 * Background art layer matching Landing_Page_1.png and Landing_Page_2.png:
 * - Gold-lit national monument silhouettes (Central Vista Parliament dome, India Gate, ceremonial domes)
 * - Radiant open-book spine and sweeping page wings at the bottom
 * - Dark Earth-limb curve with golden atmospheric rim light at bottom-right
 * - Smoothly masked to blend into #0b0f14 with no visible seams
 * - Subtle parallax on scroll (<=12px), disabled on prefers-reduced-motion
 */
export default function LandingSkyline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      if (!containerRef.current) return;
      const scrollY = window.scrollY;
      const offset = Math.min(12, scrollY * 0.04);
      containerRef.current.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduce]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[480px] w-full overflow-hidden select-none transition-transform duration-100 ease-out sm:h-[580px] lg:h-[660px]"
      style={{
        maskImage:
          "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)",
        WebkitMaskImage:
          "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)",
      }}
    >
      <svg
        viewBox="0 0 1600 600"
        fill="none"
        preserveAspectRatio="xMidYMax slice"
        className="h-full w-full"
      >
        <defs>
          {/* Gold atmospheric glows */}
          <radialGradient id="skyDomeGlow" cx="50%" cy="65%" r="60%">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#c4a032" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0b0f14" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="earthRimGlow" cx="92%" cy="85%" r="45%">
            <stop offset="0%" stopColor="#f7e08a" stopOpacity="0.45" />
            <stop offset="25%" stopColor="#d4af37" stopOpacity="0.22" />
            <stop offset="60%" stopColor="#8a6a14" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0b0f14" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="monumentGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f7e08a" stopOpacity="0.45" />
            <stop offset="30%" stopColor="#d4af37" stopOpacity="0.28" />
            <stop offset="75%" stopColor="#251a08" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#0b0f14" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="gateGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f7e08a" stopOpacity="0.5" />
            <stop offset="40%" stopColor="#c4a032" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0b0f14" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="bookPageGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7e08a" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#d4af37" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0b0f14" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. Backdrop Glow behind monuments */}
        <ellipse cx="800" cy="450" rx="700" ry="240" fill="url(#skyDomeGlow)" />

        {/* 2. Earth Limb Arc at Bottom-Right */}
        <circle cx="1500" cy="850" r="620" fill="#06090e" stroke="url(#earthRimGlow)" strokeWidth="6" opacity="0.9" />
        <path
          d="M 950 600 Q 1300 320 1600 480"
          stroke="url(#earthRimGlow)"
          strokeWidth="3.5"
          fill="none"
          opacity="0.85"
        />

        {/* 3. Central Vista / Parliament Dome Silhouette (Center: ~x=620 to 920) */}
        <g id="parliament-central-vista" opacity="0.85">
          {/* Main Dome */}
          <path
            d="M 720 340 C 720 280, 820 280, 820 340 Z"
            fill="url(#monumentGold)"
          />
          {/* Dome finial / spire */}
          <path d="M 770 268 L 770 288" stroke="#f7e08a" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="770" cy="265" r="2.5" fill="#f7e08a" />

          {/* Drum / colonnade under dome */}
          <rect x="710" y="340" width="120" height="25" fill="url(#monumentGold)" rx="2" />
          {/* Columns */}
          <path
            d="M 718 340 V 365 M 730 340 V 365 M 742 340 V 365 M 754 340 V 365 M 766 340 V 365 M 778 340 V 365 M 790 340 V 365 M 802 340 V 365 M 814 340 V 365"
            stroke="#f7e08a"
            strokeWidth="1.2"
            opacity="0.6"
          />

          {/* Base colonnade tiers */}
          <rect x="580" y="365" width="380" height="24" fill="url(#monumentGold)" />
          {/* Lower pillars */}
          <path
            d="M 590 365 V 389 M 610 365 V 389 M 630 365 V 389 M 650 365 V 389 M 670 365 V 389 M 690 365 V 389 M 710 365 V 389 M 730 365 V 389 M 750 365 V 389 M 770 365 V 389 M 790 365 V 389 M 810 365 V 389 M 830 365 V 389 M 850 365 V 389 M 870 365 V 389 M 890 365 V 389 M 910 365 V 389 M 930 365 V 389 M 950 365 V 389"
            stroke="#f7e08a"
            strokeWidth="1.4"
            opacity="0.45"
          />
          {/* Building wings */}
          <rect x="540" y="385" width="460" height="75" fill="url(#monumentGold)" />
        </g>

        {/* 4. India Gate Monument Arch (Right side: ~x=1320 to 1420) */}
        <g id="india-gate" opacity="0.8">
          {/* Top cornice */}
          <rect x="1330" y="315" width="90" height="10" fill="url(#gateGold)" rx="1.5" />
          <rect x="1335" y="325" width="80" height="14" fill="url(#gateGold)" />
          {/* Main pillars */}
          <rect x="1338" y="339" width="74" height="95" fill="url(#gateGold)" />
          {/* Central Arch cutout */}
          <path
            d="M 1360 434 V 375 C 1360 360, 1390 360, 1390 375 V 434 Z"
            fill="#0b0f14"
          />
          {/* Arch outline light */}
          <path
            d="M 1360 434 V 375 C 1360 360, 1390 360, 1390 375 V 434"
            stroke="#f7e08a"
            strokeWidth="1.5"
            fill="none"
            opacity="0.75"
          />
        </g>

        {/* 5. Classical Domes on the Left & Background Minarets */}
        <g id="left-monuments" opacity="0.65">
          {/* Left North Block / Secretariat Dome */}
          <path d="M 360 360 C 360 315, 430 315, 430 360 Z" fill="url(#monumentGold)" />
          <path d="M 395 305 L 395 318" stroke="#f7e08a" strokeWidth="2" strokeLinecap="round" />
          <rect x="355" y="360" width="80" height="45" fill="url(#monumentGold)" />
          {/* Left minaret / column */}
          <path d="M 270 330 L 275 420 H 265 Z" fill="url(#monumentGold)" />
          <circle cx="270" cy="326" r="3" fill="#f7e08a" />
          {/* Secondary dome */}
          <path d="M 180 375 C 180 345, 230 345, 230 375 Z" fill="url(#monumentGold)" />
          <rect x="175" y="375" width="60" height="30" fill="url(#monumentGold)" />
        </g>

        {/* 6. Sweeping Open Book Pages at the bottom (as in reference image 1) */}
        <g id="open-book-pages" opacity="0.7">
          {/* Left sweeping page */}
          <path
            d="M 800 520 C 580 470, 320 480, 0 540 L 0 600 L 800 600 Z"
            fill="url(#bookPageGold)"
          />
          <path
            d="M 800 518 C 580 468, 320 478, 0 538"
            stroke="#f7e08a"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
          {/* Right sweeping page */}
          <path
            d="M 800 520 C 1020 470, 1280 480, 1600 540 L 1600 600 L 800 600 Z"
            fill="url(#bookPageGold)"
          />
          <path
            d="M 800 518 C 1020 468, 1280 478, 1600 538"
            stroke="#f7e08a"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
          {/* Inner golden crest glow at book spine */}
          <ellipse cx="800" cy="520" rx="90" ry="25" fill="#f7e08a" opacity="0.25" filter="blur(6px)" />
        </g>

        {/* Bottom fade into canvas */}
        <rect x="0" y="560" width="1600" height="40" fill="#0b0f14" />
      </svg>
    </div>
  );
}
