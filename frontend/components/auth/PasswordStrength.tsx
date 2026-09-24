'use client';

interface PasswordStrengthProps {
  strength: number; // 0-4
  visible: boolean;
}

const strengthColors = ['', '#EF4444', '#F59E0B', '#10B981', '#10B981'];
const strengthLabels = ['', 'Débil', 'Media', 'Buena', 'Óptima'];

export default function PasswordStrength({ strength, visible }: PasswordStrengthProps) {
  if (!visible || strength === 0) return null;

  const activeColor = strengthColors[strength] || '#EF4444';
  const activeLabel = strengthLabels[strength] || 'Débil';

  return (
    <div className="pt-2 pb-1 animate-in fade-in duration-200">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-sans font-semibold text-slate-400 uppercase tracking-wider">
          Seguridad
        </span>
        <span
          className="text-xs font-sans font-semibold transition-colors duration-200"
          style={{ color: activeColor }}
        >
          {activeLabel}
        </span>
      </div>
      <div className="flex gap-1.5 h-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className="flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: strength >= level ? activeColor : 'rgba(255, 255, 255, 0.08)',
              boxShadow: strength >= level ? `0 0 8px ${activeColor}33` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}