import { useState, useEffect } from 'react'
import Panel from './ui/Panel'
import Button from './ui/Button'
import { getBackendUrl } from '../utils/backendUrl';

interface TableRequirements {
  minimumTableStack: number;
  requiredTableStack: number;
  tableMinimumMultiplier: number;
  breakdown: {
    anteEnabled: boolean;
    anteAmount: number;
    anteProgressive: boolean;
    anteStreetMultiplier: number;
    streetsEnabled: boolean;
    s1: number;
    s2: number;
    s3: number;
    bustFeeEnabled: boolean;
    bustFeeBasis: string;
    edgeTiersEnabled: boolean;
    edgeTiers: {
      behind: number;
      co: number;
      leader: number;
      dominant: number;
    };
    dominantThreshold: number;
  };
}

export default function GameRules() {
  const [isOpen, setIsOpen] = useState(false)
  const [tableConfig, setTableConfig] = useState<TableRequirements | null>(null)

  useEffect(() => {
    // Fetch table configuration when component mounts
    const fetchTableConfig = async () => {
      try {
        const BACKEND_URL = getBackendUrl()
        const response = await fetch(`${BACKEND_URL}/api/table-requirements`)
        if (response.ok) {
          const config = await response.json()
          setTableConfig(config)
        }
      } catch (error) {
        console.error('Failed to fetch table configuration:', error)
      }
    }

    fetchTableConfig()
  }, [])

  // Helper functions for dynamic content
  const getAnteInfo = () => {
    if (!tableConfig?.breakdown.anteEnabled) return "No ante required"

    if (tableConfig.breakdown.anteProgressive) {
      const baseAmount = tableConfig.breakdown.anteAmount
      const multiplier = tableConfig.breakdown.anteStreetMultiplier
      return `Progressive: $${baseAmount} → $${baseAmount + multiplier} → $${baseAmount + 2 * multiplier}`
    } else {
      return `$${tableConfig.breakdown.anteAmount} per hand`
    }
  }

  const getTableMinimumInfo = () => {
    if (!tableConfig) return ""
    return `Minimum table stack: $${tableConfig.minimumTableStack.toFixed(2)} | Required to sit: $${tableConfig.requiredTableStack.toFixed(2)}`
  }

  const getBettingInfo = () => {
    if (!tableConfig?.breakdown.streetsEnabled) return "No betting limits"
    const { s1, s2, s3 } = tableConfig.breakdown
    return `Street limits: $${s1} → $${s2} → $${s3}`
  }

  return (
    <>
      <Button 
        variant="ghost" 
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-30"
      >
        📖 Rules
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-4 lg:inset-20 bg-slate-800 rounded-lg shadow-2xl z-50 overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-emerald-400">Pirate Plunder - Game Rules</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-slate-700 rounded"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6 text-slate-300">
                <Panel title="🎯 Objective" border="emerald">
                  <p>Roll dice to claim one of three roles (Ship, Captain, or Crew) and win a share of the pot!</p>
                </Panel>

                <Panel title="🎲 Game Flow">
                  <div className="space-y-3">
                    <ol className="list-decimal list-inside space-y-2">
                      <li><strong>Table Requirements:</strong> {getTableMinimumInfo()}</li>
                      <li><strong>Ante:</strong> {getAnteInfo()}</li>
                      <li><strong>Three Rounds:</strong> Each with rolling, locking, and betting phases</li>
                      <li><strong>Roll & Lock:</strong> Roll 5 dice, lock at least 1 die each round</li>
                      <li><strong>Bet:</strong> Poker-style betting after each lock phase</li>
                      <li><strong>Showdown:</strong> Roles assigned based on locked dice</li>
                      <li><strong>Payout:</strong> Pot split according to roles and cargo</li>
                    </ol>
                    {tableConfig && (
                      <div className="text-sm text-slate-400 bg-slate-700/50 p-3 rounded">
                        <strong>Current Table Settings:</strong><br/>
                        • Betting: {getBettingInfo()}<br/>
                        {tableConfig.breakdown.bustFeeEnabled && (
                          <>• Bust Fee: Enabled (basis: {tableConfig.breakdown.bustFeeBasis})<br/></>
                        )}
                        • Table Minimum Multiplier: {tableConfig.tableMinimumMultiplier}x
                      </div>
                    )}
                  </div>
                </Panel>

                <Panel title="👑 Roles & Payouts">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span><strong className="text-yellow-400">Ship</strong> (Most 6s locked):</span>
                      <span className="text-emerald-400">40% of pot*</span>
                    </div>
                    <div className="flex justify-between">
                      <span><strong className="text-blue-400">Captain</strong> (Most 5s locked):</span>
                      <span className="text-emerald-400">30% of pot*</span>
                    </div>
                    <div className="flex justify-between">
                      <span><strong className="text-purple-400">Crew</strong> (Most 4s locked):</span>
                      <span className="text-emerald-400">20% of pot*</span>
                    </div>
                    <div className="flex justify-between">
                      <span><strong className="text-gray-400">Non-roles</strong>:</span>
                      <span className="text-emerald-400">10% of pot* (split)</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      *Payout percentages are configurable and may vary by table
                    </p>
                  </div>
                </Panel>

                <Panel title="📦 Cargo Twist">
                  <p className="mb-3">All remaining 1s, 2s, and 3s from active players form the "cargo". The most common cargo die affects payouts:</p>
                  <div className="space-y-2 pl-4">
                    <div>
                      <strong className="text-red-400">Mostly 1s:</strong> Non-role players split 50% of Crew's share
                    </div>
                    <div>
                      <strong className="text-orange-400">Mostly 2s:</strong> Captain takes Crew's entire share
                    </div>
                    <div>
                      <strong className="text-yellow-400">Mostly 3s:</strong> Crew takes 50% of Captain's share
                    </div>
                  </div>
                </Panel>

                <Panel title="🔒 Locking Rules">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Round 1: Lock at least 1 die.</li>
                    <li>Round 2: Lock at least 2 dice total.</li>
                    <li>Round 3: Lock at least 3 dice total.</li>
                    <li>Reveal rule: Before betting each round, reveal exactly the minimum locked dice (R1=1, R2=2, R3=3). You may lock more; extra locks stay hidden.</li>
                    <li>Locking: A locked die skips the next roll; after that roll you may unlock it and roll it again. Only unlocked dice roll.</li>
                    <li>Showdown: All dice are shown at showdown.</li>
                  </ul>
                </Panel>

                <Panel title="⚔️ Edge Tiers - Dynamic Betting Multipliers">
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400">
                      Edge Tiers adjust betting limits based on your position in the pot. Players with more chips at risk get favorable multipliers.
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span><strong className="text-red-400">Behind</strong> (lowest pot contribution):</span>
                        <span className="text-emerald-400">{tableConfig?.breakdown.edgeTiers?.behind || 0.5}x multiplier</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong className="text-yellow-400">Co-Pilot</strong> (moderate contribution):</span>
                        <span className="text-emerald-400">{tableConfig?.breakdown.edgeTiers?.co || 0.75}x multiplier</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong className="text-blue-400">Leader</strong> (highest contribution):</span>
                        <span className="text-emerald-400">{tableConfig?.breakdown.edgeTiers?.leader || 1}x multiplier</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span><strong className="text-purple-400">Dominant</strong> (≥{tableConfig?.breakdown.dominantThreshold || 2}x others):</span>
                        <span className="text-emerald-400">{tableConfig?.breakdown.edgeTiers?.dominant || 1.25}x multiplier</span>
                      </div>
                    </div>

                    <div className="text-sm text-slate-400 bg-slate-700/50 p-3 rounded">
                      <strong>How it works:</strong><br/>
                      • Your tier is based on how much you've contributed to the pot<br/>
                      • Multipliers apply to the current street's betting limit<br/>
                      • Example: On Street 2 ($3 limit), a Leader (1.0x) can bet $3, while Behind (0.5x) can only bet $1.50<br/>
                      • Dominant tier triggers when your contribution is ≥{tableConfig?.breakdown.dominantThreshold || 2}x the next highest
                      <br/>
                      • <strong>Status:</strong> <span className={tableConfig?.breakdown.edgeTiersEnabled ? "text-green-400" : "text-red-400"}>
                        {tableConfig?.breakdown.edgeTiersEnabled ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>
                  </div>
                </Panel>

                <Panel title="💰 Betting">
                  <div className="space-y-3">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Standard poker betting: Check, Bet, Call, Raise, Fold</li>
                      <li>Folded players forfeit their ante and any bets</li>
                      <li>Three betting rounds (after each lock phase)</li>
                      {tableConfig?.breakdown.streetsEnabled && (
                        <li>Street betting limits: ${tableConfig.breakdown.s1} → ${tableConfig.breakdown.s2} → ${tableConfig.breakdown.s3}</li>
                      )}
                      {tableConfig?.breakdown.bustFeeEnabled && (
                        <li>Bust fee charged to players without roles (basis: {tableConfig.breakdown.bustFeeBasis})</li>
                      )}
                    </ul>

                    {tableConfig && (
                      <div className="text-sm text-slate-400 bg-slate-700/50 p-3 rounded">
                        <strong>Financial Rules:</strong><br/>
                        • Table minimum: $${tableConfig.minimumTableStack.toFixed(2)} (calculated from antes + betting costs)<br/>
                        • Required to sit: $${tableConfig.requiredTableStack.toFixed(2)} ({tableConfig.tableMinimumMultiplier}x minimum)<br/>
                        • Top-up available while seated to move bankroll → table stack<br/>
                        • Auto-standing if insufficient funds at hand start<br/>
                        {tableConfig.breakdown.anteProgressive && (
                          <>• Progressive antes increase each street: {getAnteInfo()}<br/></>
                        )}
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}