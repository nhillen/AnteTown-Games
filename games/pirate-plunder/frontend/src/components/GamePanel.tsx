import { useEffect, useRef, useState } from 'react'
import Button from './ui/Button'
import Panel from './ui/Panel'
import Badge from './ui/Badge'
import { Die } from './Dice'

type DieT = { value: number; locked: boolean }
type Seat = {
  playerId: string
  name: string
  isAI: boolean
  tableStack: number
  dice: DieT[]
  hasFolded: boolean
  lockAllowance?: number
}

type GameState = {
  phase: string
  seats: Seat[]
  pot: number
  currentBet: number
  countdownEndsAtMs?: number
}

type Props = {
  meId: string | null
  game: GameState | null
  onLockSelect: (index: number) => void
  onNextPhase: () => void
}

export default function GamePanel({ meId, game, onLockSelect, onNextPhase }: Props) {
  if (!game) return (
    <Panel title="Game">
      <p className="text-sm text-slate-400">No hand running.</p>
    </Panel>
  )

  const mySeat = game.seats.find((s) => s?.playerId === meId) || null

  // Countdown display
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!game.countdownEndsAtMs) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [game.countdownEndsAtMs])
  const countdownMs = game.countdownEndsAtMs ? Math.max(0, game.countdownEndsAtMs - now) : 0

  // Roll animation when entering Roll phases
  const [rolling, setRolling] = useState(false)
  const phaseRef = useRef(game.phase)
  useEffect(() => {
    if (game.phase !== phaseRef.current) {
      phaseRef.current = game.phase
      if (game.phase.startsWith('Roll')) {
        setRolling(true)
        const h = setTimeout(() => setRolling(false), 700)
        return () => clearTimeout(h)
      }
    }
  }, [game.phase])

  // Temporarily remove useCallback to test error
  const randPip = () => ((Math.floor(Math.random() * 6) + 1) as 1|2|3|4|5|6)

  const isLockPhase = game.phase.startsWith('Lock')

  return (
    <Panel title="Game" border="emerald">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Badge>{game.phase}</Badge>
        {game.countdownEndsAtMs && (
          <span className="text-emerald-400">Starting in {(Math.ceil(countdownMs / 100) / 10).toFixed(1)}s</span>
        )}
        <div className="text-slate-400">Pot: ${game.pot}</div>
        <div className="text-slate-400">Current bet: ${game.currentBet}</div>
      </div>

      {(!mySeat) && (
        <p className="text-sm text-slate-400">Join the lobby to play.</p>
      )}

      {mySeat && (
        <div className="rounded-lg border border-slate-800 p-3">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
            <span>Your dice</span>
            {isLockPhase && (
              <span className="text-amber-400">Choose a die to lock ({mySeat.lockAllowance ?? 0} left)</span>
            )}
          </div>
          <div className={`flex items-center gap-3 ${rolling ? 'animate-pulse' : ''}`}>
            {mySeat.dice.map((d, i) => (
              <button
                key={i}
                onClick={() => isLockPhase && onLockSelect(i)}
                className={`relative ${isLockPhase ? 'cursor-pointer' : 'cursor-default'}`}
                disabled={!isLockPhase || d.locked}
                title={isLockPhase ? (d.locked ? 'Already locked' : 'Lock this die') : ''}
              >
                <Die value={(rolling ? randPip() : (d.value || 1)) as 1|2|3|4|5|6} locked={d.locked} />
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="ghost" size="sm" onClick={onNextPhase}>Next Phase</Button>
          </div>
        </div>
      )}
    </Panel>
  )
}


