import React, { useState } from 'react';

export interface PropBetProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPropose: (type: string, config: any) => void;
  myPlayerId: string;
  sidePotBalance: number;
  bigBlind: number;
}

export const PropBetProposalModal: React.FC<PropBetProposalModalProps> = ({
  isOpen,
  onClose,
  onPropose,
  myPlayerId,
  sidePotBalance,
  bigBlind,
}) => {
  // Calculate minimum bet: half the big blind, rounded down
  const minBet = Math.floor(bigBlind / 2);
  const maxBet = bigBlind * 20; // Up to 20x BB

  const [selectedColor, setSelectedColor] = useState<'red' | 'black'>('red');
  const [amountPerCard, setAmountPerCard] = useState(minBet);

  if (!isOpen) return null;

  const maxRisk = amountPerCard * 6;
  const canAfford = sidePotBalance >= maxRisk;

  const handlePropose = () => {
    if (!canAfford) return;

    onPropose('flipz-prop-bet', {
      amountPerCard,
      proposerColor: selectedColor,
      proposerPlayerId: myPlayerId,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-yellow-600" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-yellow-500 mb-4 flex items-center gap-2">
          🎴 Propose Flipz Prop Bet
        </h2>

        <p className="text-gray-300 text-sm mb-6">
          Bet on the red/black cards in the flop. Win based on CK Flipz rules!
        </p>

        {/* Color Selection */}
        <div className="mb-6">
          <label className="block text-gray-400 text-sm mb-2">Choose Your Color</label>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedColor('red')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                selectedColor === 'red'
                  ? 'bg-red-600 text-white border-2 border-red-400 shadow-lg scale-105'
                  : 'bg-gray-800 text-gray-400 border-2 border-gray-700 hover:border-red-500'
              }`}
            >
              <div className="text-2xl mb-1">♥♦</div>
              <div>RED</div>
            </button>
            <button
              onClick={() => setSelectedColor('black')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                selectedColor === 'black'
                  ? 'bg-gray-950 text-white border-2 border-gray-400 shadow-lg scale-105'
                  : 'bg-gray-800 text-gray-400 border-2 border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="text-2xl mb-1">♠♣</div>
              <div>BLACK</div>
            </button>
          </div>
        </div>

        {/* Amount Selection */}
        <div className="mb-6">
          <label className="block text-gray-400 text-sm mb-2">
            Amount Per Card: {Math.floor(amountPerCard / 100)} TC
          </label>
          <input
            type="range"
            min={minBet}
            max={maxBet}
            step={minBet}
            value={amountPerCard}
            onChange={(e) => setAmountPerCard(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{Math.floor(minBet / 100)} TC</span>
            <span>{Math.floor(maxBet / 100)} TC</span>
          </div>
        </div>

        {/* Max Risk Display */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-sm">Max Risk:</span>
            <span className="text-yellow-500 font-bold text-lg">
              {Math.floor(maxRisk / 100)} TC
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Side Pot Balance:</span>
            <span className={`font-semibold ${canAfford ? 'text-green-500' : 'text-red-500'}`}>
              {Math.floor(sidePotBalance / 100)} TC
            </span>
          </div>
        </div>

        {/* Payout Examples */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
          <div className="text-gray-400 text-xs font-semibold mb-2">PAYOUT EXAMPLES:</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-gray-300">
              <span>3 {selectedColor} cards:</span>
              <span className="text-green-400 font-semibold">+{Math.floor(maxRisk / 100)} TC</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>2 {selectedColor}, 1 other:</span>
              <span className="text-green-400 font-semibold">+{Math.floor(amountPerCard / 100)} TC</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>1 {selectedColor}, 2 other:</span>
              <span className="text-red-400 font-semibold">-{Math.floor(amountPerCard / 100)} TC</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>0 {selectedColor} cards:</span>
              <span className="text-red-400 font-semibold">-{Math.floor(maxRisk / 100)} TC</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {!canAfford && (
          <div className="bg-red-900 bg-opacity-30 border border-red-600 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">
              ⚠️ Insufficient side pot funds. Need {Math.floor(maxRisk / 100)} TC, have {Math.floor(sidePotBalance / 100)} TC
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePropose}
            disabled={!canAfford}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
              canAfford
                ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white shadow-lg'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            Propose Bet
          </button>
        </div>
      </div>
    </div>
  );
};
