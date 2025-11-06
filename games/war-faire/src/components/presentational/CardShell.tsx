/**
 * CardShell - Presentational Component
 * Displays card with art in constrained layout using CSS classes
 */

import React from 'react';
import { getCardArt } from './cardArt.js';

interface CardShellProps {
  categoryId: string;
  value: number;
  name: string;
  group?: string;
  isGroupCard?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function CardShell({
  categoryId,
  value,
  name,
  group,
  isGroupCard = false,
  selected = false,
  onClick
}: CardShellProps) {
  return (
    <div className={`card ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="top">
        <img className="cat-icon" src={getCardArt(categoryId)} alt="" />
        <div />
        <div className="value-badge">{value}{isGroupCard ? '*' : ''}</div>
      </div>
      <div className="art">
        <img src={getCardArt(categoryId)} alt="" decoding="async" loading="lazy" />
      </div>
      <div className="namebar">
        <div className="name">{name}{isGroupCard ? ' *' : ''}</div>
        {group ? <div className="group">{group}</div> : null}
      </div>
    </div>
  );
}
