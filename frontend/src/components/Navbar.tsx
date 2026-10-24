import { useState } from "react";
import { Moon, Sun } from "lucide-react";

interface NavbarProps {
  onNavClick?: (nav: string) => void;
}

export default function Navbar({ onNavClick }: NavbarProps) {
  const [activeTab, setActiveTab] = useState("Home");
  const [isDark, setIsDark] = useState(true);

  const navItems = ["Home", "How it works", "Use cases", "About"];

  const handleNav = (item: string) => {
    setActiveTab(item);
    if (onNavClick) onNavClick(item);
  };

  return (
    <header className="relative z-40 w-full border-b border-slate-800/60 bg-[#050816]/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: AP Logo & Branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563ff] via-[#4f46e5] to-[#7c5cff] text-white shadow-[0_0_15px_rgba(37,99,255,0.4)] ring-1 ring-white/20">
            <span className="font-extrabold text-sm tracking-tight">AP</span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold text-white tracking-tight sm:text-lg">
              APAAR Seat Integrity
            </div>
            <div className="text-[11px] font-medium text-[#9fb0d0]">
              Student data &amp; verification · SIH26263
            </div>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            const isActive = activeTab === item;
            return (
              <button
                key={item}
                onClick={() => handleNav(item)}
                className={`group relative text-sm font-medium transition-colors cursor-pointer py-1 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{item}</span>
                {isActive && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-[#2563ff] shadow-[0_0_8px_#2563ff]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Demo Environment Pill & Theme Toggle */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300 shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="tracking-wide">Demo Environment</span>
          </div>

          <button
            onClick={() => setIsDark(!isDark)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/70 bg-[#0d152a]/80 text-slate-300 shadow-sm transition-all hover:border-blue-500/50 hover:text-white hover:shadow-[0_0_12px_rgba(37,99,255,0.3)] cursor-pointer"
            title={isDark ? "Switch to light theme (mock)" : "Switch to dark theme"}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
