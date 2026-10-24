import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export default function PasswordField({ value, onChange, disabled = false }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <label htmlFor="portal-password" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#b3b9c2]">PASSWORD</label>
        <button type="button" onClick={() => onChange("demo")}
          className="text-[12px] text-[#b3b9c2] transition-colors hover:text-[#f7e08a]" title="Fill the demo password">
          Demo password: <span className="font-mono text-[#d4af37]">demo</span>
        </button>
      </div>
      <div className="relative">
        <input id="portal-password" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          disabled={disabled} autoComplete="current-password"
          className="w-full rounded-2xl border border-white/[0.09] bg-black/35 px-4 py-3 pr-11 font-mono text-[15px] tracking-[0.2em] text-[#f5f5f5] transition-colors placeholder:text-[#64748b] focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/25" />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-3 flex items-center text-[#b3b9c2] transition-colors hover:text-[#f7e08a]">
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
