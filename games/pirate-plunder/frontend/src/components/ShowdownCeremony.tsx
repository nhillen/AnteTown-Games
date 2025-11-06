import { useState, useEffect } from 'react'
import Badge from './ui/Badge'
import { Die } from './Dice'
import { formatGoldCoinsCompact } from '../utils/currency'

type HandResult = {
  sixCount: number
  fiveCount: number
  fourCount: number
  oneCount: number
  twoCount: number
  threeCount: number
}

type ShowdownResult = {
  playerId: string
  name: string
  handResult: HandResult
  roles: string[]
  payout: number
  isActive: boolean
}

type Props = {
  showdownResults: ShowdownResult[]
  pot: number
  seats: any[]
  chestAwards?: { playerId: string; type: string; amount: number }[]
  cargoChest?: number
  roleTies?: {
    ship: { playerId: string; name: string; count: number }[] | null;
    captain: { playerId: string; name: string; count: number }[] | null;
    crew: { playerId: string; name: string; count: number }[] | null;
  }
  meId?: string
}

export default function ShowdownCeremony({ showdownResults, pot, seats, chestAwards, cargoChest, roleTies, meId }: Props) {
  const [revealStage, setRevealStage] = useState(0)

  useEffect(() => {
    // Faster reveal stages - compact everything on one screen
    const stages = [
      300,   // Show hands & roles
      1200,  // Show payouts + cargo chest
      7000,  // Keep screen up for 5+ seconds
    ]

    stages.forEach((delay, index) => {
      setTimeout(() => setRevealStage(index + 1), delay)
    })
  }, [])
  
  const shipWinner = showdownResults.find(r => r.roles.includes('Ship'))
  const captainWinner = showdownResults.find(r => r.roles.includes('Captain'))
  const crewWinner = showdownResults.find(r => r.roles.includes('Crew'))
  
  // Determine vacancy funnel status
  const vacancies = []
  if (!shipWinner) vacancies.push('Ship')
  if (!captainWinner) vacancies.push('Captain') 
  if (!crewWinner) vacancies.push('Crew')
  
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900/95 rounded-xl p-6 max-w-5xl w-full border-2 border-emerald-500 shadow-2xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-3xl font-bold text-center text-emerald-400 mb-6">
          🎯 Showdown Ceremony!
        </h2>
        
        <div className="text-center mb-4">
          <div className="text-2xl font-bold text-yellow-400">
            Total Pot: {formatGoldCoinsCompact(pot)}
          </div>
        </div>

        {/* Cargo Chest Awards - Show prominently at top */}
        {revealStage >= 2 && chestAwards && chestAwards.length > 0 && (
          <div className="bg-gradient-to-br from-purple-900/60 to-indigo-900/60 rounded-lg p-4 mb-4 border-2 border-purple-400 shadow-xl">
            <h3 className="text-xl font-bold text-purple-300 mb-3 text-center">
              🏆 Cargo Chest Bonus!
            </h3>

            {cargoChest !== undefined && (
              <div className="text-center mb-3">
                <span className="text-sm text-purple-200">Chest: </span>
                <span className="text-xl font-bold text-purple-300">{formatGoldCoinsCompact(cargoChest)}</span>
              </div>
            )}

            <div className="space-y-2">
              {chestAwards.map((award) => {
                const player = showdownResults.find(r => r.playerId === award.playerId)
                return (
                  <div
                    key={award.playerId}
                    className="flex items-center justify-between p-3 rounded-lg border border-purple-400/50 bg-purple-400/10"
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-xl">
                        {award.type === 'yahtzee' ? '🎯' :
                         award.type === 'quads' ? '🎲' :
                         award.type === 'trips' ? '🎪' : '🎰'}
                      </div>
                      <div>
                        <div className="font-bold text-purple-100">{player?.name}</div>
                        <div className="text-xs text-purple-300">
                          {award.type === 'yahtzee' ? 'Yahtzee' :
                           award.type === 'quads' ? 'Quads' :
                           award.type === 'trips' ? 'Trips' : award.type}
                        </div>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-yellow-300">
                      {formatGoldCoinsCompact(award.amount)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Current Player's Final Hand (if in game) */}
        {meId && showdownResults.find(r => r.playerId === meId) && (
          <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-blue-400/50">
            <h3 className="text-lg font-bold text-blue-400 mb-3 text-center">🎲 Your Final Hand</h3>
            <div className="flex justify-center">
              {(() => {
                const result = showdownResults.find(r => r.playerId === meId)
                const seat = seats.find(s => s?.playerId === meId)
                if (!result || !seat) return null

                return (
                  <div className="flex flex-col items-center">
                    <div className="flex gap-0.5 justify-center mb-3 px-2">
                      {seat?.dice.map((die: any, i: number) => (
                        <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-4px' : '0' }}>
                          <Die value={die.value as 1|2|3|4|5|6} locked={true} size="sm" />
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-slate-400 text-center mb-2">
                      6s: {result.handResult.sixCount} | 5s: {result.handResult.fiveCount} | 4s: {result.handResult.fourCount}
                      <br/>
                      3s: {result.handResult.threeCount} | 2s: {result.handResult.twoCount} | 1s: {result.handResult.oneCount}
                    </div>
                    {result.roles.length > 0 ? (
                      <div className="flex gap-1 justify-center flex-wrap">
                        {result.roles.map(role => (
                          <Badge key={role} variant="success" className="text-xs">
                            {role === 'Ship' ? '🚢' : role === 'Captain' ? '👨‍✈️' : '👥'} {role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="default" className="text-xs">Non-Role</Badge>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Role Winners + Current Player */}
        <div className="space-y-4 mb-6">
          {/* Role Winners */}
          {showdownResults.filter(result => result.roles.length > 0).length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-amber-400 mb-3 text-center">🏆 Role Winners</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {showdownResults.filter(result => result.roles.length > 0).map((result, i) => {
                  return (
                    <div
                      key={result.playerId}
                      className={`
                        rounded-lg p-4 border-2 transition-all duration-500
                        ${revealStage >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
                        border-yellow-400 bg-gradient-to-br from-yellow-400/20 to-orange-400/10 shadow-lg shadow-yellow-400/30
                      `}
                      style={{ transitionDelay: `${i * 100}ms` }}
                    >
                      <div className="text-center mb-2">
                        <span className="font-bold text-lg">{result.name}</span>
                      </div>

                      {/* Role badges */}
                      {revealStage >= 2 && (
                        <div className="flex gap-1 justify-center flex-wrap mb-2">
                          {result.roles.map(role => (
                            <Badge key={role} variant="success" className="text-xs">
                              {role === 'Ship' ? '🚢' : role === 'Captain' ? '👨‍✈️' : '👥'} {role}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Show final payout */}
                      {revealStage >= 2 && (
                        <div className="text-center">
                          <div className="text-xl font-bold text-green-400">
                            {formatGoldCoinsCompact(result.payout)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Current Player's Hand (if not a winner) */}
          {meId && showdownResults.find(r => r.playerId === meId && r.roles.length === 0) && (
            <div>
              <h3 className="text-lg font-bold text-blue-400 mb-3 text-center">🎲 Your Hand</h3>
              <div className="flex justify-center">
                {(() => {
                  const result = showdownResults.find(r => r.playerId === meId)
                  const seat = seats.find(s => s?.playerId === meId)
                  if (!result || !seat) return null

                  return (
                    <div
                      className={`
                        rounded-lg p-4 border-2 transition-all duration-500
                        ${revealStage >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
                        border-blue-400 bg-gradient-to-br from-blue-400/20 to-slate-600/10 shadow-lg shadow-blue-400/20
                      `}
                    >
                      <div className="text-center mb-2">
                        <span className="font-bold text-lg">{result.name}</span>
                      </div>

                      {/* Show dice */}
                      <div className="flex gap-0.5 justify-center mb-3 px-2">
                        {seat?.dice.map((die: any, i: number) => (
                          <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-4px' : '0' }}>
                            <Die value={die.value as 1|2|3|4|5|6} locked={true} size="sm" />
                          </div>
                        ))}
                      </div>

                      {/* Show dice counts */}
                      <div className="text-xs text-slate-400 text-center mb-2">
                        6s: {result.handResult.sixCount} | 5s: {result.handResult.fiveCount} | 4s: {result.handResult.fourCount}
                        <br/>
                        3s: {result.handResult.threeCount} | 2s: {result.handResult.twoCount} | 1s: {result.handResult.oneCount}
                      </div>

                      {/* Non-role badge */}
                      {revealStage >= 2 && (
                        <div className="flex gap-1 justify-center flex-wrap mb-2">
                          <Badge variant="default" className="text-xs">Non-Role</Badge>
                        </div>
                      )}

                      {/* Show final payout */}
                      {revealStage >= 2 && (
                        <div className="text-center">
                          <div className="text-xl font-bold text-green-400">
                            {formatGoldCoinsCompact(result.payout)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
        
        {/* Role Assignments - Animated Sequential Reveal */}
        {revealStage >= 2 && (
          <div className="bg-slate-800 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-bold text-amber-400 mb-4 text-center">⚓ Role Winners</h3>
            <div className="space-y-4">
              
              {/* Ship - Revealed first */}
              <div className={`
                p-4 rounded-lg border-2 transition-all duration-1000 transform
                ${revealStage >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                ${shipWinner ? 'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20' : 'border-slate-600 bg-slate-900/50 opacity-60'}
              `} style={{ transitionDelay: '200ms' }}>
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-400 mb-2">🚢 Ship (50%)</div>
                  <div className={`text-2xl font-bold mb-1 ${shipWinner ? 'text-yellow-300' : 'text-slate-500'}`}>
                    {shipWinner?.name || 'VACANT'}
                  </div>
                  {shipWinner && (
                    <div className="flex gap-0.5 justify-center mb-2 px-2">
                      {(() => {
                        const seat = seats.find(s => s?.playerId === shipWinner.playerId)
                        return seat?.dice.map((die: any, i: number) => (
                          <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-4px' : '0' }}>
                            <Die value={die.value as 1|2|3|4|5|6} locked={true} size="sm" />
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                  {!shipWinner && roleTies?.ship && (
                    <div className="text-sm text-amber-400">
                      Tied: {roleTies.ship.map(p => p.name).join(' & ')} ({roleTies.ship[0].count} sixes each)
                    </div>
                  )}
                  <div className="text-lg text-emerald-300">{formatGoldCoinsCompact(Math.floor(pot * 0.5))}</div>
                </div>
              </div>

              {/* Captain - Revealed second */}
              <div className={`
                p-4 rounded-lg border-2 transition-all duration-1000 transform
                ${revealStage >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                ${captainWinner ? 'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20' : 'border-slate-600 bg-slate-900/50 opacity-60'}
              `} style={{ transitionDelay: '800ms' }}>
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-400 mb-2">👨‍✈️ Captain (30%)</div>
                  <div className={`text-2xl font-bold mb-1 ${captainWinner ? 'text-yellow-300' : 'text-slate-500'}`}>
                    {captainWinner?.name || 'VACANT'}
                  </div>
                  {captainWinner && (
                    <div className="flex gap-0.5 justify-center mb-2 px-2">
                      {(() => {
                        const seat = seats.find(s => s?.playerId === captainWinner.playerId)
                        return seat?.dice.map((die: any, i: number) => (
                          <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-4px' : '0' }}>
                            <Die value={die.value as 1|2|3|4|5|6} locked={true} size="sm" />
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                  {!captainWinner && roleTies?.captain && (
                    <div className="text-sm text-amber-400">
                      Tied: {roleTies.captain.map(p => p.name).join(' & ')} ({roleTies.captain[0].count} fives each)
                    </div>
                  )}
                  <div className="text-lg text-emerald-300">{formatGoldCoinsCompact(Math.floor(pot * 0.3))}</div>
                </div>
              </div>

              {/* Crew - Revealed third */}
              <div className={`
                p-4 rounded-lg border-2 transition-all duration-1000 transform
                ${revealStage >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                ${crewWinner ? 'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20' : 'border-slate-600 bg-slate-900/50 opacity-60'}
              `} style={{ transitionDelay: '1400ms' }}>
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-400 mb-2">👥 Crew (20%)</div>
                  <div className={`text-2xl font-bold mb-1 ${crewWinner ? 'text-yellow-300' : 'text-slate-500'}`}>
                    {crewWinner?.name || 'VACANT'}
                  </div>
                  {crewWinner && (
                    <div className="flex gap-0.5 justify-center mb-2 px-2">
                      {(() => {
                        const seat = seats.find(s => s?.playerId === crewWinner.playerId)
                        return seat?.dice.map((die: any, i: number) => (
                          <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-4px' : '0' }}>
                            <Die value={die.value as 1|2|3|4|5|6} locked={true} size="sm" />
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                  {!crewWinner && roleTies?.crew && (
                    <div className="text-sm text-amber-400">
                      Tied: {roleTies.crew.map(p => p.name).join(' & ')} ({roleTies.crew[0].count} fours each)
                    </div>
                  )}
                  <div className="text-lg text-emerald-300">{formatGoldCoinsCompact(Math.floor(pot * 0.2))}</div>
                </div>
              </div>

            </div>
          </div>
        )}
        
        {/* Vacancy Funnel Display */}
        {revealStage >= 2 && vacancies.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-bold text-amber-400 mb-4 text-center">⚰️ Vacancy Funnel</h3>
            
            <div className={`
              text-center p-4 rounded-lg border-2 transition-all duration-1000
              ${revealStage >= 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
              border-purple-400 bg-purple-400/10 shadow-lg shadow-purple-400/20
            `} style={{ transitionDelay: '1500ms' }}>
              <div className="text-xl font-bold text-purple-400 mb-2">
                Vacant Roles Detected
              </div>
              <div className="text-sm text-slate-300 mb-2">
                {vacancies.join(', ')} {vacancies.length === 1 ? 'role is' : 'roles are'} unfilled
              </div>
              <div className="text-sm text-slate-400">
                50% of vacant role shares → Cargo Chest
              </div>
            </div>
          </div>
        )}
        
        {/* Final Payouts */}
        {revealStage >= 2 && (
          <div className="bg-slate-800 rounded-lg p-4">
            <h3 className="text-lg font-bold text-green-400 mb-3 text-center">💰 Final Payouts</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {showdownResults.map(result => (
                <div key={result.playerId} className="text-center p-2 bg-slate-700 rounded">
                  <div className="font-bold">{result.name}</div>
                  <div className="text-xl text-green-400">{formatGoldCoinsCompact(result.payout)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}