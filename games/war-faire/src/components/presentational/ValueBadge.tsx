/**
 * ValueBadge - Presentational Component
 * Number-only pill displayed in top-right of card
 */

import React from 'react';

interface ValueBadgeProps {
  value: number;
  className?: string;
}

export function ValueBadge({ value, className = '' }: ValueBadgeProps) {
  return (
    <div
      className={`absolute top-2 right-2 px-2 py-1 bg-white/90 rounded-full text-sm font-bold shadow-sm border border-slate-300 ${className}`}
    >
      {value}
    </div>
  );
}
