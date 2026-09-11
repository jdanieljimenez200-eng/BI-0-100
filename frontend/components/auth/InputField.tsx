'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

interface InputFieldProps {
  id: string;
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  onFocus?: () => void;
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
  icon,
  showPassword,
  onTogglePassword,
}: InputFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Animación de focus
  useEffect(() => {
    if (!inputRef.current) return;

    const colors = icon === 'email' ? '#E74C3C' : '#10B981';

    gsap.to(inputRef.current, {
      boxShadow: `0 0 30px ${colors}40, inset 0 0 20px ${colors}10`,
      duration: 0.4,
      ease: 'power2.out',
      overwrite: 'auto',
    });

    gsap.to(`.${id}-label`, {
      color: colors,
      duration: 0.3,
      ease: 'power2.out',
      overwrite: 'auto',
    });

    gsap.to(`.${id}-bg`, {
      scale: 1.02,
      opacity: 0.8,
      duration: 0.3,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }, [id, icon]);

  const handleInputBlur = () => {
    if (!inputRef.current) return;

    gsap.to(inputRef.current, {
      boxShadow: '0 0 0px rgba(0, 0, 0, 0)',
      duration: 0.3,
      ease: 'power2.out',
      overwrite: 'auto',
    });

    onBlur?.();
  };

  return (
    <div className="form-element group">
      <label htmlFor={id} className={`${id}-label block text-xs font-bold text-white/60 uppercase tracking-widest mb-3 transition-colors duration-300`}>
        {label}
      </label>
      <div className={`${id}-bg relative rounded-xl transition-all duration-300`}>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={type === 'password' && showPassword ? 'text' : type}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          onBlur={handleInputBlur}
          onFocus={onFocus}
          disabled={disabled}
          className="w-full bg-[#03070C]/50 border rounded-xl px-5 py-3.5 text-sm text-white placeholder-white/20 focus:outline-none focus:bg-gradient-to-br focus:from-[#0F1828] focus:to-[#0A121D] transition-all duration-300 relative z-10 will-change-transform"
          style={{
            borderColor: success && touched ? 'rgba(34, 197, 94, 0.5)' : error && touched ? 'rgba(231, 76, 60, 0.6)' : 'rgba(255, 255, 255, 0.1)',
            backgroundColor: error && touched ? 'rgba(231, 76, 60, 0.05)' : '',
            paddingRight: type === 'password' ? '3.5rem' : undefined,
          }}
          placeholder={placeholder}
          aria-describedby={error ? `${id}-error` : success ? `${id}-success` : undefined}
        />

        {type === 'password' && (
          <button
            type="button"
            onClick={onTogglePassword}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors duration-300 text-[10px] uppercase font-bold tracking-widest hover:scale-110"
          >
            {showPassword ? 'Ocultar' : 'Mostrar'}
          </button>
        )}
      </div>

      {/* Success state */}
      {touched && value && success && (
        <div className="mt-3 flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="w-5 h-5 rounded-full bg-green-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-xs text-green-300 font-semibold" id={`${id}-success`}>
            {icon === 'email' ? 'Correo verificado' : 'Listo'}
          </span>
        </div>
      )}

      {/* Error state */}
      {error && touched && (
        <div className="mt-3 flex items-center gap-2 p-3 bg-[#E74C3C]/10 border border-[#E74C3C]/20 rounded-lg animate-in shake" id={`${id}-error`}>
          <div className="w-5 h-5 rounded-full bg-[#E74C3C]/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-[#E74C3C]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18.101 12.93a1 1 0 00-1.414-1.414L10 17.586l-6.687-6.687a1 1 0 00-1.414 1.414l8 8a1 1 0 001.414 0l8-8z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-xs text-[#E74C3C] font-semibold">{error}</span>
        </div>
      )}
    </div>
  );
}