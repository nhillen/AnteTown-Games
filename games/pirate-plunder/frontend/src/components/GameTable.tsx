import Badge from './ui/Badge'
import { Die } from './Dice'
import Button from './ui/Button'
import { formatGoldCoinsCompact } from '../utils/currency'

type DieType = { value: number; locked: boolean }
type Seat = {
  playerId: string
  name: string
  isAI: boolean
  tableStack: number
  dice: DieType[]
  hasFolded: boolean
  lockAllowance?: number
  currentBet?: number
  isActive?: boolean
}

type GameState = {
  phase: string
  seats: Seat[]
  pot: number
  currentBet: number
  currentTurnPlayerId?: string
}

type Props = {
  game: GameState | null
  meId: string | null
  onStartHand: () => void
  onPlayerAction: (action: 'bet' | 'call' | 'raise' | 'fold' | 'check', amount?: number) => void
  onLockSelect: (index: number) => void
}

export default function GameTable({ game, meId, onStartHand, onPlayerAction, onLockSelect }: Props) {
  const maxSeats = 8
  const isGameActive = game && game.phase !== 'Lobby' && game.phase !== 'PreHand'
  const isBettingPhase = game?.phase.includes('Bet')
  const isLockPhase = game?.phase.includes('Lock')
  const mySeat = game?.seats.find(s => s?.playerId === meId)
  
  // Calculate seat positions in a circle
  const getSeatPosition = (index: number) => {
    const angle = (index / maxSeats) * 2 * Math.PI - Math.PI / 2 // Start from top
    const radius = 200
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    return { x, y }
  }

  return (
    <div className="relative mx-auto h-[600px] w-full max-w-6xl">
      {/* Table surface */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-emerald-900/30 to-slate-900/40 ring-2 ring-emerald-800/50 shadow-2xl" />
      
      {/* Center area - Pot and game info */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        {isGameActive ? (
          <div className="space-y-2">
            <div className="text-3xl font-bold text-emerald-400">${game.pot}</div>
            <div className="text-sm text-slate-400">Pot</div>
            <Badge variant="default">{game.phase}</Badge>
            {game.currentBet > 0 && (
              <div className="text-sm text-yellow-400">Current bet: ${game.currentBet}</div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xl text-slate-400">Waiting for players...</div>
            {!isGameActive && game?.seats && game.seats.length >= 2 && (
              <Button onClick={onStartHand} variant="primary">
                Start Hand
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Player seats */}
      <div className="absolute inset-8">
        {Array.from({ length: maxSeats }).map((_, index) => {
          const seat = game?.seats[index]
          const pos = getSeatPosition(index)
          const isMe = seat?.playerId === meId
          const isTurn = seat?.playerId === game?.currentTurnPlayerId
          
          return (
            <div
              key={index}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `calc(50% + ${pos.x}px)`, top: `calc(50% + ${pos.y}px)` }}
            >
              {/* Player info card */}
              <div className={`
                rounded-lg border p-3 min-w-[140px] transition-all
                ${seat?.hasFolded ? 'opacity-50 border-slate-700 bg-slate-900/50' : 
                  isMe ? 'border-emerald-500 bg-slate-800 shadow-lg shadow-emerald-500/20' :
                  isTurn ? 'border-yellow-500 bg-slate-800 shadow-lg shadow-yellow-500/20' :
                  'border-slate-700 bg-slate-900/70'}
              `}>
                {seat ? (
                  <>
                    {/* Name and status */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">
                        {seat.name}
                        {seat.isAI && <Badge variant="secondary" className="ml-1 text-[10px]">AI</Badge>}
                      </span>
                      <span className="text-xs text-emerald-400">{formatGoldCoinsCompact(seat.tableStack)}</span>
                    </div>
                    
                    {/* Dice display */}
                    {isGameActive && seat.dice && (
                      <div className="flex gap-1 justify-center mb-2">
                        {seat.dice.map((die, i) => (
                          <div key={i} className="relative">
                            {die.value > 0 ? (
                              <Die 
                                value={die.value as 1|2|3|4|5|6} 
                                locked={die.locked}
                                size="sm"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded border border-slate-600 bg-slate-800" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Status indicators */}
                    {seat.hasFolded && (
                      <Badge variant="warning" className="text-[10px]">FOLDED</Badge>
                    )}
                    {seat.currentBet !== undefined && seat.currentBet > 0 && (
                      <div className="text-xs text-yellow-400 mt-1">
                        Bet: ${seat.currentBet}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-slate-500 text-sm">Empty Seat</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* My action area - floating at bottom */}
      {isGameActive && mySeat && !mySeat.hasFolded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur rounded-lg p-4 border border-slate-700 shadow-2xl">
          {isLockPhase ? (
            <div className="space-y-3">
              <div className="text-sm text-center text-amber-400">
                Select dice to lock ({mySeat.lockAllowance || 0} remaining)
              </div>
              <div className="flex gap-2 justify-center">
                {mySeat.dice.map((die, i) => (
                  <button
                    key={i}
                    onClick={() => onLockSelect(i)}
                    disabled={die.locked || (mySeat.lockAllowance || 0) <= 0}
                    className={`
                      transition-all transform hover:scale-110
                      ${die.locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                    `}
                  >
                    <Die 
                      value={(die.value || 1) as 1|2|3|4|5|6} 
                      locked={die.locked}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : isBettingPhase ? (
            <div className="flex gap-2">
              <Button onClick={() => onPlayerAction('check')} variant="secondary" size="sm">
                Check
              </Button>
              <Button onClick={() => onPlayerAction('bet', 500)} variant="primary" size="sm">
                Bet {formatGoldCoinsCompact(500)}
              </Button>
              <Button onClick={() => onPlayerAction('call')} variant="secondary" size="sm">
                Call {formatGoldCoinsCompact(game.currentBet)}
              </Button>
              <Button onClick={() => onPlayerAction('raise', Math.max(500, game.currentBet * 2))} variant="primary" size="sm">
                Raise to {formatGoldCoinsCompact(Math.max(500, game.currentBet * 2))}
              </Button>
              <Button onClick={() => onPlayerAction('fold')} variant="ghost" size="sm">
                Fold
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}