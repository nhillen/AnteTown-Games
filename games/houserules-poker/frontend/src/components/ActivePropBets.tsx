import React from 'react';
import type { ActiveSideGame, FlipzPropBetConfig, Card } from '../types';

export interface ActivePropBetsProps {
  sideGames: ActiveSideGame[];
  communityCards: Card[];
  getPlayerName: (playerId: string) => string;
  phase: string;
}

const getCardColor = (card: Card): 'red' | 'black' => {
  return (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
};

const FlipzPropBetDisplay: React.FC<{
  sideGame: ActiveSideGame;
  communityCards: Card[];
  getPlayerName: (playerId: string) => string;
  phase: string;
}> = ({ sideGame, communityCards, getPlayerName, phase }) => {
  const config = sideGame.config as FlipzPropBetConfig;
  const proposerName = getPlayerName(config.proposerPlayerId);
  const acceptorName = config.acceptorPlayerId ? getPlayerName(config.acceptorPlayerId) : '...';

  // Count colors in flop
  let redCount = 0;
  let blackCount = 0;
  let resolved = false;
  let winner: string | null = null;

  if (phase === 'Flop' || phase === 'Turn' || phase === 'River' || phase === 'Showdown') {
    const flopCards = communityCards.slice(0, 3);
    redCount = flopCards.filter(c => getCardColor(c) === 'red').length;
    blackCount = 3 - redCount;

    if (flopCards.length === 3) {
      resolved = true;
      if (redCount > blackCount) {
        winner = config.proposerColor === 'red' ? config.proposerPlayerId : config.acceptorPlayerId || null;
      } else if (blackCount > redCount) {
        winner = config.proposerColor === 'black' ? config.proposerPlayerId : config.acceptorPlayerId || null;
      }
    }
  }

  const allSameColor = redCount === 3 || blackCount === 3;
  const cardValue = allSameColor ? config.amountPerCard * 2 : config.amountPerCard;
  const payout = resolved && winner ? Math.abs(redCount - blackCount) * cardValue : 0;

  return (
    <div className={`bg-gradient-to-br from-gray-900 to-gray-800 border-2 rounded-lg p-3 ${
      resolved ? 'border-green-500' : sideGame.status === 'active' ? 'border-yellow-600' : 'border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎴</span>
          <span className="text-yellow-500 font-bold text-sm">Flipz</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded ${
          resolved ? 'bg-green-900 text-green-400' : sideGame.status === 'active' ? 'bg-yellow-900 text-yellow-400' : 'bg-gray-700 text-gray-400'
        }`}>
          {resolved ? 'RESOLVED' : sideGame.status.toUpperCase()}
        </span>
      </div>

      {/* Players */}
      <div className="space-y-1 mb-3">
        <div className={`flex items-center justify-between text-sm p-2 rounded ${
          winner === config.proposerPlayerId ? 'bg-green-900 bg-opacity-40 border border-green-600' : 'bg-gray-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className={config.proposerColor === 'red' ? 'text-red-500' : 'text-gray-300'}>
              {config.proposerColor === 'red' ? '♥♦' : '♠♣'}
            </span>
            <span className="text-white font-semibold">{proposerName}</span>
          </div>
          {winner === config.proposerPlayerId && (
            <span className="text-green-400 font-bold text-xs">
              +${(payout / 100).toFixed(2)}
            </span>
          )}
        </div>
        <div className={`flex items-center justify-between text-sm p-2 rounded ${
          winner === config.acceptorPlayerId ? 'bg-green-900 bg-opacity-40 border border-green-600' : 'bg-gray-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className={config.acceptorColor === 'red' ? 'text-red-500' : 'text-gray-300'}>
              {config.acceptorColor === 'red' ? '♥♦' : '♠♣'}
            </span>
            <span className="text-white font-semibold">{acceptorName}</span>
          </div>
          {winner === config.acceptorPlayerId && (
            <span className="text-green-400 font-bold text-xs">
              +${(payout / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Bet Details */}
      <div className="bg-gray-950 bg-opacity-50 rounded p-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Per Card:</span>
          <span className="text-white">${(config.amountPerCard / 100).toFixed(2)}</span>
        </div>
        {resolved && (
          <>
            <div className="flex justify-between text-xs border-t border-gray-700 pt-1">
              <span className="text-gray-400">Flop:</span>
              <span className="text-white">{redCount}R - {blackCount}B</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Multiplier:</span>
              <span className="text-yellow-500 font-semibold">{allSameColor ? '2x' : '1x'}</span>
            </div>
          </>
        )}
        {!resolved && sideGame.status === 'active' && (
          <div className="text-center text-xs text-yellow-500 font-semibold pt-1 border-t border-gray-700">
            Resolves on flop
          </div>
        )}
      </div>
    </div>
  );
};

export const ActivePropBets: React.FC<ActivePropBetsProps> = ({
  sideGames,
  communityCards,
  getPlayerName,
  phase,
}) => {
  // Filter to only active or recently completed prop bets
  const visibleSideGames = sideGames.filter(sg =>
    sg.status === 'active' || (sg.status === 'completed' && (sg.handsPlayed || 0) < 2)
  );

  if (visibleSideGames.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 z-40 max-w-xs space-y-3">
      {visibleSideGames.map(sideGame => {
        if (sideGame.type === 'flipz-prop-bet') {
          return (
            <FlipzPropBetDisplay
              key={sideGame.id}
              sideGame={sideGame}
              communityCards={communityCards}
              getPlayerName={getPlayerName}
              phase={phase}
            />
          );
        }

        // Generic side game display
        return (
          <div key={sideGame.id} className="bg-gray-900 border-2 border-blue-600 rounded-lg p-3">
            <div className="text-blue-500 font-bold text-sm mb-1">{sideGame.displayName}</div>
            <div className="text-gray-400 text-xs">{sideGame.description}</div>
            <div className="text-xs text-gray-500 mt-2">
              {sideGame.participants.filter(p => p.opted === 'in').length} participants
            </div>
          </div>
        );
      })}
    </div>
  );
};
