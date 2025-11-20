import React from 'react';
import { Card as CardType } from '../types';
import { Card } from '../ui/cards/Card';

interface WinnerInfo {
  playerId: string;
  name: string;
  amount: number;
}

interface WinningHand {
  rank: number;
  description?: string;
  usedCards?: CardType[];
}

interface WinnerAnnouncementProps {
  winner: WinnerInfo;
  winningHand?: WinningHand;
  holeCards?: CardType[];
  isVisible: boolean;
}

const handRankToString = (rank: number): string => {
  const ranks: Record<number, string> = {
    0: 'High Card',
    1: 'Pair',
    2: 'Two Pair',
    3: 'Three of a Kind',
    4: 'Straight',
    5: 'Flush',
    6: 'Full House',
    7: 'Four of a Kind',
    8: 'Straight Flush',
    9: 'Royal Flush'
  };
  return ranks[rank] || 'Unknown';
};

export const WinnerAnnouncement: React.FC<WinnerAnnouncementProps> = ({
  winner,
  winningHand,
  holeCards,
  isVisible
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="bg-gradient-to-br from-yellow-900 to-yellow-800 border-4 border-yellow-500 rounded-2xl px-8 py-6 shadow-2xl animate-fade-in">
        <div className="text-center">
          {/* Winner Name */}
          <div className="text-4xl font-bold text-yellow-300 mb-2">
            {winner.name} Wins!
          </div>

          {/* Amount Won */}
          <div className="text-2xl font-semibold text-yellow-100 mb-4">
            {Math.floor(winner.amount / 100)} TC
          </div>

          {/* Hand Information (if showdown) */}
          {winningHand && (
            <div className="mt-4 bg-slate-900/50 rounded-lg p-4">
              <div className="text-lg font-semibold text-yellow-400 mb-2">
                {winningHand.description || handRankToString(winningHand.rank)}
              </div>

              {/* Hole Cards */}
              {holeCards && holeCards.length > 0 && (
                <div className="flex justify-center gap-2 mt-3">
                  {holeCards.map((card, idx) => (
                    <div key={idx} className="transform scale-75">
                      <Card rank={card.rank} suit={card.suit} faceDown={false} size="medium" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Won by Fold Message */}
          {!winningHand && (
            <div className="text-sm text-yellow-300 italic">
              Won by fold
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
