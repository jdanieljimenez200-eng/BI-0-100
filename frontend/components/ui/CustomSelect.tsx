'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MotionDropdown } from '@/components/motion/MotionDropdown';
import { MOTION_SPRINGS } from '@/lib/motion/tokens';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  options: Option[];
  className?: string;
}

export default function CustomSelect({ value, onChange, options, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white text-left flex items-center justify-between gap-2 hover:border-white/20 focus:outline-none focus:border-white/30 transition-colors"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={MOTION_SPRINGS.snappy}
          className="w-3.5 h-3.5 text-white/40 flex-shrink-0"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </button>

      <MotionDropdown isOpen={open} className="w-full">
        <div
          role="listbox"
          className="w-full bg-[#0F1C2E]/95 backdrop-blur-xl border border-white/12 rounded-xl shadow-2xl overflow-hidden py-1 max-h-60 overflow-y-auto"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between ${
                  isSelected
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </MotionDropdown>
    </div>
  );
}
