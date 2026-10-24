import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  demo?: boolean;  // DEMO_MODE: offer to fill the seeded MOCK password
  id?: string;
  label?: string;
  autoComplete?: string;
}

export default function PasswordField({ value, onChange, disabled = false, demo = false, id = "portal-password", label = "Password",
  autoComplete = "current-password" }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a3a9b3]">{label}</label>
        {demo && (
          <button type="button" onClick={() => onChange("demo")}
            className="text-[12px] text-[#a3a9b3] transition-colors hover:text-white" title="Demo environment: fill the shared password">
            Demo password: <span className="font-mono text-[#f7e08a]">demo</span>
          </button>
        )}
      </div>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          disabled={disabled} autoComplete={autoComplete} required
          className="w-full rounded-2xl border border-white/[0.09] bg-black/25 px-4 py-3 pr-11 font-mono text-[15px] tracking-[0.2em] text-white transition-colors placeholder:text-[#5b616b] focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/20" />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-3 flex items-center text-[#8a909a] transition-colors hover:text-white">
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
