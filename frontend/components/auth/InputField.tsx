'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

interface InputFieldProps {
  id: string;
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  onFocus?: (e?: React.FocusEvent<HTMLInputElement>) => void;
  error?: string;
  success?: boolean;
  touched?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  icon?: 'email' | 'password';
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

export default function InputField({
  id,
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  success,
  touched,
  disabled,
  placeholder,
  autoComplete,
  icon: _icon,
  showPassword,
  onTogglePassword,
}: InputFieldProps) {
  const [internalShowPassword, setInternalShowPassword] = useState(false);

  const isPasswordVisible = showPassword !== undefined ? showPassword : internalShowPassword;
  const handleTogglePassword = () => {
    if (onTogglePassword) {
      onTogglePassword();
    } else {
      setInternalShowPassword((v) => !v);
    }
  };

  const hasError = Boolean(error && touched);
  const hasSuccess = Boolean(success && touched && value);

  return (
    <div className="form-element group">
      <label
        htmlFor={id}
        className={`block text-xs font-sans font-semibold tracking-normal mb-2 transition-colors duration-150 ${
          hasError
            ? 'text-red-400'
            : hasSuccess
              ? 'text-emerald-400'
              : 'text-slate-300 group-focus-within:text-white'
        }`}
      >
        {label}
      </label>

      <div className="relative rounded-xl transition-all duration-150">
        <input
          id={id}
          name={name}
          type={type === 'password' && isPasswordVisible ? 'text' : type}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          disabled={disabled}
          className={`w-full bg-[#161618] border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 transition-all duration-150 outline-none ${
            hasError
              ? 'border-red-500/60 bg-red-500/[0.04] focus:border-red-400 focus:ring-2 focus:ring-red-500/15'
              : hasSuccess
                ? 'border-emerald-500/50 bg-emerald-500/[0.03] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15'
                : 'border-white/[0.09] hover:border-white/20 focus:border-white/30 focus:bg-[#1A1A1D] focus:ring-2 focus:ring-white/10'
          } ${type === 'password' ? 'pr-24' : (hasSuccess || hasError) ? 'pr-10' : ''}`}
          placeholder={placeholder}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />

        {/* Indicador de estado inline en el input (sin causar CLS ni empujar el formulario) */}
        {type !== 'password' && hasSuccess && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-400 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        )}

        {type !== 'password' && hasError && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-red-400 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4" />
          </div>
        )}

        {type === 'password' && (
          <button
            type="button"
            onClick={handleTogglePassword}
            aria-label={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors duration-150 text-xs font-sans font-medium cursor-pointer"
          >
            {isPasswordVisible ? (
              <EyeOff className="w-3.5 h-3.5 text-slate-300" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-slate-300" />
            )}
            <span>{isPasswordVisible ? 'Ocultar' : 'Mostrar'}</span>
          </button>
        )}
      </div>

      {/* Mensaje de error conciso inline (sin banners aparatosos) */}
      {hasError && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400 font-medium animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}