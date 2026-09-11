'use client';

interface PasswordStrengthProps {
  strength: number; // 0-4
  visible: boolean;
}

const strengthColors = ['', '#E74C3C', '#F59E0B', '#F59E0B', '#10B981'];
const strengthLabels = ['', 'Débil', 'Regular', 'Buena', 'Óptima'];

export default function PasswordStrength({ strength, visible }: PasswordStrengthProps) {
  if (!visible || strength === 0) return null;

  return (
    <div className="mt-4 p-4 bg-white/[0.02] border border-white/5 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Fortaleza</span>
        <span className="text-sm font-black transition-colors" style={{ color: strengthColors[strength] }}>
          {strengthLabels[strength]}
        </span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className="h-2 flex-1 rounded-full transition-all duration-500"
            style={{
              backgroundColor: strength >= level ? strengthColors[strength] : 'rgba(255,255,255,0.05)',
              boxShadow: strength >= level ? `0 0 8px ${strengthColors[strength]}40` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}