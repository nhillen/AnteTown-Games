/**
 * LeaderChip - Presentational Component
 * Shows leader avatar with points using CSS classes
 */

import React from 'react';

interface LeaderChipProps {
  avatarText: string;  // First letter of player name
  points: number;
}

export function LeaderChip({ avatarText, points }: LeaderChipProps) {
  return (
    <div className="leader-chip">
      <div className="avatar">{avatarText}</div>
      <div className="points">{points}</div>
    </div>
  );
}
