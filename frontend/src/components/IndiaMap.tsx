interface IndiaMapProps {
  className?: string;
}

export default function IndiaMap({ className = "" }: IndiaMapProps) {
  // Key mesh vertices representing the geographic constellation of India
  const nodes = [
    // North (Jammu, Kashmir, Ladakh, Himachal, Uttarakhand)
    { id: "n1", x: 270, y: 45, isHub: false },
    { id: "n2", x: 230, y: 80, isHub: true, label: "Srinagar" },
    { id: "n3", x: 290, y: 75, isHub: false },
    { id: "n4", x: 255, y: 115, isHub: false },
    { id: "n5", x: 295, y: 125, isHub: false },

    // Northern Plains & Capital Region
    { id: "n6", x: 215, y: 140, isHub: false },
    { id: "delhi", x: 248, y: 165, isHub: true, label: "New Delhi" },
    { id: "n8", x: 305, y: 175, isHub: false },
    { id: "n9", x: 360, y: 200, isHub: false },

    // Western Bulge (Rajasthan, Gujarat)
    { id: "w1", x: 175, y: 175, isHub: false },
    { id: "w2", x: 150, y: 225, isHub: false },
    { id: "w3", x: 120, y: 260, isHub: false },
    { id: "w4", x: 105, y: 295, isHub: false },
    { id: "ahmedabad", x: 165, y: 285, isHub: true, label: "Ahmedabad" },
    { id: "w6", x: 175, y: 320, isHub: false },

    // Central India
    { id: "c1", x: 240, y: 225, isHub: false },
    { id: "c2", x: 280, y: 250, isHub: false },
    { id: "c3", x: 330, y: 265, isHub: false },
    { id: "c4", x: 350, y: 315, isHub: false },

    // Eastern India
    { id: "e1", x: 390, y: 225, isHub: false },
    { id: "kolkata", x: 420, y: 275, isHub: true, label: "Kolkata" },
    { id: "e3", x: 385, y: 345, isHub: false },

    // North-East Corridor
    { id: "ne1", x: 435, y: 195, isHub: false },
    { id: "guwahati", x: 480, y: 195, isHub: true, label: "Guwahati" },
    { id: "ne3", x: 535, y: 175, isHub: false },
    { id: "ne4", x: 525, y: 230, isHub: false },
    { id: "ne5", x: 475, y: 235, isHub: false },

    // West Coast & Deccan
    { id: "mumbai", x: 170, y: 365, isHub: true, label: "Mumbai" },
    { id: "d2", x: 205, y: 385, isHub: false },
    { id: "d3", x: 270, y: 365, isHub: false },
    { id: "hyderabad", x: 275, y: 415, isHub: true, label: "Hyderabad" },
    { id: "d5", x: 185, y: 440, isHub: false },

    // Southern Peninsula
    { id: "bengaluru", x: 225, y: 485, isHub: true, label: "Bengaluru" },
    { id: "s2", x: 305, y: 470, isHub: false },
    { id: "chennai", x: 295, y: 520, isHub: true, label: "Chennai" },
    { id: "s4", x: 200, y: 545, isHub: false },
    { id: "s5", x: 235, y: 565, isHub: false },
    { id: "s6", x: 210, y: 610, isHub: false },
    { id: "s7", x: 250, y: 620, isHub: false },
    { id: "s8", x: 230, y: 655, isHub: true, label: "Kanyakumari" },
  ];

  // Triangles defining the Delaunay-like polygonal network
  const triangles = [
    // North
    [270, 45, 230, 80, 290, 75],
    [230, 80, 255, 115, 290, 75],
    [255, 115, 295, 125, 290, 75],
    [230, 80, 215, 140, 255, 115],
    [215, 140, 248, 165, 255, 115],
    [255, 115, 248, 165, 295, 125],
    [295, 125, 248, 165, 305, 175],

    // Rajasthan/Gujarat
    [215, 140, 175, 175, 248, 165],
    [175, 175, 150, 225, 248, 165],
    [150, 225, 240, 225, 248, 165],
    [150, 225, 120, 260, 165, 285],
    [120, 260, 105, 295, 165, 285],
    [150, 225, 165, 285, 240, 225],
    [165, 285, 175, 320, 240, 225],

    // Central MP
    [248, 165, 240, 225, 305, 175],
    [305, 175, 240, 225, 280, 250],
    [305, 175, 280, 250, 360, 200],
    [360, 200, 280, 250, 330, 265],
    [240, 225, 175, 320, 280, 250],
    [280, 250, 175, 320, 270, 365],
    [280, 250, 330, 265, 350, 315],
    [280, 250, 350, 315, 270, 365],

    // East / Bengal
    [360, 200, 330, 265, 390, 225],
    [390, 225, 330, 265, 420, 275],
    [330, 265, 350, 315, 420, 275],
    [350, 315, 385, 345, 420, 275],
    [350, 315, 270, 365, 385, 345],

    // North East
    [390, 225, 435, 195, 420, 275],
    [435, 195, 480, 195, 475, 235],
    [435, 195, 475, 235, 420, 275],
    [480, 195, 535, 175, 525, 230],
    [480, 195, 525, 230, 475, 235],

    // West Coast & Maharashtra
    [175, 320, 170, 365, 270, 365],
    [170, 365, 205, 385, 270, 365],
    [205, 385, 275, 415, 270, 365],
    [270, 365, 275, 415, 385, 345],
    [170, 365, 185, 440, 205, 385],
    [205, 385, 185, 440, 275, 415],

    // South Peninsula
    [275, 415, 305, 470, 385, 345],
    [185, 440, 225, 485, 275, 415],
    [275, 415, 225, 485, 305, 470],
    [225, 485, 295, 520, 305, 470],
    [185, 440, 200, 545, 225, 485],
    [225, 485, 200, 545, 235, 565],
    [225, 485, 235, 565, 295, 520],
    [200, 545, 210, 610, 235, 565],
    [235, 565, 210, 610, 250, 620],
    [235, 565, 250, 620, 295, 520],
    [210, 610, 230, 655, 250, 620],
  ];

  // Ambient constellation stars
  const ambientStars = [
    { x: 190, y: 60, s: 1.5, d: "animate-twinkle" },
    { x: 330, y: 70, s: 2, d: "animate-twinkle-fast" },
    { x: 130, y: 160, s: 1.5, d: "animate-twinkle-slow" },
    { x: 380, y: 130, s: 2, d: "animate-twinkle" },
    { x: 470, y: 120, s: 1.5, d: "animate-twinkle-fast" },
    { x: 90, y: 220, s: 2, d: "animate-twinkle-slow" },
    { x: 75, y: 340, s: 1.5, d: "animate-twinkle" },
    { x: 440, y: 360, s: 2, d: "animate-twinkle-fast" },
    { x: 370, y: 440, s: 1.5, d: "animate-twinkle-slow" },
    { x: 340, y: 560, s: 2, d: "animate-twinkle" },
    { x: 150, y: 500, s: 1.5, d: "animate-twinkle-fast" },
    { x: 170, y: 630, s: 2, d: "animate-twinkle-slow" },
    { x: 290, y: 660, s: 1.5, d: "animate-twinkle" },
  ];

  return (
    <div
      className={`pointer-events-none relative flex items-center justify-center select-none ${className}`}
      aria-hidden="true"
    >
      {/* Layered electric blue and violet radial glow */}
      <div className="absolute h-96 w-96 rounded-full bg-blue-600/20 blur-[100px]" />
      <div className="absolute h-72 w-72 translate-x-12 translate-y-16 rounded-full bg-indigo-600/20 blur-[80px]" />

      <svg
        className="relative h-full w-full max-w-[560px] overflow-visible"
        viewBox="0 0 600 700"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Radial Mesh Gradient */}
          <radialGradient
            id="meshGlow"
            cx="45%"
            cy="45%"
            r="55%"
            fx="45%"
            fy="45%"
          >
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="60%" stopColor="#2563ff" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#050816" stopOpacity="0" />
          </radialGradient>

          {/* Node Glow Filter */}
          <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Hub Node Intense Glow */}
          <filter id="hubGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Constellation Stars */}
        {ambientStars.map((s, idx) => (
          <circle
            key={`star-${idx}`}
            cx={s.x}
            cy={s.y}
            r={s.s}
            fill="#38bdf8"
            className={s.d}
            opacity={0.6}
          />
        ))}

        {/* Polygonal Triangulation Facets */}
        <g stroke="rgba(56, 189, 248, 0.28)" strokeWidth="0.8">
          {triangles.map((t, idx) => (
            <polygon
              key={`tri-${idx}`}
              points={`${t[0]},${t[1]} ${t[2]},${t[3]} ${t[4]},${t[5]}`}
              fill="url(#meshGlow)"
              className="transition-opacity hover:opacity-80"
            />
          ))}
        </g>

        {/* Mesh Nodes (Intersections) */}
        {nodes.map((node) => {
          if (node.isHub) {
            return (
              <g key={node.id} className="cursor-pointer">
                {/* Ping pulse ring */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="10"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  className="animate-ping"
                  opacity="0.75"
                />
                {/* Outer halo */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="7"
                  fill="#2563ff"
                  opacity="0.35"
                  filter="url(#hubGlow)"
                />
                {/* Bright core */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="4"
                  fill="#ffffff"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  filter="url(#cyanGlow)"
                />
              </g>
            );
          }

          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r="2.5"
              fill="#38bdf8"
              filter="url(#cyanGlow)"
              className="animate-twinkle"
              opacity="0.85"
            />
          );
        })}
      </svg>
    </div>
  );
}
