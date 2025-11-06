/**
 * MiniCardChip - Presentational Component
 * Compact card representation for board rows using CSS classes
 */

import React from 'react';
import { getCardArt } from './cardArt.js';

interface MiniCardChipProps {
  categoryId: string;
  value: number;
}

export function MiniCardChip({ categoryId, value }: MiniCardChipProps) {
  return (
    <div className="mini-chip">
      <img src={getCardArt(categoryId)} alt="" />
      <span className="val">{value}</span>
    </div>
  );
}
