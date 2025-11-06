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

interface PokerLobbyListProps {
  tables: PokerTableInfo[];
  onSelectTable: (tableId: string) => void;
  onCreateGame: () => void;
  playerBankroll: number;
}

export const PokerLobbyList: React.FC<PokerLobbyListProps> = ({
  tables,
  onSelectTable,
  onCreateGame,
  playerBankroll
}) => {
  const formatCurrency = (pennies: number) => {
    return `$${(pennies / 100).toFixed(2)}`;
  };

  const getVariantBadgeColor = (variant: string) => {
    switch (variant.toLowerCase()) {
      case 'holdem':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'squidz-game':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">♠️ House Rules Poker</h1>
            <p className="text-gray-400">Join a table or create your own</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Your Bankroll</p>
            <p className="text-3xl font-bold text-green-400">{formatCurrency(playerBankroll)}</p>
          </div>
        </div>
      </div>

      {/* Create Game Button */}
      <div className="max-w-7xl mx-auto mb-6">
        <button
          onClick={onCreateGame}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
        >
          <span className="text-2xl">+</span>
          <span className="text-lg">Create New Game</span>
        </button>
      </div>

      {/* Active Games List */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">Active Games ({tables.length})</h2>

        {tables.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <p className="text-gray-400 text-lg mb-4">No active games</p>
            <p className="text-gray-500">Be the first to create a game!</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 p-4 bg-gray-700 text-sm font-semibold text-gray-400">
              <div className="col-span-4">Table</div>
              <div className="col-span-2">Variant</div>
              <div className="col-span-2">Blinds</div>
              <div className="col-span-2">Buy-in</div>
              <div className="col-span-2">Players</div>
            </div>

            {/* Table Rows */}
            {tables.map((table, index) => (
              <div
                key={table.tableId}
                onClick={() => onSelectTable(table.tableId)}
                className={clsx(
                  'grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 p-4 cursor-pointer transition-colors',
                  index !== tables.length - 1 && 'border-b border-gray-700',
                  'hover:bg-gray-700'
                )}
              >
                {/* Table Name & Emoji */}
                <div className="col-span-1 md:col-span-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{table.emoji}</span>
                    <div>
                      <p className="font-semibold text-lg">{table.displayName}</p>
                      <p className="text-sm text-gray-400 md:hidden">
                        {table.variant.toUpperCase()} • {table.currentPlayers}/{table.maxSeats}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Variant */}
                <div className="col-span-1 md:col-span-2 hidden md:flex items-center">
                  <span className={clsx(
                    'px-3 py-1 rounded-full text-xs font-semibold border',
                    getVariantBadgeColor(table.variant)
                  )}>
                    {table.variant === 'squidz-game' ? '🦑 Squidz' : table.variant.toUpperCase()}
                  </span>
                </div>

                {/* Blinds */}
                <div className="col-span-1 md:col-span-2 flex items-center">
                  <div>
                    <p className="text-sm font-semibold">{formatCurrency(table.smallBlind)} / {formatCurrency(table.bigBlind)}</p>
                    <p className="text-xs text-gray-400 md:hidden">Blinds</p>
                  </div>
                </div>

                {/* Buy-in */}
                <div className="col-span-1 md:col-span-2 flex items-center">
                  <div>
                    <p className="text-sm font-semibold">{formatCurrency(table.minBuyIn)} - {formatCurrency(table.maxBuyIn)}</p>
                    <p className="text-xs text-gray-400 md:hidden">Buy-in</p>
                  </div>
                </div>

                {/* Players */}
                <div className="col-span-1 md:col-span-2 hidden md:flex items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">👥</span>
                    <span className="font-semibold">{table.currentPlayers} / {table.maxSeats}</span>
                    <div className={clsx(
                      'w-2 h-2 rounded-full ml-2',
                      table.currentPlayers < table.maxSeats ? 'bg-green-500' : 'bg-red-500'
                    )}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
