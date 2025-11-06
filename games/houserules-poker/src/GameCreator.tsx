import React, { useState } from 'react';
import clsx from 'clsx';
import { GameVariant } from './rules/index.js';

interface GameCreatorProps {
  onCreateGame: (config: GameCreatorConfig) => void;
  onCancel: () => void;
}

export interface GameCreatorConfig {
  variant: GameVariant;
  displayName: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;

  // Squidz Game specific
  squidValue?: number;
}

const VARIANT_INFO: Record<GameVariant, { name: string; emoji: string; description: string }> = {
  'holdem': {
    name: 'Classic Hold\'em',
    emoji: '♠️',
    description: 'Standard Texas Hold\'em poker'
  },
  'squidz-game': {
    name: 'Squidz Game',
    emoji: '🦑',
    description: 'High stakes bounty poker - collect squidz to win big!'
  },
  'omaha': {
    name: 'Omaha',
    emoji: '🎲',
    description: 'Four hole cards, use exactly 2'
  },
  'seven-card-stud': {
    name: 'Seven Card Stud',
    emoji: '🃏',
    description: 'Classic stud poker'
  }
};

export const GameCreator: React.FC<GameCreatorProps> = ({ onCreateGame, onCancel }) => {
  const [variant, setVariant] = useState<GameVariant>('holdem');
  const [displayName, setDisplayName] = useState('');
  const [smallBlind, setSmallBlind] = useState(50);   // $0.50
  const [bigBlind, setBigBlind] = useState(100);      // $1.00
  const [ante, setAnte] = useState(0);
  const [minBuyIn, setMinBuyIn] = useState(2000);     // $20
  const [maxBuyIn, setMaxBuyIn] = useState(10000);    // $100
  const [maxSeats, setMaxSeats] = useState(9);
  const [squidValue, setSquidValue] = useState(500);  // $5

  const formatCurrency = (pennies: number) => `$${(pennies / 100).toFixed(2)}`;

  const handleCreate = () => {
    const config: GameCreatorConfig = {
      variant,
      displayName: displayName || `${VARIANT_INFO[variant].name} Table`,
      smallBlind,
      bigBlind,
      ante,
      minBuyIn,
      maxBuyIn,
      maxSeats
    };

    if (variant === 'squidz-game') {
      config.squidValue = squidValue;
    }

    onCreateGame(config);
  };

  const availableVariants: GameVariant[] = ['holdem', 'squidz-game'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Create New Game</h1>
          <p className="text-gray-400">Set up your poker table</p>
        </div>

        {/* Variant Selection */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Choose Variant</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableVariants.map(v => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={clsx(
                  'p-4 rounded-lg border-2 transition-all text-left',
                  variant === v
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-gray-700 hover:border-gray-600'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{VARIANT_INFO[v].emoji}</span>
                  <span className="font-bold text-lg">{VARIANT_INFO[v].name}</span>
                </div>
                <p className="text-sm text-gray-400">{VARIANT_INFO[v].description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Table Settings */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Table Settings</h2>

          {/* Table Name */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Table Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`${VARIANT_INFO[variant].name} Table`}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Max Seats */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Max Seats: {maxSeats}</label>
            <input
              type="range"
              min={2}
              max={9}
              value={maxSeats}
              onChange={(e) => setMaxSeats(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Blinds */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Small Blind</label>
              <input
                type="number"
                value={smallBlind / 100}
                onChange={(e) => setSmallBlind(Math.round(parseFloat(e.target.value) * 100))}
                step="0.25"
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Big Blind</label>
              <input
                type="number"
                value={bigBlind / 100}
                onChange={(e) => setBigBlind(Math.round(parseFloat(e.target.value) * 100))}
                step="0.25"
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Ante */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Ante (optional)</label>
            <input
              type="number"
              value={ante / 100}
              onChange={(e) => setAnte(Math.round(parseFloat(e.target.value) * 100))}
              step="0.25"
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Buy-in Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Min Buy-in</label>
              <input
                type="number"
                value={minBuyIn / 100}
                onChange={(e) => setMinBuyIn(Math.round(parseFloat(e.target.value) * 100))}
                step="5"
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Max Buy-in</label>
              <input
                type="number"
                value={maxBuyIn / 100}
                onChange={(e) => setMaxBuyIn(Math.round(parseFloat(e.target.value) * 100))}
                step="5"
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Squidz Game Settings */}
        {variant === 'squidz-game' && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border-2 border-blue-500">
            <h2 className="text-xl font-bold mb-4">🦑 Squidz Game Settings</h2>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Squid Value (1-2 squidz)</label>
              <input
                type="number"
                value={squidValue / 100}
                onChange={(e) => setSquidValue(Math.round(parseFloat(e.target.value) * 100))}
                step="1"
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-2">
                Value scaling: {formatCurrency(squidValue)} at 1-2, {formatCurrency(squidValue * 2)} at 3-4, {formatCurrency(squidValue * 3)} at 5+
              </p>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
              <p className="text-sm text-blue-200">
                <strong>📋 Quick Rules:</strong> Players collect squidz by winning pots. At round end, losers (0 squidz) pay bounty to winners. Hands revealed at 1st, 3rd, and 5th squid!
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
  );
};
