import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Lock } from "lucide-react";

interface PasswordFieldProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export default function PasswordField({
  value,
  onChange,
  disabled = false,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyDemo = () => {
    navigator.clipboard.writeText("demo");
    onChange("demo");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      {/* Label and Demo Password Pill */}
      <div className="flex items-center justify-between text-xs font-semibold">
        <label
          htmlFor="portal-password"
          className="text-slate-300 uppercase tracking-wider text-[11px]"
        >
          Password
        </label>

        {/* Demo Password Pill with Copy Button */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#9fb0d0]">
          <span>Demo password:</span>
          <button
            type="button"
            onClick={handleCopyDemo}
            className="group flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#0d1428] px-2 py-0.5 font-mono text-[11px] text-white transition-all hover:border-blue-500/50 hover:bg-[#131d38] cursor-pointer"
            title="Click to copy and fill demo password"
          >
            <span className="font-bold">demo</span>
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-slate-400 group-hover:text-blue-300" />
            )}
          </button>
        </div>
      </div>

      {/* Input Field with Left Lock & Right Eye Toggle */}
      <div className="relative flex items-center">
        {/* Left Lock Icon */}
        <div className="pointer-events-none absolute left-3.5 flex items-center text-slate-500">
          <Lock className="h-4 w-4" />
        </div>

        {/* Text Input */}
        <input
          id="portal-password"
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="••••••••"
          autoComplete="current-password"
          className="w-full rounded-xl border border-slate-700/80 bg-[#080e1e]/90 py-2.5 pl-10 pr-10 font-mono text-sm tracking-widest text-white shadow-inner placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
        />

        {/* Right Show/Hide Eye Toggle */}
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3.5 flex items-center text-slate-500 hover:text-slate-300 focus:outline-none cursor-pointer transition-colors"
          title={showPassword ? "Hide password" : "Show password"}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
