import Button from './ui/Button'
import { Die } from './Dice'
import { formatGoldCoinsCompact } from '../utils/currency'

type Player = {
  id: string
  name: string
  isAI: boolean
  tableStack: number
}

type Props = {
  players: Player[]
}

export default function Table({ players }: Props) {
  const seats = 8
  const ring = new Array(seats).fill(null) as Array<Player | null>
  players.slice(0, seats).forEach((p, i) => (ring[i] = p))

  return (
    <div className="relative mx-auto h-[480px] w-full max-w-5xl">
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-emerald-900/30 to-slate-900/40 ring-2 ring-emerald-800/50 shadow-2xl" />

      {/* Center dice / action area */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-emerald-700/40 bg-slate-950/70 p-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Die value={6} />
          <Die value={5} />
          <Die value={4} />
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" variant="secondary">Roll</Button>
          <Button size="sm" variant="primary">Bet</Button>
          <Button size="sm" variant="ghost">Fold</Button>
        </div>
      </div>

      {/* Seats */}
      <div className="absolute inset-6">
        {ring.map((p, i) => {
          const angle = (i / seats) * 2 * Math.PI
          const radius = 180
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          return (
            <div
              key={i}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
            >
              <div className="rounded-full border border-slate-700/60 bg-slate-900/70 px-3 py-1 text-sm text-slate-200">
                {p ? (
                  <span className="flex items-center gap-2">
                    {p.isAI && <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px]">AI</span>}
                    {p.name}
                  </span>
                ) : (
                  <span className="text-slate-500">Empty</span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-400">{p ? formatGoldCoinsCompact(p.tableStack) : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


