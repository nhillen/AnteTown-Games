import { formatGoldCoinsCompact } from '../utils/currency'

type DieType = { value: number; locked: boolean; isPublic?: boolean }

type GameInfoProps = {
  pot: number
  mySeat?: {
    dice: DieType[]
    name: string
  }
  isGameActive: boolean
}

function analyzePlayerRole(dice: DieType[]): { role: string | null; count: number; value: number } {
  if (!dice || dice.length === 0) return { role: null, count: 0, value: 0 }
  
  const lockedDice = dice.filter(d => d.locked)
  if (lockedDice.length === 0) return { role: null, count: 0, value: 0 }
  
  // Count each value
  const counts = { 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  lockedDice.forEach(die => {
    if (die.value >= 1 && die.value <= 6) {
      counts[die.value as keyof typeof counts]++
    }
  })
  
  // Check for roles in priority order
  if (counts[6] > 0) return { role: 'Ship', count: counts[6], value: 6 }
  if (counts[5] > 0) return { role: 'Captain', count: counts[5], value: 5 }
  if (counts[4] > 0) return { role: 'Crew', count: counts[4], value: 4 }
  
  // Non-role player - show highest cargo count
  if (counts[3] > 0) return { role: 'Cargo (3s)', count: counts[3], value: 3 }
  if (counts[2] > 0) return { role: 'Cargo (2s)', count: counts[2], value: 2 }
  if (counts[1] > 0) return { role: 'Cargo (1s)', count: counts[1], value: 1 }
  
  return { role: null, count: 0, value: 0 }
}

export default function GameInfo({ pot, mySeat, isGameActive }: GameInfoProps) {
  if (!isGameActive || !mySeat) return null
  
  const playerRole = analyzePlayerRole(mySeat.dice)
  
  return (
    <div className="bg-slate-800/90 backdrop-blur rounded-lg p-3 border border-slate-700 text-xs">
      <div className="grid grid-cols-2 gap-4">
        {/* Current Role Status */}
        <div>
          <h4 className="text-amber-400 font-semibold mb-2">Your Current Status</h4>
          {playerRole.role ? (
            <div className="space-y-1 text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-medium">
                  {playerRole.role === 'Ship' ? '🚢' : 
                   playerRole.role === 'Captain' ? '👨‍✈️' : 
                   playerRole.role === 'Crew' ? '👥' : '📦'} 
                  {playerRole.role}
                </span>
                <span className="text-slate-400">
                  ({playerRole.count}x {playerRole.value}s)
                </span>
              </div>
              {playerRole.role === 'Ship' && (
                <div className="text-green-400 text-xs">Potential: {formatGoldCoinsCompact(Math.floor(pot * 0.5))}</div>
              )}
              {playerRole.role === 'Captain' && (
                <div className="text-green-400 text-xs">Potential: {formatGoldCoinsCompact(Math.floor(pot * 0.3))}</div>
              )}
              {playerRole.role === 'Crew' && (
                <div className="text-green-400 text-xs">Potential: {formatGoldCoinsCompact(Math.floor(pot * 0.2))}</div>
              )}
              {playerRole.role.includes('Cargo') && (
                <div className="text-blue-400 text-xs">Non-role (cargo dice)</div>
              )}
            </div>
          ) : (
            <div className="text-slate-500">No locked dice yet</div>
          )}
        </div>
        
        {/* Current Pot Split */}
        <div>
          <h4 className="text-amber-400 font-semibold mb-2">Current Pot Split</h4>
          <div className="space-y-1 text-slate-300">
            <div className="flex justify-between">
              <span>🚢 Ship (50%)</span>
              <span className="text-emerald-400">{formatGoldCoinsCompact(Math.floor(pot * 0.5))}</span>
            </div>
            <div className="flex justify-between">
              <span>👨‍✈️ Captain (30%)</span>
              <span className="text-emerald-400">{formatGoldCoinsCompact(Math.floor(pot * 0.3))}</span>
            </div>
            <div className="flex justify-between">
              <span>👥 Crew (20%)</span>
              <span className="text-emerald-400">{formatGoldCoinsCompact(Math.floor(pot * 0.2))}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Cargo Chest System */}
      <div className="mt-3 pt-2 border-t border-slate-600">
        <h4 className="text-amber-400 font-semibold mb-1">🏆 Cargo Chest System</h4>
        <div className="space-y-2 text-slate-300 text-xs">
          <div>
            <div className="text-purple-400 font-medium">Progressive Jackpot</div>
            <div className="text-slate-400">10% of all wagers → chest</div>
          </div>
          <div>
            <div className="text-green-400 font-medium">Low Dice Awards</div>
            <div className="text-slate-400">Trips 30% • Quads 60% • Yahtzee 100%</div>
          </div>
          <div>
            <div className="text-orange-400 font-medium">Vacancy Funnel</div>
            <div className="text-slate-400">50% → chest, 50% → active winners (proportional)</div>
          </div>
        </div>
      </div>
    </div>
  )
}