import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

interface LandingNavbarProps {
  onOpenPortal: (group?: 0 | 1 | 2) => void;
}

export function LotusBookEmblem({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lotusGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f7e08a" />
          <stop offset="50%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#a98a2d" />
        </linearGradient>
        <linearGradient id="bookGold" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c4a032" />
          <stop offset="100%" stopColor="#eed47b" />
        </linearGradient>
        <filter id="lotusGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Central Radiance / Sun */}
      <circle cx="24" cy="14" r="3.2" fill="url(#lotusGold)" filter="url(#lotusGlow)" opacity="0.95" />
      <path d="M24 7V9.5M24 18.5V21M17 14H19.5M28.5 14H31M19.05 9.05L20.8 10.8M27.2 17.2L28.95 18.95M19.05 18.95L20.8 17.2M27.2 10.8L28.95 9.05" stroke="url(#lotusGold)" strokeWidth="1" strokeLinecap="round" opacity="0.75" />

      {/* Lotus Petals */}
      {/* Center flame/petal */}
      <path d="M24 10C24 10 21 16 21 21C21 23 22.3 24.5 24 24.5C25.7 24.5 27 23 27 21C27 16 24 10 24 10Z" fill="url(#lotusGold)" />
      {/* Left inner petal */}
      <path d="M21 15C21 15 16 19 17 24C17.5 25.5 19.5 26 21.5 25C22 24.8 22 23 22 22C22 19 21 15 21 15Z" fill="url(#lotusGold)" opacity="0.9" />
      {/* Right inner petal */}
      <path d="M27 15C27 15 32 19 31 24C30.5 25.5 28.5 26 26.5 25C26 24.8 26 23 26 22C26 19 27 15 27 15Z" fill="url(#lotusGold)" opacity="0.9" />
      {/* Left outer petal */}
      <path d="M17.5 20C17.5 20 12 23 13.5 28C14.5 30 17 30 19.5 28.5C18.5 26 18 23 17.5 20Z" fill="url(#lotusGold)" opacity="0.8" />
      {/* Right outer petal */}
      <path d="M30.5 20C30.5 20 36 23 34.5 28C33.5 30 31 30 28.5 28.5C29.5 26 30 23 30.5 20Z" fill="url(#lotusGold)" opacity="0.8" />

      {/* Open Book Base */}
      {/* Left Page */}
      <path d="M24 33.5C20.5 31.8 15 31.2 9 32.8C8 33.1 7 34 7 35.2V39C7 40 8 40.8 9 40.6C15 39 20.5 39.6 24 41.5V33.5Z" fill="url(#bookGold)" />
      {/* Right Page */}
      <path d="M24 33.5C27.5 31.8 33 31.2 39 32.8C40 33.1 41 34 41 35.2V39C41 40 40 40.8 39 40.6C33 39 27.5 39.6 24 41.5V33.5Z" fill="url(#bookGold)" />
      {/* Center spine */}
      <path d="M24 33.5V42" stroke="#0b0f14" strokeWidth="1.2" strokeLinecap="round" />
      {/* Page layers accent */}
      <path d="M10 36C15 34.6 20 35.2 23.5 37" stroke="#f7e08a" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
      <path d="M38 36C33 34.6 28 35.2 24.5 37" stroke="#f7e08a" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export default function LandingNavbar({ onOpenPortal }: LandingNavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        scrolled
          ? "glass border-b border-[#222c37] bg-[#0b0f14]/85 py-3.5 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent py-5"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 sm:px-8">
        {/* Brand Lockup */}
        <a href="#home" className="group flex items-center gap-3.5 focus:outline-none" aria-label="VidyaPramaan Home">
          <LotusBookEmblem className="h-11 w-11 shrink-0 drop-shadow-[0_4px_16px_rgba(212,175,55,0.4)] transition-transform duration-300 group-hover:scale-105" />
          <div className="flex flex-col">
            <span className="font-manrope text-[24px] font-extrabold leading-none tracking-[-0.03em]">
              <span className="text-[#f5f5f5]">Vidya</span>
              <span className="bg-gradient-to-r from-[#f7e08a] via-[#d4af37] to-[#c4a032] bg-clip-text text-transparent">
                Pramaan
              </span>
            </span>
            <span className="mt-1 font-inter text-[9px] font-semibold uppercase tracking-[0.18em] text-[#b3b9c2]">
              NATIONAL ACADEMIC INTEGRITY PLATFORM
            </span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
          <a
            href="#home"
            className="group relative font-inter text-[14px] font-medium text-[#d4af37] transition-colors"
          >
            Home
            <span className="gold-rule absolute -bottom-1.5 left-0 w-full" aria-hidden="true" />
          </a>
          <a
            href="#about"
            className="font-inter text-[14px] font-medium text-[#b3b9c2] transition-colors hover:text-[#f5f5f5]"
          >
            About
          </a>
          <a
            href="#how"
            className="font-inter text-[14px] font-medium text-[#b3b9c2] transition-colors hover:text-[#f5f5f5]"
          >
            How it works
          </a>
          <button
            type="button"
            onClick={() => onOpenPortal(0)}
            className="font-inter text-[14px] font-medium text-[#b3b9c2] transition-colors hover:text-[#f7e08a]"
          >
            For Institutions
          </button>
          <button
            type="button"
            onClick={() => onOpenPortal(1)}
            className="font-inter text-[14px] font-medium text-[#b3b9c2] transition-colors hover:text-[#f7e08a]"
          >
            For Regulators
          </button>
          <a
            href="#impact"
            className="font-inter text-[14px] font-medium text-[#b3b9c2] transition-colors hover:text-[#f5f5f5]"
          >
            Resources
          </a>
        </nav>

        {/* Right CTA */}
        <div className="hidden items-center gap-4 lg:flex">
          <button
            type="button"
            onClick={() => onOpenPortal()}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#c4a032] via-[#d4af37] to-[#f7e08a] px-5 py-2.5 font-manrope text-[14px] font-bold text-[#0b0f14] shadow-[0_8px_20px_-6px_rgba(212,175,55,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(212,175,55,0.85)] focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-[#b3b9c2] transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Sheet */}
      {mobileMenuOpen && (
        <div className="glass fixed inset-x-0 top-[72px] z-50 border-b border-[#222c37] bg-[#0b0f14]/95 p-6 backdrop-blur-2xl lg:hidden">
          <div className="flex flex-col space-y-4">
            <a
              href="#home"
              onClick={() => setMobileMenuOpen(false)}
              className="font-inter text-[15px] font-medium text-[#d4af37]"
            >
              Home
            </a>
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="font-inter text-[15px] font-medium text-[#b3b9c2] hover:text-white"
            >
              About
            </a>
            <a
              href="#how"
              onClick={() => setMobileMenuOpen(false)}
              className="font-inter text-[15px] font-medium text-[#b3b9c2] hover:text-white"
            >
              How it works
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenPortal(0);
              }}
              className="text-left font-inter text-[15px] font-medium text-[#b3b9c2] hover:text-[#f7e08a]"
            >
              For Institutions
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenPortal(1);
              }}
              className="text-left font-inter text-[15px] font-medium text-[#b3b9c2] hover:text-[#f7e08a]"
            >
              For Regulators
            </button>
            <a
              href="#impact"
              onClick={() => setMobileMenuOpen(false)}
              className="font-inter text-[15px] font-medium text-[#b3b9c2] hover:text-white"
            >
              Resources
            </a>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenPortal();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c4a032] via-[#d4af37] to-[#f7e08a] py-3 font-manrope text-[14.5px] font-bold text-[#0b0f14] shadow-[0_8px_20px_-6px_rgba(212,175,55,0.6)]"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
