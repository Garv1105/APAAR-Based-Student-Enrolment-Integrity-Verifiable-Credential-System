import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import IdentityPanel from "./IdentityPanel";

interface IdentitySlideOverProps {
  open: boolean;
  onClose: () => void;
  selectedId: string;
  onSelectId: (id: string) => void;
  password: string;
  onPasswordChange: (pwd: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  error?: string | null;
  focusGroup?: 0 | 1 | 2;
}

export default function IdentitySlideOver({
  open,
  onClose,
  selectedId,
  onSelectId,
  password,
  onPasswordChange,
  onSubmit,
  busy,
  error,
  focusGroup,
}: IdentitySlideOverProps) {
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      // Lock body scroll
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    } else {
      document.body.style.overflow = "";
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Simple focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="slideover-title">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#020408]/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div
          ref={panelRef}
          className="glass rise relative flex w-screen max-w-lg flex-col overflow-y-auto border-l border-white/[0.1] bg-[#0c1219]/95 p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] sm:p-8"
        >
          {/* Header row with Title and Close Button */}
          <div className="flex items-center justify-between pb-3">
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]">VidyaPramaan</p>
              <h2 id="slideover-title" className="font-manrope text-[20px] font-bold tracking-tight text-[#f5f5f5]">
                Platform Authentication
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] p-2 text-[#b3b9c2] transition-colors hover:border-[#d4af37]/40 hover:bg-white/[0.08] hover:text-[#f7e08a] focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              aria-label="Close portal drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-2 flex-1">
            <IdentityPanel
              selectedId={selectedId}
              onSelectId={onSelectId}
              password={password}
              onPasswordChange={onPasswordChange}
              onSubmit={onSubmit}
              busy={busy}
              error={error}
              focusGroup={focusGroup}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
