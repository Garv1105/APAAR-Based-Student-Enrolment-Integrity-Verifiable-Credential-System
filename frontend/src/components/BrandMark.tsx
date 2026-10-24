/** ShikshaNetra mark: an eye ("netra") whose iris is a ring. Inherits colour from `currentColor`. */
export default function BrandMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 16C6.2 9.6 10.8 6.5 16 6.5S25.8 9.6 29.5 16C25.8 22.4 21.2 25.5 16 25.5S6.2 22.4 2.5 16Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="5.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="1.9" fill="currentColor" />
    </svg>
  );
}
