/**
 * CardFlipClient - UI for the card flip game
 *
 * Displays:
 * - Current phase
 * - Pot
 * - Seated players
 * - Card flip animations (3 cards)
 * - Red vs Black side selection
 * - Action buttons
 */

import { useState, useEffect } from 'react'
import Panel from './ui/Panel'
import Button from './ui/Button'
import Badge from './ui/Badge'

type Seat = {
  playerId: string
  name: string
  isAI: boolean
  tableStack: number
  hasFolded: boolean
  currentBet: number
  hasActed: boolean
  cosmetics?: any
}

type CardColor = 'red' | 'black'
type Card = { color: CardColor; suit: string; rank: string }

type CardFlipGameState = {
  phase: 'Lobby' | 'Ante' | 'PickSide' | 'FlipCard1' | 'FlipCard2' | 'FlipCard3' | 'Payout' | 'HandEnd'
  seats: (Seat | null)[]
  pot: number
  currentBet: number
  ante: number
  currentTurnPlayerId?: string
  turnEndsAtMs?: number
  pickedSide?: CardColor
  pickerPlayerId?: string
  opponentSide?: CardColor
  opponentPlayerId?: string
  flippedCards: Card[]
  redCount: number
  blackCount: number
  readyPlayers?: string[]
  lobbyTimerEndsAt?: number
}

type CardFlipTableProps = {
  game: CardFlipGameState | null
  meId: string
  onPlayerAction: (action: string, amount?: number) => void
  onSitDown: (seatIndex: number, buyInAmount: number) => void
  onStandUp: () => void
  isSeated: boolean
}

export default function CardFlipClient({
  game,
  meId,
  onPlayerAction,
  onSitDown,
  onStandUp,
  isSeated
}: CardFlipTableProps) {
  const [showBuyInModal, setShowBuyInModal] = useState(false)
  const [buyInAmount, setBuyInAmount] = useState(100)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  // Set default buy-in based on ante
  useEffect(() => {
    if (game?.ante) {
      setBuyInAmount(Math.max(game.ante * 10, 100))
    }
  }, [game?.ante])

  // Timer countdown for turn timer
  useEffect(() => {
    if (!game?.turnEndsAtMs) {
      setTimeRemaining(null)
      return
    }

    const updateTimer = () => {
      const remaining = Math.max(0, game.turnEndsAtMs! - Date.now())
      setTimeRemaining(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 100)
    return () => clearInterval(interval)
  }, [game?.turnEndsAtMs])

  if (!game) {
    return (
      <div className="h-full flex items-center justify-center">
        <Panel title="🃏 Card Flip" className="max-w-2xl">
          <div className="text-center space-y-4">
            <p className="text-lg">Loading game...</p>
          </div>
        </Panel>
      </div>
    )
  }

  const activePlayers = game.seats.filter(s => s !== null && !s.hasFolded)
  const isMyTurn = game.currentTurnPlayerId === meId

  const handlePickSide = (side: CardColor) => {
    onPlayerAction(`pick_${side}`)
  }

  const handleSitDownClick = () => {
    setShowBuyInModal(true)
  }

  const confirmBuyIn = () => {
    const emptySeat = game.seats.findIndex(s => s === null)
    if (emptySeat !== -1) {
      onSitDown(emptySeat, buyInAmount)
      setShowBuyInModal(false)
    }
  }

  const getSuitColor = (suit: string): React.CSSProperties => {
    // Use inline styles for guaranteed color display (like poker cards)
    return (suit === '♥' || suit === '♦')
      ? { color: '#ef4444' } // red-500
      : { color: '#111827' }  // gray-900
  }

  const isFlipPhase = game.phase === 'FlipCard1' || game.phase === 'FlipCard2' || game.phase === 'FlipCard3'

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="max-w-6xl w-full space-y-6">
        {/* Game Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">🃏 Card Flip</h1>
        </div>

        {/* Main Game Area */}
        <Panel title="Game Table" className="min-h-[400px]">
          <div className="flex flex-col items-center justify-center space-y-6 py-8">
            {/* Side Selection Display */}
            {(game.pickedSide || game.opponentSide) && (
              <div className="flex gap-8 items-center justify-center mb-4">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">Red</div>
                  <div className={`text-4xl ${game.pickedSide === 'red' || game.opponentSide === 'red' ? 'opacity-100' : 'opacity-30'}`} style={{ color: '#ef4444' }}>
                    ♥♦
                  </div>
                  {game.pickedSide === 'red' && (
                    <div className="text-xs text-yellow-400 mt-2">
                      {game.seats.find(s => s?.playerId === game.pickerPlayerId)?.name}
                    </div>
                  )}
                  {game.opponentSide === 'red' && (
                    <div className="text-xs text-yellow-400 mt-2">
                      {game.seats.find(s => s?.playerId === game.opponentPlayerId)?.name}
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">Black</div>
                  <div className={`text-4xl ${game.pickedSide === 'black' || game.opponentSide === 'black' ? 'opacity-100' : 'opacity-30'}`} style={{ color: '#111827' }}>
                    ♣♠
                  </div>
                  {game.pickedSide === 'black' && (
                    <div className="text-xs text-yellow-400 mt-2">
                      {game.seats.find(s => s?.playerId === game.pickerPlayerId)?.name}
                    </div>
                  )}
                  {game.opponentSide === 'black' && (
                    <div className="text-xs text-yellow-400 mt-2">
                      {game.seats.find(s => s?.playerId === game.opponentPlayerId)?.name}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cards Display */}
            {game.flippedCards.length > 0 && (
              <div className="flex gap-4 items-center justify-center">
                {game.flippedCards.map((card, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-6 shadow-lg border-2 border-gray-300 min-w-[80px] text-center animate-fadeIn"
                  >
                    <div className="text-5xl font-bold" style={getSuitColor(card.suit)}>
                      {card.rank}{card.suit}
                    </div>
                  </div>
                ))}
                {/* Placeholder for upcoming cards */}
                {Array.from({ length: 3 - game.flippedCards.length }).map((_, index) => (
                  <div
                    key={`placeholder-${index}`}
                    className="bg-gray-700 rounded-lg p-6 min-w-[80px] h-[100px] flex items-center justify-center border-2 border-gray-600"
                  >
                    <div className="text-4xl opacity-30">🂠</div>
                  </div>
                ))}
              </div>
            )}

            {/* Score Display with Running TC Total */}
            {game.flippedCards.length > 0 && (
              <div className="text-center space-y-2">
                <div className="text-xl">
                  <span style={{ color: '#ef4444' }} className="font-bold">Red: {game.redCount}</span>
                  {' | '}
                  <span style={{ color: '#111827' }} className="font-bold">Black: {game.blackCount}</span>
                </div>
                {game.flippedCards.length === 3 && (
                  <div className="text-lg text-gray-400">
                    {(() => {
                      const allSame = game.redCount === 3 || game.blackCount === 3;
                      const cardValue = allSame ? game.ante * 2 : game.ante;
                      const redValue = game.redCount * cardValue;
                      const blackValue = game.blackCount * cardValue;
                      const netPayout = Math.abs(redValue - blackValue);
                      const winner = redValue > blackValue ? 'Red' : 'Black';
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <div>{allSame && <span className="text-yellow-400 font-bold">DOUBLE PAYOUT! </span>}</div>
                          <div className="text-2xl font-bold text-yellow-400">
                            {winner} wins 🪙{netPayout} TC
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Phase-specific content */}
            {game.phase === 'Lobby' && (
              <div className="text-center space-y-4">
                <p className="text-xl">Waiting for players...</p>
                <p className="text-gray-400">
                  {activePlayers.length} / 2 players seated
                </p>
                {activePlayers.length >= 2 && (
                  <p className="text-yellow-400 text-lg animate-pulse">
                    Starting game...
                  </p>
                )}
                {!isSeated && (
                  <Button onClick={handleSitDownClick} variant="primary" size="md">
                    Sit Down
                  </Button>
                )}
              </div>
            )}

            {game.phase === 'Ante' && (
              <div className="text-center">
                <p className="text-xl">Collecting antes...</p>
                <p className="text-gray-400">Ante: 🪙{game.ante} TC</p>
              </div>
            )}

            {game.phase === 'PickSide' && (
              <div className="text-center space-y-4">
                {isMyTurn ? (
                  <>
                    <p className="text-xl mb-4">Pick your color!</p>
                    {timeRemaining !== null && (
                      <div className="w-64 mx-auto mb-4">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 transition-all duration-100"
                            style={{ width: `${(timeRemaining / 5000) * 100}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          {Math.ceil(timeRemaining / 1000)}s remaining
                        </p>
                      </div>
                    )}
                    <div className="flex gap-4 justify-center">
                      <Button onClick={() => handlePickSide('red')} variant="primary" size="md">
                        ♥ Red
                      </Button>
                      <Button onClick={() => handlePickSide('black')} variant="primary" size="md">
                        ♣ Black
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xl">
                    {game.seats.find(s => s?.playerId === game.currentTurnPlayerId)?.name} is picking...
                  </p>
                )}
              </div>
            )}

            {isFlipPhase && (
              <div className="text-center">
                <p className="text-xl mb-2">Flipping cards...</p>
                <p className="text-gray-400">
                  {game.flippedCards.length} of 3 cards flipped
                </p>
              </div>
            )}

            {game.phase === 'Payout' && (
              <div className="text-center space-y-2">
                {game.redCount > game.blackCount ? (
                  <p className="text-2xl text-red-500 font-bold">
                    🎉 Red Wins!
                  </p>
                ) : (
                  <p className="text-2xl font-bold">
                    🎉 Black Wins!
                  </p>
                )}
                {(game.redCount === 3 || game.blackCount === 3) && (
                  <p className="text-yellow-400 text-lg">
                    All {game.redCount === 3 ? 'Red' : 'Black'}! DOUBLE PAYOUT!
                  </p>
                )}
              </div>
            )}

            {game.phase === 'HandEnd' && (
              <div className="text-center">
                <p className="text-xl">Hand complete</p>
                <p className="text-gray-400">Starting next hand...</p>
              </div>
            )}
          </div>
        </Panel>

        {/* Players Panel */}
        <Panel
          title={
            <div className="flex items-center gap-3">
              <span>Players</span>
              <Badge variant={game.phase === 'Lobby' ? 'warning' : 'success'}>
                {game.phase}
              </Badge>
            </div>
          }
          className="max-w-2xl mx-auto"
        >
          <div className="space-y-2">
            {game.seats.map((seat, index) => {
              if (!seat) {
                return (
                  <div key={`empty-${index}`} className="flex justify-between items-center p-3 bg-slate-700/30 rounded">
                    <span className="text-gray-500">Empty Seat {index + 1}</span>
                    {!isSeated && (
                      <Button onClick={handleSitDownClick} size="sm" variant="ghost">
                        Sit Here
                      </Button>
                    )}
                  </div>
                )
              }

              const isMe = seat?.playerId === meId
              const isPicker = seat?.playerId === game.pickerPlayerId
              const isReady = game.readyPlayers?.includes(seat.playerId)

              return (
                <div
                  key={seat?.playerId || `seat-${index}`}
                  className={`flex justify-between items-center p-3 rounded ${
                    isMe ? 'bg-emerald-900/40 border-2 border-emerald-500' : 'bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${isMe ? 'text-emerald-400' : 'text-white'}`}>
                      {seat?.name || 'Unknown'}
                      {isMe && ' (You)'}
                      {seat?.isAI && ' (AI)'}
                    </span>
                    {isPicker && game.pickedSide && (
                      <Badge variant="warning">
                        Picked {game.pickedSide}
                      </Badge>
                    )}
                    {isReady && game.phase === 'Lobby' && (
                      <Badge variant="success">
                        Ready
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400">
                      🪙{seat?.tableStack || 0} TC
                    </span>
                    {isMe && (
                      <Button onClick={onStandUp} size="sm" variant="ghost">
                        Stand Up
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* Buy-in Modal */}
      {showBuyInModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-96 border border-slate-600">
            <h2 className="text-xl font-bold mb-4">💰 Choose Buy-in Amount</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Buy-in Amount (minimum 🪙{Math.max(game.ante * 5, 100)} TC)
                </label>
                <input
                  type="number"
                  min={Math.max(game.ante * 5, 100)}
                  max={10000}
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Math.max(game.ante * 5, parseInt(e.target.value) || game.ante * 5))}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowBuyInModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={confirmBuyIn}>
                  Sit Down with 🪙{buyInAmount} TC
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
