import React, { useState, useEffect } from 'react';
import type { GameState, Seat } from '@antetown/game-sdk';
import type { Card, PokerPhase, PokerAction } from './types';
import clsx from 'clsx';

interface PokerSeat extends Seat {
  holeCards?: Card[];
  lastAction?: PokerAction;
}

interface HouseRulesGameState extends GameState {
  phase: PokerPhase;
  seats: PokerSeat[];
  communityCards?: Card[];
  smallBlind?: number;
  bigBlind?: number;
  dealerSeatIndex?: number;
}

export interface PokerClientProps {
  gameState: HouseRulesGameState | null;
  myPlayerId: string;
  onAction: (action: PokerAction, amount?: number) => void;
  onSitDown?: (seatIndex: number, buyInAmount: number) => void;
  onStandUp?: () => void;
  isSeated?: boolean;
}

const CardComponent: React.FC<{ card: Card; faceDown?: boolean }> = ({ card, faceDown }) => {
  const suitSymbols = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠'
  };

  // Use inline styles for guaranteed color display
  const suitColors: Record<string, React.CSSProperties> = {
    'hearts': { color: '#ef4444' },     // red-500
    'diamonds': { color: '#ef4444' },   // red-500
    'clubs': { color: '#111827' },      // gray-900
    'spades': { color: '#111827' }      // gray-900
  };

  if (faceDown) {
    return (
      <div className="w-12 h-16 bg-gradient-to-br from-blue-800 to-blue-950 border-2 border-blue-600 rounded shadow-lg flex items-center justify-center relative overflow-hidden">
        {/* Diagonal stripe pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)'
          }}></div>
        </div>
        {/* Card back symbol */}
        <div className="text-blue-400 text-3xl font-bold z-10">♠</div>
      </div>
    );
  }

  return (
    <div className="w-12 h-16 bg-white border-2 border-gray-400 rounded shadow-lg flex flex-col justify-between p-1.5 text-xs">
      <div className="font-bold leading-none" style={suitColors[card.suit]}>
        {card.rank}{suitSymbols[card.suit]}
      </div>
      <div className="text-2xl text-center my-auto" style={suitColors[card.suit]}>
        {suitSymbols[card.suit]}
      </div>
      <div className="font-bold text-right leading-none rotate-180" style={suitColors[card.suit]}>
        {card.rank}{suitSymbols[card.suit]}
      </div>
    </div>
  );
};

const PokerClient: React.FC<PokerClientProps> = ({ gameState, myPlayerId, onAction, onSitDown, onStandUp, isSeated }) => {
  const [betAmount, setBetAmount] = useState<number>(gameState?.bigBlind || 100);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState(2000); // Default $20 in pennies
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Update turn timer countdown
  useEffect(() => {
    if (!gameState?.turnEndsAtMs) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, gameState.turnEndsAtMs! - Date.now());
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [gameState?.turnEndsAtMs]);

  if (!gameState) {
    return (
      <div className="relative w-full h-[600px] bg-green-800 rounded-3xl shadow-2xl p-8 flex items-center justify-center">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  const mySeat = gameState.seats.find(s => s?.playerId === myPlayerId);
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;

  // Debug logging for turn detection
  if (gameState.phase !== 'Lobby' && mySeat) {
    console.log(`🎰 [PokerClient] Phase: ${gameState.phase}, My ID: ${myPlayerId?.slice(0, 8)}, Current turn ID: ${gameState.currentTurnPlayerId?.slice(0, 8)}, Is my turn: ${isMyTurn}`);
  }

  // Show sit-down interface if player is not seated
  if (!isSeated && onSitDown) {
    const getPlayerPosition = (seatIndex: number) => {
      const angle = (seatIndex / gameState.seats.length) * 2 * Math.PI - Math.PI / 2;
      const radiusX = 40;
      const radiusY = 30;
      const x = 50 + radiusX * Math.cos(angle);
      const y = 50 + radiusY * Math.sin(angle);
      return { x, y };
    };

    return (
      <div className="relative w-full h-[600px] bg-green-800 rounded-3xl shadow-2xl p-8">
        {/* Center table info */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="bg-gray-900 bg-opacity-75 text-white px-8 py-4 rounded-lg">
            <h2 className="text-2xl font-bold mb-2">♠️ House Rules Poker</h2>
            <p className="text-sm text-gray-400">Select a seat to join</p>
            <p className="text-xs text-gray-500 mt-2">
              Buy-in: $20 - $100 • Blinds: $0.50 / $1.00
            </p>
          </div>
        </div>

        {/* Seats positioned around the table */}
        {gameState.seats.map((seat, idx) => {
          const pos = getPlayerPosition(idx);
          const isAvailable = seat === null;

          return (
            <button
              key={idx}
              disabled={!isAvailable}
              onClick={() => {
                setSelectedSeatIndex(idx);
                setShowBuyInModal(true);
              }}
              className={clsx(
                'absolute transform -translate-x-1/2 -translate-y-1/2',
                'min-w-[120px] px-4 py-3 rounded-lg font-semibold transition-all',
                isAvailable
                  ? 'bg-green-600 hover:bg-green-700 hover:scale-110 text-white cursor-pointer shadow-lg'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-60'
              )}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="text-sm">Seat {idx + 1}</div>
              {seat && <div className="text-xs mt-1 truncate">{seat.name}</div>}
              {isAvailable && <div className="text-xs mt-1 text-green-200">Click to sit</div>}
            </button>
          );
        })}

        {/* Buy-in Modal */}
        {showBuyInModal && selectedSeatIndex !== null && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-lg p-6 w-96 border-2 border-gray-700">
              <h3 className="text-xl font-bold mb-4 text-white">Choose Buy-in Amount</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Buy-in Amount ($20 - $100)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={100}
                    step={10}
                    value={buyInAmount / 100}
                    onChange={(e) => setBuyInAmount(Math.floor(parseFloat(e.target.value) * 100))}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowBuyInModal(false);
                      setSelectedSeatIndex(null);
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (selectedSeatIndex !== null) {
                        onSitDown(selectedSeatIndex, buyInAmount / 100); // Convert to dollars for backend
                        setShowBuyInModal(false);
                        setSelectedSeatIndex(null);
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg transition-colors"
                  >
                    Sit Down with ${(buyInAmount / 100).toFixed(2)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const getPlayerPosition = (seatIndex: number) => {
    const totalSeats = gameState.seats.length;
    const angle = (seatIndex / totalSeats) * 2 * Math.PI - Math.PI / 2;

    // Safe margins - prevent overlap at edges
    const SAFE_MARGIN = 8; // percentage from edge

    // Responsive radius - scale based on seat count
    const baseRadiusX = Math.min(42, 48 - totalSeats);
    const baseRadiusY = Math.min(32, 38 - totalSeats);

    // Warp angle slightly away from right edge to open space
    const rightBias = Math.cos(angle); // 1 at 3 o'clock, -1 at 9 o'clock
    const warpedAngle = angle + rightBias * 0.06; // ~3.5 degrees push away from right

    let x = 50 + baseRadiusX * Math.cos(warpedAngle);
    let y = 50 + baseRadiusY * Math.sin(warpedAngle);

    // Clamp to safe margins
    x = Math.max(SAFE_MARGIN, Math.min(100 - SAFE_MARGIN, x));
    y = Math.max(SAFE_MARGIN, Math.min(100 - SAFE_MARGIN, y));

    // Determine quadrant for panel placement
    const onLeft = x < 50;
    const onTop = y < 50;

    return { x, y, onLeft, onTop };
  };

  return (
    <div className="w-full space-y-4">
      {/* Poker Table */}
      <div className="relative w-full h-[600px] bg-green-800 rounded-3xl shadow-2xl p-8">
        {/* Table center */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="bg-gray-900 bg-opacity-95 text-white px-6 py-3 rounded-xl mb-4 shadow-2xl border border-white border-opacity-10 backdrop-blur-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pot</p>
            <p className="text-3xl font-bold text-yellow-400 tabular-nums">
              ${(gameState.pot / 100).toFixed(2)}
            </p>
          </div>

          {/* Community Cards */}
          {gameState.communityCards && gameState.communityCards.length > 0 && (
            <div className="flex gap-2 justify-center">
              {gameState.communityCards.map((card, idx) => (
                <CardComponent key={idx} card={card} />
              ))}
            </div>
          )}

          {/* Phase */}
          <p className="text-white text-lg font-semibold mt-4 capitalize">
            {gameState.phase.replace(/([A-Z])/g, ' $1').trim()}
          </p>
        </div>

        {/* Players */}
        {gameState.seats.map((seat, idx) => {
          if (!seat) return null;

          const pos = getPlayerPosition(idx);
          const isMe = seat.playerId === myPlayerId;
          const isCurrentTurn = gameState.currentTurnPlayerId === seat.playerId;
          const isDealer = gameState.dealerSeatIndex === idx;

          // Side-aware panel positioning
          const panelStyle: React.CSSProperties = {
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: pos.onLeft
              ? (pos.onTop ? 'translate(0, 0)' : 'translate(0, -100%)')
              : (pos.onTop ? 'translate(-100%, 0)' : 'translate(-100%, -100%)'),
            maxWidth: 'min(220px, calc(100vw - 48px))'
          };

          return (
            <div
              key={idx}
              className={clsx(
                'absolute',
                isCurrentTurn && 'ring-4 ring-yellow-400',
                'rounded-lg transition-all duration-150'
              )}
              style={panelStyle}
            >
              <div className={clsx(
                'bg-gray-900 bg-opacity-95 text-white rounded-lg p-2.5 w-full',
                'shadow-lg border border-white border-opacity-5',
                seat.hasFolded && 'opacity-50',
                isMe && 'ring-2 ring-blue-500'
              )}>
                {/* Row 1: Name and Action Badge */}
                <div className="flex items-center justify-between mb-1.5 gap-1">
                  <p className="font-semibold text-sm truncate flex-1">{seat.name}</p>
                  <div className="flex items-center gap-1">
                    {isDealer && <span className="text-yellow-400 text-xs font-bold">D</span>}
                    {seat.lastAction && (
                      <span className={clsx(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded uppercase',
                        seat.lastAction === 'fold' && 'bg-gray-600 text-gray-300',
                        (seat.lastAction === 'check' || seat.lastAction === 'call') && 'bg-blue-600 text-blue-100',
                        (seat.lastAction === 'raise' || seat.lastAction === 'bet' || seat.lastAction === 'all-in') && 'bg-amber-600 text-amber-100'
                      )}>
                        {seat.lastAction}
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2: Stack and Bet */}
                <div className="flex justify-between text-xs">
                  <span className="text-green-400 font-semibold tabular-nums">
                    ${(seat.tableStack / 100).toFixed(2)}
                  </span>
                  {seat.currentBet > 0 && (
                    <span className="text-yellow-400 font-semibold tabular-nums">
                      Bet: ${(seat.currentBet / 100).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Hole cards */}
                {seat.holeCards && seat.holeCards.length > 0 && (
                  <div className="flex gap-1 mt-2 justify-center">
                    {seat.holeCards.map((card, cardIdx) => (
                      <CardComponent
                        key={cardIdx}
                        card={card}
                        faceDown={!isMe}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Controls - Below Table */}
      {mySeat && isMyTurn && (
        <div className="w-full">
          <div className="bg-gray-900 rounded-lg p-4 shadow-xl max-w-4xl mx-auto">
            {/* Turn Timer Progress Bar */}
            {gameState.turnEndsAtMs && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Your Turn</span>
                  <span>{Math.ceil(timeRemaining / 1000)}s</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className={clsx(
                      'h-2 rounded-full transition-all duration-100',
                      timeRemaining > 10000 ? 'bg-green-500' : timeRemaining > 5000 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${Math.max(0, (timeRemaining / 30000) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 items-center justify-center">
              <button
                onClick={() => onAction('fold')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-lg transition-colors shadow-lg"
              >
                Fold
              </button>

              {gameState.currentBet === mySeat.currentBet ? (
                <button
                  onClick={() => onAction('check')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-lg transition-colors shadow-lg"
                >
                  Check
                </button>
              ) : (
                <button
                  onClick={() => onAction('call')}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-lg transition-colors shadow-lg"
                >
                  Call ${((gameState.currentBet - mySeat.currentBet) / 100).toFixed(2)}
                </button>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={betAmount / 100}
                  onChange={(e) => setBetAmount(Math.floor(parseFloat(e.target.value) * 100))}
                  step={gameState.bigBlind ? gameState.bigBlind / 100 : 1}
                  min={(gameState.currentBet + (gameState.bigBlind || 100)) / 100}
                  max={mySeat.tableStack / 100}
                  className="w-28 px-3 py-3 rounded text-gray-900 font-bold"
                />
                <button
                  onClick={() => onAction('raise', betAmount)}
                  disabled={betAmount <= gameState.currentBet}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-lg transition-colors shadow-lg"
                >
                  {gameState.currentBet > 0 ? 'Raise' : 'Bet'}
                </button>
              </div>

              <button
                onClick={() => onAction('all-in')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-3 rounded-lg transition-colors shadow-lg"
              >
                All In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PokerClient;
