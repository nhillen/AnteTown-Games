import React, { useState } from 'react';
import type { PlayerRelic, RoguelikeState } from './types';
import { RelicBadge, RelicCard } from './RelicCard';
import { getRarityColors } from './types';

export interface PlayerRelicBarProps {
  /** Player's relics */
  relics: PlayerRelic[];
  /** Roguelike session state */
  roguelikeState?: RoguelikeState;
  /** Called when player activates a triggered relic */
  onActivateRelic?: (relicId: string) => void;
  /** Position of the bar */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Whether to show expanded details */
  expandable?: boolean;
}

export const PlayerRelicBar: React.FC<PlayerRelicBarProps> = ({
  relics,
  roguelikeState,
  onActivateRelic,
  position = 'bottom',
  expandable = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (relics.length === 0) {
    return null;
  }

  // Position classes
  const positionClasses = {
    top: 'fixed top-4 left-1/2 -translate-x-1/2',
    bottom: 'fixed bottom-24 left-1/2 -translate-x-1/2',
    left: 'fixed left-4 top-1/2 -translate-y-1/2 flex-col',
    right: 'fixed right-4 top-1/2 -translate-y-1/2 flex-col',
  };

  return (
    <div className={`${positionClasses[position]} z-40`}>
      {/* Rogue Break Info */}
      {roguelikeState && (
        <div className="mb-2 flex items-center justify-center gap-4 text-xs">
          <div className="bg-purple-900/80 border border-purple-600 rounded-lg px-3 py-1 flex items-center gap-2">
            <span className="text-purple-400">Orbit</span>
            <span className="text-purple-200 font-bold">{roguelikeState.currentOrbit}</span>
          </div>
          <div className="bg-gray-800/80 border border-gray-600 rounded-lg px-3 py-1 flex items-center gap-2">
            <span className="text-gray-400">Breaks</span>
            <span className="text-gray-200 font-bold">{roguelikeState.rogueBreaksCompleted}/3</span>
          </div>
        </div>
      )}

      {/* Compact Bar */}
      <div
        className={`
          bg-gray-900/95 backdrop-blur-sm
          border-2 border-purple-600/50
          rounded-xl
          px-3 py-2
          flex items-center gap-2
          shadow-lg shadow-purple-500/10
          ${expandable ? 'cursor-pointer' : ''}
        `}
        onClick={expandable ? () => setIsExpanded(!isExpanded) : undefined}
      >
        {/* Relic icon */}
        <div className="text-purple-400 text-lg">🎴</div>

        {/* Relic badges */}
        <div className="flex items-center gap-1">
          {relics.map((playerRelic) => (
            <RelicBadge
              key={playerRelic.definition.id}
              relic={playerRelic.definition}
              playerRelic={playerRelic}
              onClick={
                playerRelic.definition.activationType === 'triggered' && onActivateRelic
                  ? () => onActivateRelic(playerRelic.definition.id)
                  : undefined
              }
              showTooltip={!isExpanded}
            />
          ))}
        </div>

        {/* Expand indicator */}
        {expandable && (
          <div className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </div>
        )}
      </div>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="mt-2 bg-gray-900/95 backdrop-blur-sm border-2 border-purple-600/50 rounded-xl p-4 shadow-xl">
          <div className="flex flex-wrap gap-4 justify-center">
            {relics.map((playerRelic) => (
              <RelicCard
                key={playerRelic.definition.id}
                relic={playerRelic.definition}
                playerRelic={playerRelic}
                onClick={
                  playerRelic.definition.activationType === 'triggered' && onActivateRelic
                    ? () => onActivateRelic(playerRelic.definition.id)
                    : undefined
                }
                size="medium"
              />
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Opponent relic indicator (shows hidden/revealed relics)
 */
export interface OpponentRelicIndicatorProps {
  /** Opponent's relics (may be hidden) */
  relics: PlayerRelic[];
  /** Position relative to seat */
  position?: 'top' | 'bottom';
}

export const OpponentRelicIndicator: React.FC<OpponentRelicIndicatorProps> = ({
  relics,
  position = 'top',
}) => {
  if (relics.length === 0) return null;

  return (
    <div className={`
      flex items-center gap-1
      ${position === 'top' ? 'mb-1' : 'mt-1'}
    `}>
      {relics.map((playerRelic, idx) => {
        const colors = getRarityColors(playerRelic.definition.rarity);

        if (!playerRelic.isRevealed) {
          // Hidden relic - show rarity glow only
          return (
            <div
              key={idx}
              className={`
                w-5 h-5 rounded
                ${colors.bg}
                ${colors.border}
                border
                flex items-center justify-center
                opacity-60
              `}
              title={`Hidden ${playerRelic.definition.rarity} relic`}
            >
              <span className="text-[10px]">?</span>
            </div>
          );
        }

        // Revealed relic
        return (
          <div
            key={idx}
            className={`
              w-5 h-5 rounded
              ${colors.bg}
              ${colors.border}
              border
              flex items-center justify-center
              group relative
            `}
            title={`${playerRelic.definition.name}: ${playerRelic.definition.effect.description}`}
          >
            <span className="text-[10px]">
              {playerRelic.definition.name.charAt(0)}
            </span>

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              <div className={`${colors.bg} ${colors.border} border rounded px-2 py-1 whitespace-nowrap`}>
                <div className={`${colors.text} text-xs font-semibold`}>{playerRelic.definition.name}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
