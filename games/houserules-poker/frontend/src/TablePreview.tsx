import React, { useState } from 'react';
import clsx from 'clsx';

interface Seat {
  playerId: string;
  name: string;
  tableStack: number;
  isAI?: boolean;
}

interface TablePreviewProps {
  tableId: string;
  displayName: string;
  variant: string;
  emoji: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  seats: (Seat | null)[];
  playerBankroll: number;
  onSitDown: (seatIndex: number, buyInAmount: number) => void;
  onBack: () => void;
}

export const TablePreview: React.FC<TablePreviewProps> = ({
  tableId,
  displayName,
  variant,
  emoji,
  smallBlind,
  bigBlind,
  minBuyIn,
  maxBuyIn,
  maxSeats,
  seats,
  playerBankroll,
  onSitDown,
  onBack
}) => {
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [buyInAmount, setBuyInAmount] = useState<number>(Math.floor((minBuyIn + maxBuyIn) / 2));

  const formatCurrency = (pennies: number) => `$${(pennies / 100).toFixed(2)}`;

  const handleSeatClick = (seatIndex: number) => {
    if (seats[seatIndex] === null) {
      setSelectedSeat(seatIndex);
      // Default to mid-range buy-in
      setBuyInAmount(Math.floor((minBuyIn + maxBuyIn) / 2));
    }
  };

  const handleConfirmSit = () => {
    if (selectedSeat === null) return;

    if (buyInAmount < minBuyIn || buyInAmount > maxBuyIn) {
      alert(`Buy-in must be between ${formatCurrency(minBuyIn)} and ${formatCurrency(maxBuyIn)}`);
      return;
    }

    if (buyInAmount > playerBankroll) {
      alert(`Insufficient funds. You have ${formatCurrency(playerBankroll)}, but need ${formatCurrency(buyInAmount)}`);
      return;
    }

    onSitDown(selectedSeat, buyInAmount);
    setSelectedSeat(null);
  };

  const getPlayerPosition = (seatIndex: number) => {
    const totalSeats = maxSeats;
    const angle = (seatIndex / totalSeats) * 2 * Math.PI - Math.PI / 2;

    const SAFE_MARGIN = 10;
    const radiusX = 42;
    const radiusY = 32;

    let x = 50 + radiusX * Math.cos(angle);
    let y = 50 + radiusY * Math.sin(angle);

    x = Math.max(SAFE_MARGIN, Math.min(100 - SAFE_MARGIN, x));
    y = Math.max(SAFE_MARGIN, Math.min(100 - SAFE_MARGIN, y));

    const onLeft = x < 50;
    const onTop = y < 50;

    return { x, y, onLeft, onTop };
  };

  const occupiedSeats = seats.filter(s => s !== null).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <button
          onClick={onBack}
          className="mb-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition-colors"
        >
          ← Back to Lobby
        </button>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{emoji}</span>
            <div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              <div className="flex items-center gap-3 text-gray-400 mt-1">
                <span className="text-sm">{variant.toUpperCase()}</span>
                <span>•</span>
                <span className="text-sm">Blinds: {formatCurrency(smallBlind)} / {formatCurrency(bigBlind)}</span>
                <span>•</span>
                <span className="text-sm">👥 {occupiedSeats}/{maxSeats}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Your Bankroll</p>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(playerBankroll)}</p>
          </div>
        </div>
      </div>

      {/* Poker Table */}
      <div className="max-w-5xl mx-auto">
        <div className="relative w-full" style={{ paddingBottom: '70%' }}>
          {/* Table Surface */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[90%] h-[90%] bg-gradient-to-br from-green-800 to-green-900 rounded-[50%] border-[12px] border-amber-900 shadow-2xl flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white/50 mb-2">{displayName}</h2>
                <p className="text-white/30">Click empty seat to sit</p>
              </div>
            </div>
          </div>

          {/* Player Seats */}
          {seats.map((seat, index) => {
            const pos = getPlayerPosition(index);
            const isEmpty = seat === null;
            const isSelected = selectedSeat === index;

            return (
              <div
                key={index}
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: pos.onLeft
                    ? (pos.onTop ? 'translate(0, 0)' : 'translate(0, -100%)')
                    : (pos.onTop ? 'translate(-100%, 0)' : 'translate(-100%, -100%)'),
                }}
              >
                {isEmpty ? (
                  <button
                    onClick={() => handleSeatClick(index)}
                    className={clsx(
                      'bg-gray-700 hover:bg-gray-600 border-2 rounded-lg p-4 transition-all min-w-[120px]',
                      isSelected ? 'border-blue-500 scale-105' : 'border-gray-600'
                    )}
                  >
                    <p className="text-center text-gray-400 text-sm">Empty Seat {index + 1}</p>
                  </button>
                ) : (
                  <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-3 min-w-[140px]">
                    <p className="font-semibold text-sm mb-1">{seat.name}</p>
                    <p className="text-green-400 font-bold text-sm">{formatCurrency(seat.tableStack)}</p>
                    {seat.isAI && <p className="text-xs text-gray-500 mt-1">🤖 AI</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Buy-in Modal */}
      {selectedSeat !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedSeat(null)}>
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 border-2 border-blue-500" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4">Sit Down - Seat {selectedSeat + 1}</h2>

            {/* Buy-in Slider */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2">
                Buy-in Amount: {formatCurrency(buyInAmount)}
              </label>
              <input
                type="range"
                min={minBuyIn}
                max={Math.min(maxBuyIn, playerBankroll)}
                step={100}
                value={buyInAmount}
                onChange={(e) => setBuyInAmount(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#3b82f6' }}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{formatCurrency(minBuyIn)}</span>
                <span>{formatCurrency(Math.min(maxBuyIn, playerBankroll))}</span>
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
                onClick={() => setSelectedSeat(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSit}
                disabled={buyInAmount > playerBankroll || buyInAmount < minBuyIn}
                className={clsx(
                  'flex-1 font-semibold py-3 px-6 rounded-lg transition-colors',
                  buyInAmount > playerBankroll || buyInAmount < minBuyIn
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                )}
              >
                Sit Down
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
