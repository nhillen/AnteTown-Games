import { getBackendUrl } from '../utils/backendUrl';
import { useState, useEffect } from 'react'
import Button from './ui/Button'

interface TableConfig {
  _metadata: {
    version: string;
    description: string;
    lastModified: string;
  };
  table: {
    minHumanPlayers: number;
    targetTotalPlayers: number;
    maxSeats: number;
    cargoChestLearningMode: boolean;
  };
  betting: {
    streets: {
      enabled: boolean;
      S1: number;
      S2: number;
      S3: number;
      s3_multiplier: '1x' | '2x' | '3x';
    };
    ante: {
      mode: 'none' | 'per_player' | 'button' | 'every_nth';
      amount: number;
      every_nth: number;
    };
    edge_tiers: {
      enabled: boolean;
      behind: number;
      co: number;
      leader: number;
      dominant: number;
    };
    dominant_threshold: number;
    rounding: number;
  };
  payouts: {
    role_requirements?: {
      ship: number;
      captain: number;
      crew: number;
    };
    role_payouts: {
      ship: number;
      captain: number;
      crew: number;
    };
    multi_role_allowed?: boolean;
  };
  chest: {
    drip_percent: number;
    unfilled_role_to_chest: number;
    carryover: boolean;
    low_rank_triggers: {
      trips: number;
      quads: number;
      yahtzee: number;
    };
  };
  bust_fee: {
    enabled: boolean;
    basis: string;
    fixed_amount: number;
    to: 'chest' | 'house';
  };
  house: {
    rake_percent: number;
    rake_enabled: boolean;
  };
}

const BACKEND_URL = getBackendUrl()

export default function GameLegend() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [config, setConfig] = useState<TableConfig | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${BACKEND_URL}/api/config`)
      if (response.ok) {
        const configData = await response.json()
        setConfig(configData)
      }
    } catch (err) {
      // Failed to load config - will show fallback message
    } finally {
      setLoading(false)
    }
  }

  const getAnteDescription = (ante: TableConfig['betting']['ante']) => {
    switch (ante.mode) {
      case 'none': return 'No ante required'
      case 'per_player': return `Each player pays ${ante.amount} gold ante`
      case 'button': return `Button player pays ${ante.amount} gold ante`
      case 'every_nth': return `Every ${ante.every_nth} hands, all players pay ${ante.amount} gold ante`
      default: return 'Unknown ante mode'
    }
  }

  const formatPercentage = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return '0%'
    return `${(value * 100).toFixed(0)}%`
  }

  return (
    <div className="bg-slate-800/95 backdrop-blur rounded-lg border border-slate-700 shadow-2xl">
      <div className="flex justify-between items-center p-3">
        <h3 className="text-sm font-bold text-emerald-400">Table Configuration</h3>
        <Button 
          onClick={() => setIsExpanded(!isExpanded)}
          variant="ghost" 
          size="sm"
          className="text-xs"
        >
          {isExpanded ? '−' : '+'}
        </Button>
      </div>
      
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 text-xs border-t border-slate-600">
          {loading && (
            <div className="text-slate-400">Loading table configuration...</div>
          )}
          
          {config && (
            <>
              {/* Cargo Chest Configuration */}
              <div>
                <h4 className="text-amber-400 font-semibold mb-1">🏴‍☠️ Cargo Chest Warmup</h4>
                <div className="space-y-1 text-slate-300">
                  <div className="text-slate-400 mb-1">
                    {config.table.cargoChestLearningMode 
                      ? "Strict Mode: Cargo chest triggers are active immediately" 
                      : "Grace Period: New table has time to build up pot before cargo chest triggers activate"
                    }
                  </div>
                  <div>• Drip Rate: <span className="text-green-400">{formatPercentage(config.chest.drip_percent)}</span> of wagers flow into cargo chest</div>
                  <div>• Unfilled Role Bonus: <span className="text-orange-400">{formatPercentage(config.chest.unfilled_role_to_chest)}</span> of unfilled role payouts go to chest</div>
                  <div className="text-slate-500">• <span className="text-yellow-400">Cargo dice</span> are 1s, 2s, and 3s - used for tie-breaking and chest triggers</div>
                </div>
              </div>

              {/* Role Configuration */}
              <div>
                <h4 className="text-amber-400 font-semibold mb-1">🎲 Role Configuration</h4>
                <div className="space-y-1 text-slate-300">
                  <div className="text-slate-400 mb-1">Role assignment and payouts:</div>
                  <div>🚢 <span className="text-blue-400">Ship</span>: Most 6s → <span className="text-green-400">{formatPercentage(config.payouts.role_payouts.ship)}</span> of pot</div>
                  <div>👨‍✈️ <span className="text-purple-400">Captain</span>: Most 5s → <span className="text-green-400">{formatPercentage(config.payouts.role_payouts.captain)}</span> of pot</div>
                  <div>👥 <span className="text-orange-400">Crew</span>: Most 4s → <span className="text-green-400">{formatPercentage(config.payouts.role_payouts.crew)}</span> of pot</div>
                  
                  {config.payouts.role_requirements && (
                    <div className="text-slate-400">• Role Requirements: Ship needs {config.payouts.role_requirements.ship}+ sixes, Captain {config.payouts.role_requirements.captain}+ fives, Crew {config.payouts.role_requirements.crew}+ fours</div>
                  )}
                  <div className="text-slate-500">• Tied for a role → role is unfilled, payout goes to chest ({formatPercentage(config.chest.unfilled_role_to_chest)}) and redistributed</div>
                  {config.payouts.multi_role_allowed && <div className="text-slate-500">• Multi-rolling: Players can win multiple roles if they have the most of each die face</div>}
                </div>
              </div>

              {/* Chest Triggers */}
              <div>
                <h4 className="text-amber-400 font-semibold mb-1">📦 Cargo Chest Triggers</h4>
                <div className="space-y-1 text-slate-300">
                  <div className="text-slate-400 mb-1">Low-rank cargo combinations that trigger chest payouts:</div>
                  <div>• <span className="text-emerald-400">Three of a Kind</span>: {formatPercentage(config.chest.low_rank_triggers.trips)} of chest payout</div>
                  <div>• <span className="text-emerald-400">Four of a Kind</span>: {formatPercentage(config.chest.low_rank_triggers.quads)} of chest payout</div>
                  <div>• <span className="text-emerald-400">Yahtzee (Five of a Kind)</span>: {formatPercentage(config.chest.low_rank_triggers.yahtzee)} of chest payout</div>
                  <div className="text-slate-500">• Chest carries over between hands: {config.chest.carryover ? 'Yes' : 'No'}</div>
                </div>
              </div>


              {/* Bust Fee */}
              {config.bust_fee.enabled && (
                <div>
                  <h4 className="text-amber-400 font-semibold mb-1">💸 Bust Fee</h4>
                  <div className="space-y-1 text-slate-300">
                    <div className="text-slate-400 mb-1">Penalty for reaching showdown with no role:</div>
                    <div>• <strong>Trigger:</strong> You reach showdown and win no role (Ship, Captain, or Crew)</div>
                    <div>• <strong>Amount:</strong> <span className="text-red-400">${config.bust_fee.basis === 'S1' ? config.betting.streets.S1 : config.bust_fee.basis === 'S2' ? config.betting.streets.S2 : config.bust_fee.basis === 'S3' ? config.betting.streets.S3 : config.bust_fee.fixed_amount / 100}</span> ({config.bust_fee.basis}{config.bust_fee.basis.startsWith('S') ? ' street value' : ' fixed'})</div>
                    <div>• <strong>Purpose:</strong> Encourages folding weak holdings on Street 3 instead of "peeling and praying"</div>
                    <div>• <strong>Destination:</strong> <span className="text-green-400">{config.bust_fee.to === 'chest' ? 'Cargo Chest' : 'House Rake'}</span></div>
                  </div>
                </div>
              )}

              {/* Edge Tiers Configuration */}
              {config.betting.edge_tiers.enabled && (
                <div>
                  <h4 className="text-amber-400 font-semibold mb-1">⚔️ Edge Tiers</h4>
                  <div className="space-y-1 text-slate-300">
                    <div className="text-slate-400 mb-1">Dynamic betting multipliers based on pot contribution:</div>
                    <div>• <span className="text-red-400">Behind</span>: {config.betting.edge_tiers.behind}x | <span className="text-yellow-400">Co</span>: {config.betting.edge_tiers.co}x</div>
                    <div>• <span className="text-blue-400">Leader</span>: {config.betting.edge_tiers.leader}x | <span className="text-purple-400">Dominant</span>: {config.betting.edge_tiers.dominant}x (≥{config.betting.dominant_threshold}x others)</div>
                    <div className="text-slate-500">• Players with more at risk get higher betting limits</div>
                  </div>
                </div>
              )}

              {/* Betting Configuration */}
              <div>
                <h4 className="text-amber-400 font-semibold mb-1">🎰 Betting Configuration</h4>
                <div className="space-y-1 text-slate-300">
                  <div>• Ante System: <span className="text-blue-400">{getAnteDescription(config.betting.ante)}</span></div>
                  <div>• <span className={config.betting.streets.enabled ? "text-green-400" : "text-red-400"}>Street Betting Limits</span>: {config.betting.streets.enabled ? "ENABLED" : "DISABLED"}</div>
                  {config.betting.streets.enabled ? (
                    <>
                      <div className="text-slate-400 ml-4">• Base bet: ante amount or 1% of pot (minimum $1.00)</div>
                      <div className="text-slate-400 ml-4">• Round 1: {config.betting.streets.S1}x base | Round 2: {config.betting.streets.S2}x base | Round 3: {config.betting.streets.S3}x base × {config.betting.streets.s3_multiplier}</div>
                    </>
                  ) : (
                    <div className="text-slate-400 ml-4">• Players can bet any amount up to their bankroll</div>
                  )}
                  <div>• <span className={config.betting.edge_tiers.enabled ? "text-green-400" : "text-red-400"}>Edge Tiers</span>: {config.betting.edge_tiers.enabled ? "ENABLED" : "DISABLED"}</div>
                  {config.betting.edge_tiers.enabled ? (
                    <>
                      <div className="text-slate-400 ml-4">• Call discounts based on revealed dice (6s=Ship, 5s=Captain, 4s=Crew):</div>
                      <div className="text-slate-400 ml-4">• Behind: {formatPercentage(config.betting.edge_tiers.behind)} | Co-leader: {formatPercentage(config.betting.edge_tiers.co)} | Leader: {formatPercentage(config.betting.edge_tiers.leader)} | Dominant: {formatPercentage(config.betting.edge_tiers.dominant)}</div>
                    </>
                  ) : (
                    <div className="text-slate-400 ml-4">• All players pay full bet amount to call</div>
                  )}
                </div>
              </div>
              
              {/* House Configuration */}
              <div>
                <h4 className="text-amber-400 font-semibold mb-1">🏛️ House Configuration</h4>
                <div className="space-y-1 text-slate-300">
                  <div>• House Rake: <span className="text-red-400">{config.house.rake_enabled ? formatPercentage(config.house.rake_percent) : 'Disabled'}</span>{config.house.rake_enabled ? ' of each pot goes to the house' : ''}</div>
                  <div>• Table Seats: {config.table.maxSeats} maximum, {config.table.minHumanPlayers} humans minimum, {config.table.targetTotalPlayers} target total</div>
                </div>
              </div>
            </>
          )}

          {!config && !loading && (
            <div className="text-slate-400">Unable to load table configuration</div>
          )}
        </div>
      )}
    </div>
  )
}