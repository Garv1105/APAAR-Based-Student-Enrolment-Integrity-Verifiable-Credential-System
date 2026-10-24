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
        <label htmlFor="portal-password" className="text-[12px] font-semibold tracking-[0.12em] text-[#8b9bbd]">PASSWORD</label>
        <button type="button" onClick={() => onChange("demo")}
          className="text-[12.5px] text-[#8b9bbd] transition-colors hover:text-white" title="Fill the demo password">
          Demo password: <span className="font-mono text-[#c9d6ff]">demo</span>
        </button>
      </div>
      <div className="relative">
        <input id="portal-password" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          disabled={disabled} autoComplete="current-password"
          className="w-full rounded-2xl border border-white/[0.09] bg-black/25 px-4 py-3 pr-11 font-mono text-[15px] tracking-[0.2em] text-white transition-colors placeholder:text-[#4a5677] focus:border-[#7aa2ff]/60 focus:outline-none focus:ring-2 focus:ring-[#7aa2ff]/20" />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-3 flex items-center text-[#6f7fa3] transition-colors hover:text-white">
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
