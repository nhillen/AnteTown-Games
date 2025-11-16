/**
 * CoinFlipClient - UI for the coin flip game
 *
 * Displays:
 * - Current phase
 * - Pot
 * - Seated players
 * - Coin flip animation
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

type CoinFlipGameState = {
  phase: 'Lobby' | 'Ante' | 'CallSide' | 'Flip' | 'Payout' | 'HandEnd'
  seats: (Seat | null)[]
  pot: number
  currentBet: number
  ante: number
  currentTurnPlayerId?: string
  turnEndsAtMs?: number
  calledSide?: 'heads' | 'tails'
  callerPlayerId?: string
  flipResult?: 'heads' | 'tails'
}

type CoinFlipTableProps = {
  game: CoinFlipGameState | null
  meId: string
  onPlayerAction: (action: string, amount?: number) => void
  onSitDown: (seatIndex: number, buyInAmount: number) => void
  onStandUp: () => void
  isSeated: boolean
}

export default function CoinFlipClient({
  game,
  meId,
  onPlayerAction,
  onSitDown,
  onStandUp,
  isSeated
}: CoinFlipTableProps) {
  const [coinFlipping, setCoinFlipping] = useState(false)
  const [showBuyInModal, setShowBuyInModal] = useState(false)
  const [buyInAmount, setBuyInAmount] = useState(5)

  // Animate coin flip
  useEffect(() => {
    if (game?.phase === 'Flip' && !coinFlipping) {
      setCoinFlipping(true)
      setTimeout(() => {
        setCoinFlipping(false)
      }, 3000)
    }
  }, [game?.phase, coinFlipping])

  if (!game) {
    return (
      <div className="h-full flex items-center justify-center">
        <Panel title="🪙 Coin Flip" className="max-w-2xl">
          <div className="text-center space-y-4">
            <p className="text-lg">Loading game...</p>
          </div>
        </Panel>
      </div>
    )
  }

  const activePlayers = game.seats.filter(s => s !== null && !s.hasFolded)
  const isMyTurn = game.currentTurnPlayerId === meId

  const handleCallSide = (side: 'heads' | 'tails') => {
    onPlayerAction(`call_${side}`)
  }

  const handleStartHand = () => {
    onPlayerAction('start_hand')
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

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="max-w-6xl w-full space-y-6">
        {/* Game Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">🪙 Coin Flip</h1>
          <div className="flex items-center justify-center gap-4">
            <Badge variant={game.phase === 'Lobby' ? 'warning' : 'success'}>
              {game.phase}
            </Badge>
            <span className="text-2xl font-bold text-yellow-400">
              Pot: ${(game.pot / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Main Game Area */}
        <Panel title="Game Table" className="min-h-[400px]">
          <div className="flex flex-col items-center justify-center space-y-6 py-8">
            {/* Coin Display */}
            <div className="relative">
              {coinFlipping ? (
                <div className="text-8xl animate-spin">🪙</div>
              ) : game.flipResult ? (
                <div className="text-center">
                  <div className="text-8xl mb-4">🪙</div>
                  <div className="text-3xl font-bold text-yellow-400">
                    {game.flipResult.toUpperCase()}!
                  </div>
                </div>
              ) : (
                <div className="text-8xl opacity-50">🪙</div>
              )}
            </div>

            {/* Phase-specific content */}
            {game.phase === 'Lobby' && (
              <div className="text-center space-y-4">
                <p className="text-xl">Waiting for players...</p>
                <p className="text-gray-400">
                  {activePlayers.length} / 2 players seated
                </p>
                {isSeated && activePlayers.length >= 2 && (
                  <Button onClick={handleStartHand} variant="primary" size="md">
                    Start Hand
                  </Button>
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
                <p className="text-gray-400">Ante: ${(game.ante / 100).toFixed(2)}</p>
              </div>
            )}

            {game.phase === 'CallSide' && (
              <div className="text-center space-y-4">
                {isMyTurn ? (
                  <>
                    <p className="text-xl mb-4">Call your side!</p>
                    <div className="flex gap-4 justify-center">
                      <Button onClick={() => handleCallSide('heads')} variant="primary" size="md">
                        🪙 Heads
                      </Button>
                      <Button onClick={() => handleCallSide('tails')} variant="primary" size="md">
                        🪙 Tails
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xl">
                    {game.seats.find(s => s?.playerId === game.currentTurnPlayerId)?.name} is calling...
                  </p>
                )}
              </div>
            )}

            {game.phase === 'Flip' && game.calledSide && (
              <div className="text-center">
                <p className="text-xl mb-2">Flipping the coin...</p>
                <p className="text-gray-400">
                  {game.seats.find(s => s?.playerId === game.callerPlayerId)?.name} called{' '}
                  <span className="text-yellow-400 font-bold">{game.calledSide}</span>
                </p>
              </div>
            )}

            {game.phase === 'Payout' && game.flipResult && (
              <div className="text-center space-y-2">
                <p className="text-2xl text-green-400 font-bold">
                  {game.calledSide === game.flipResult ? '🎉 Caller Wins!' : '🎉 Opponent Wins!'}
                </p>
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
        <Panel title="Players" className="max-w-2xl mx-auto">
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
              const isCaller = seat?.playerId === game.callerPlayerId

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
                    {isCaller && game.calledSide && (
                      <Badge variant="warning">
                        Called {game.calledSide}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400">
                      ${((seat?.tableStack || 0) / 100).toFixed(2)}
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
                  Buy-in Amount (minimum $5)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1000}
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Math.max(5, parseInt(e.target.value) || 5))}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowBuyInModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={confirmBuyIn}>
                  Sit Down with ${buyInAmount}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
