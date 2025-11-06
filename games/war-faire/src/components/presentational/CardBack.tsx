/**
 * CardBack - Presentational Component
 * Face-down card display with pattern and "next fair" chip
 */

import React from 'react';

interface CardBackProps {
  label?: string;
  className?: string;
}

export function CardBack({ label = "next fair", className = '' }: CardBackProps) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden border border-slate-300 bg-slate-100 ${className}`}
      style={{ aspectRatio: '5 / 7' }}
    >
      {/* Card back pattern */}
      <img
        src="/assets/card_art/card_back.png"
        alt="Card back"
        width="100%"
        height="100%"
        decoding="async"
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />

      {/* "next fair" chip */}
      {label && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <div
            className="px-2 py-1 bg-white/90 rounded-full shadow-sm border border-slate-300"
            style={{ fontSize: '12px', lineHeight: '16px' }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
