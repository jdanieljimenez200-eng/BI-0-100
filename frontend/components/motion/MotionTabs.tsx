'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MOTION_SPRINGS } from '@/lib/motion/tokens';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface MotionTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  layoutId?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function MotionTabs({
  tabs,
  activeTab,
  onChange,
  layoutId,
  size = 'md',
  className = '',
}: MotionTabsProps) {
  const generatedId = useId();
  const resolvedLayoutId = layoutId || `motion-tab-pill-${generatedId}`;
  const shouldReduce = useReducedMotion();

  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative z-10 flex items-center gap-2 rounded-lg font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
            } ${isActive ? 'text-white' : 'text-white/45 hover:text-white/80'}`}
          >
            {/* Sliding Active Pill Background */}
            {isActive && (
              <motion.div
                layoutId={shouldReduce ? undefined : resolvedLayoutId}
                transition={MOTION_SPRINGS.pill}
                className="absolute inset-0 rounded-lg bg-white/10 border border-white/15 shadow-sm -z-10"
              />
            )}

            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>

            {tab.badge !== undefined && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default MotionTabs;
