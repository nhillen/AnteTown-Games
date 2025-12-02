import React from 'react';
import type { RelicDefinition, PlayerRelic } from './types';
import { getRarityColors, getActivationIcon, getRarityLabel } from './types';

export interface RelicCardProps {
  /** Relic definition to display */
  relic: RelicDefinition;
  /** Whether this is a player's owned relic (shows uses/cooldown) */
  playerRelic?: PlayerRelic;
  /** Whether the card is selected (for draft) */
  selected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Whether the card is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Show only rarity (for hidden relics) */
  rarityOnly?: boolean;
}

export const RelicCard: React.FC<RelicCardProps> = ({
  relic,
  playerRelic,
  selected = false,
  onClick,
  disabled = false,
  size = 'medium',
  rarityOnly = false,
}) => {
  const colors = getRarityColors(relic.rarity);
  const activationIcon = getActivationIcon(relic.activationType);

  // Size classes
  const sizeClasses = {
    small: 'w-32 p-2',
    medium: 'w-48 p-3',
    large: 'w-64 p-4',
  };

  const titleSize = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
  };

  const descSize = {
    small: 'text-[10px]',
    medium: 'text-xs',
    large: 'text-sm',
  };

  // Rarity-only display (hidden relic)
  if (rarityOnly) {
    return (
      <div
        className={`
          ${sizeClasses[size]}
          ${colors.bg}
          ${colors.border}
          border-2 rounded-lg
          flex flex-col items-center justify-center
          opacity-75
        `}
      >
        <div className={`text-3xl mb-2`}>❓</div>
        <div className={`${colors.text} font-semibold ${titleSize[size]}`}>
          {getRarityLabel(relic.rarity)} Relic
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        ${sizeClasses[size]}
        ${colors.bg}
        ${colors.border}
        ${selected ? 'ring-2 ring-yellow-400 scale-105' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer hover:scale-102 hover:shadow-lg' : ''}
        border-2 rounded-lg
        transition-all duration-200
        flex flex-col
        ${colors.glow} shadow-md
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className={`font-bold ${colors.text} ${titleSize[size]} leading-tight`}>
            {relic.name}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-[10px] uppercase tracking-wide ${colors.text} opacity-75`}>
              {getRarityLabel(relic.rarity)}
            </span>
            <span className="text-[10px]" title={relic.activationType}>
              {activationIcon}
            </span>
          </div>
        </div>

        {/* Uses/Cooldown indicator */}
        {playerRelic && (
          <div className="flex flex-col items-end gap-0.5">
            {playerRelic.usesRemaining !== undefined && (
              <div className="bg-yellow-600/80 text-yellow-100 text-[10px] px-1.5 py-0.5 rounded font-semibold">
                {playerRelic.usesRemaining}×
              </div>
            )}
            {playerRelic.cooldownRemaining !== undefined && playerRelic.cooldownRemaining > 0 && (
              <div className="bg-red-600/80 text-red-100 text-[10px] px-1.5 py-0.5 rounded font-semibold">
                {playerRelic.cooldownRemaining} CD
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div className={`text-gray-300 ${descSize[size]} flex-1`}>
        {relic.description}
      </div>

      {/* Effect */}
      <div className={`mt-2 pt-2 border-t border-gray-700/50`}>
        <div className={`text-gray-400 ${descSize[size]} italic`}>
          {relic.effect.description}
        </div>
      </div>

      {/* Flavor text */}
      {relic.flavorText && size !== 'small' && (
        <div className={`mt-2 text-gray-500 ${descSize[size]} italic text-center`}>
          "{relic.flavorText}"
        </div>
      )}

      {/* Selected indicator */}
      {selected && (
        <div className="absolute -top-2 -right-2 bg-yellow-500 text-black rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm">
          ✓
        </div>
      )}
    </div>
  );
};

/**
 * Compact relic badge for displaying in a bar
 */
export interface RelicBadgeProps {
  relic: RelicDefinition;
  playerRelic?: PlayerRelic;
  onClick?: () => void;
  showTooltip?: boolean;
}

export const RelicBadge: React.FC<RelicBadgeProps> = ({
  relic,
  playerRelic,
  onClick,
  showTooltip = true,
}) => {
  const colors = getRarityColors(relic.rarity);
  const activationIcon = getActivationIcon(relic.activationType);

  const canActivate = relic.activationType === 'triggered' &&
    (!playerRelic?.cooldownRemaining || playerRelic.cooldownRemaining === 0) &&
    (playerRelic?.usesRemaining === undefined || playerRelic.usesRemaining > 0);

  return (
    <div className="relative group">
      <button
        onClick={canActivate ? onClick : undefined}
        className={`
          ${colors.bg}
          ${colors.border}
          border-2 rounded-lg
          px-2 py-1
          flex items-center gap-1
          ${canActivate ? 'cursor-pointer hover:scale-105 hover:shadow-lg' : 'cursor-default'}
          ${playerRelic?.cooldownRemaining ? 'opacity-60' : ''}
          transition-all duration-200
        `}
        title={showTooltip ? `${relic.name}: ${relic.effect.description}` : undefined}
      >
        <span className="text-sm">{activationIcon}</span>
        <span className={`${colors.text} text-xs font-semibold truncate max-w-[80px]`}>
          {relic.name}
        </span>

        {/* Uses indicator */}
        {playerRelic?.usesRemaining !== undefined && (
          <span className="bg-yellow-600/80 text-yellow-100 text-[10px] px-1 rounded">
            {playerRelic.usesRemaining}
          </span>
        )}

        {/* Cooldown indicator */}
        {playerRelic?.cooldownRemaining !== undefined && playerRelic.cooldownRemaining > 0 && (
          <span className="bg-red-600/80 text-red-100 text-[10px] px-1 rounded">
            {playerRelic.cooldownRemaining}
          </span>
        )}
      </button>

      {/* Tooltip on hover */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
          <div className={`${colors.bg} ${colors.border} border rounded-lg p-2 shadow-xl min-w-[200px]`}>
            <div className={`${colors.text} font-bold text-sm`}>{relic.name}</div>
            <div className="text-gray-300 text-xs mt-1">{relic.description}</div>
            <div className="text-gray-400 text-xs mt-1 italic">{relic.effect.description}</div>
          </div>
        </div>
      )}
    </div>
  );
};
