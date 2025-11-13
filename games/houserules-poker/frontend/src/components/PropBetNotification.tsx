import React from 'react';
import type { ActiveSideGame, FlipzPropBetConfig } from '../types';

export interface PropBetNotificationProps {
  sideGame: ActiveSideGame;
  proposerName: string;
  myPlayerId: string;
  onRespond: (sideGameId: string, response: 'in' | 'out') => void;
}

export const PropBetNotification: React.FC<PropBetNotificationProps> = ({
  sideGame,
  proposerName,
  myPlayerId,
  onRespond,
}) => {
  // Only show for proposed bets
  if (sideGame.status !== 'proposed') return null;

  // Don't show to proposer
  if (sideGame.proposedBy === myPlayerId) return null;

  // Don't show if already responded
  const alreadyResponded = sideGame.participants.some(p => p.playerId === myPlayerId);
  if (alreadyResponded) return null;

  // Flipz specific rendering
  if (sideGame.type === 'flipz-prop-bet') {
    const config = sideGame.config as FlipzPropBetConfig;
    const oppositeColor = config.proposerColor === 'red' ? 'black' : 'red';
    const maxRisk = config.amountPerCard * 6;

    return (
      <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-yellow-600 rounded-lg shadow-2xl p-4 max-w-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎴</span>
              <div>
                <div className="text-yellow-500 font-bold text-sm">Flipz Prop Bet</div>
                <div className="text-gray-400 text-xs">from {proposerName}</div>
              </div>
            </div>
          </div>

          {/* Bet Details */}
          <div className="bg-gray-950 bg-opacity-50 rounded-lg p-3 mb-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Their Color:</span>
              <span className={`font-bold ${config.proposerColor === 'red' ? 'text-red-500' : 'text-gray-300'}`}>
                {config.proposerColor === 'red' ? '♥♦ RED' : '♠♣ BLACK'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Your Color:</span>
              <span className={`font-bold ${oppositeColor === 'red' ? 'text-red-500' : 'text-gray-300'}`}>
                {oppositeColor === 'red' ? '♥♦ RED' : '♠♣ BLACK'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Per Card:</span>
              <span className="text-white font-semibold">{Math.floor(config.amountPerCard / 100)} TC</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-700 pt-2">
              <span className="text-yellow-500 text-sm font-semibold">Max Risk:</span>
              <span className="text-yellow-500 font-bold text-lg">{Math.floor(maxRisk / 100)} TC</span>
            </div>
          </div>

          {/* Quick Payout Info */}
          <div className="bg-gray-800 bg-opacity-60 rounded p-2 mb-3">
            <div className="text-gray-400 text-xs font-semibold mb-1">PAYOUT:</div>
            <div className="text-xs text-gray-300">
              3 cards your color: <span className="text-green-400 font-semibold">+{Math.floor(maxRisk / 100)} TC</span>
            </div>
            <div className="text-xs text-gray-300">
              2-1 split: <span className="text-green-400 font-semibold">±{Math.floor(config.amountPerCard / 100)} TC</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => onRespond(sideGame.id, 'out')}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded font-semibold text-sm transition-colors"
            >
              Decline
            </button>
            <button
              onClick={() => onRespond(sideGame.id, 'in')}
              className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white py-2 px-3 rounded font-semibold text-sm transition-all shadow-lg"
            >
              Accept Bet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Generic side game rendering
  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className="bg-gray-900 border-2 border-blue-600 rounded-lg shadow-2xl p-4 max-w-sm">
        <div className="text-blue-500 font-bold mb-2">{sideGame.displayName}</div>
        <div className="text-gray-300 text-sm mb-3">from {proposerName}</div>
        <div className="flex gap-2">
          <button
            onClick={() => onRespond(sideGame.id, 'out')}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded font-semibold text-sm"
          >
            Decline
          </button>
          <button
            onClick={() => onRespond(sideGame.id, 'in')}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded font-semibold text-sm"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
