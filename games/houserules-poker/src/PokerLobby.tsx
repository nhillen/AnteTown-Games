import React, { useState } from 'react';
import clsx from 'clsx';

interface PokerTableInfo {
  tableId: string;
  displayName: string;
  variant: string;
  minBuyIn: number;
  maxBuyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  currentPlayers: number;
  emoji: string;
  description: string;
  difficulty?: string;
  isActive: boolean;
}

interface PokerLobbyProps {
  tables: PokerTableInfo[];
  onSelectTable: (tableId: string, buyInAmount: number) => void;
  playerBankroll: number;
}

export const PokerLobby: React.FC<PokerLobbyProps> = ({ tables, onSelectTable, playerBankroll }) => {
  const [selectedTable, setSelectedTable] = useState<PokerTableInfo | null>(null);
  const [buyInAmount, setBuyInAmount] = useState<number>(0);

  const handleTableClick = (table: PokerTableInfo) => {
    setSelectedTable(table);
    // Default to mid-range buy-in
    const defaultBuyIn = Math.floor((table.minBuyIn + table.maxBuyIn) / 2);
    setBuyInAmount(defaultBuyIn);
  };

  const handleJoinTable = () => {
    if (!selectedTable) return;

    if (buyInAmount < selectedTable.minBuyIn || buyInAmount > selectedTable.maxBuyIn) {
      alert(`Buy-in must be between $${selectedTable.minBuyIn / 100} and $${selectedTable.maxBuyIn / 100}`);
      return;
    }

    if (buyInAmount > playerBankroll) {
      alert(`Insufficient funds. You have $${playerBankroll / 100}, but need $${buyInAmount / 100}`);
      return;
    }

    onSelectTable(selectedTable.tableId, buyInAmount);
  };

  const formatCurrency = (pennies: number) => {
    return `$${(pennies / 100).toFixed(2)}`;
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'Beginner':
        return 'bg-green-500/20 text-green-400';
      case 'Advanced':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-blue-500/20 text-blue-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">♠️ House Rules Poker</h1>
            <p className="text-gray-400">Select a table to join</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Your Bankroll</p>
            <p className="text-3xl font-bold text-green-400">{formatCurrency(playerBankroll)}</p>
          </div>
        </div>
      </div>

      {/* Table Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {tables.map(table => (
            <div
              key={table.tableId}
              onClick={() => handleTableClick(table)}
              className={clsx(
                'bg-gray-800 rounded-lg p-6 cursor-pointer transition-all duration-200 border-2',
                selectedTable?.tableId === table.tableId
                  ? 'border-blue-500 shadow-lg shadow-blue-500/50 scale-105'
                  : 'border-gray-700 hover:border-gray-600 hover:shadow-lg'
              )}
            >
              {/* Table Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{table.emoji}</span>
                  <div>
                    <h3 className="text-xl font-bold">{table.displayName}</h3>
                    <p className="text-sm text-gray-400">{table.variant.toUpperCase()}</p>
                  </div>
                </div>
                {table.difficulty && (
                  <span className={clsx('px-2 py-1 rounded text-xs font-bold', getDifficultyColor(table.difficulty))}>
                    {table.difficulty}
                  </span>
                )}
              </div>

              {/* Table Info */}
              <p className="text-sm text-gray-400 mb-4">{table.description}</p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs text-gray-400">Blinds</p>
                  <p className="font-semibold">{formatCurrency(table.smallBlind)} / {formatCurrency(table.bigBlind)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Buy-in Range</p>
                  <p className="font-semibold">{formatCurrency(table.minBuyIn)} - {formatCurrency(table.maxBuyIn)}</p>
                </div>
              </div>

              {/* Players */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👥</span>
                  <span className="font-semibold">{table.currentPlayers} / {table.maxSeats}</span>
                </div>
                <div className={clsx(
                  'w-3 h-3 rounded-full',
                  table.currentPlayers < table.maxSeats ? 'bg-green-500' : 'bg-red-500'
                )}>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Join Table Modal */}
        {selectedTable && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedTable(null)}>
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 border-2 border-blue-500" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-5xl">{selectedTable.emoji}</span>
                <div>
                  <h2 className="text-2xl font-bold">{selectedTable.displayName}</h2>
                  <p className="text-sm text-gray-400">{selectedTable.description}</p>
                </div>
              </div>

              {/* Table Details */}
              <div className="bg-gray-900 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Variant</p>
                    <p className="font-semibold">{selectedTable.variant.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Players</p>
                    <p className="font-semibold">{selectedTable.currentPlayers} / {selectedTable.maxSeats}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Blinds</p>
                    <p className="font-semibold">{formatCurrency(selectedTable.smallBlind)} / {formatCurrency(selectedTable.bigBlind)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Stakes</p>
                    <p className="font-semibold">{selectedTable.difficulty || 'Medium'}</p>
                  </div>
                </div>
              </div>

              {/* Buy-in Slider */}
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2">
                  Buy-in Amount: {formatCurrency(buyInAmount)}
                </label>
                <input
                  type="range"
                  min={selectedTable.minBuyIn}
                  max={Math.min(selectedTable.maxBuyIn, playerBankroll)}
                  step={100}
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    accentColor: '#3b82f6'
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{formatCurrency(selectedTable.minBuyIn)}</span>
                  <span>{formatCurrency(Math.min(selectedTable.maxBuyIn, playerBankroll))}</span>
                </div>
              </div>

              {/* Bankroll Warning */}
              {buyInAmount > playerBankroll && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-400">⚠️ Insufficient funds</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTable(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinTable}
                  disabled={buyInAmount > playerBankroll || buyInAmount < selectedTable.minBuyIn}
                  className={clsx(
                    'flex-1 font-semibold py-3 px-6 rounded-lg transition-colors',
                    buyInAmount > playerBankroll || buyInAmount < selectedTable.minBuyIn
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  )}
                >
                  Join Table
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
