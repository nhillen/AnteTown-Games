import { getBackendUrl } from '../utils/backendUrl';
import { useState, useEffect } from 'react'
import Button from './ui/Button'
import Panel from './ui/Panel'
import Badge from './ui/Badge'

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
      enabled?: boolean;
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
    multi_role_allowed: boolean;
    combo_kicker: any;
  };
  house: {
    rake_percent: number;
    rake_enabled: boolean;
    rake_cap: number;
  };
  chest: {
    drip_percent: number;
    carryover: boolean;
    unfilled_role_to_chest: number;
    low_rank_triggers: {
      trips: number;
      quads: number;
      yahtzee: number;
    };
    trigger_tiebreak: string;
    payout_display_enabled?: boolean;
  };
  bust_fee: {
    enabled: boolean;
    basis: 'S1' | 'S2' | 'S3' | 'fixed';
    fixed_amount: number;
    to: 'chest' | 'burn';
  };
  advanced: {
    ties: string;
    declare_role: boolean;
    reveal_sequence: number[];
  };
  timing: {
    phase_timers: {
      lock_phase_seconds: number;
      betting_phase_seconds: number;
      turn_timeout_seconds: number;
    };
    delays: {
      auto_start_seconds: number;
      payout_display_seconds: number;
      showdown_display_seconds: number;
      hand_end_seconds: number;
      countdown_seconds: number;
    };
    session: {
      max_age_days: number;
      reconnect_timeout_minutes: number;
      disconnect_action_timeout_seconds: number;
      disconnect_fold_timeout_seconds: number;
      disconnect_kick_timeout_minutes: number;
    };
  };
  display: {
    history: {
      max_hands_stored: number;
      recent_display_count: number;
    };
  };
  presets: Record<string, any>;
}

interface ConfigManagerProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

const BACKEND_URL = getBackendUrl()

// Configuration explanations
const CONFIG_EXPLANATIONS = {
  tableSettings: "Core table parameters that control player counts and special features like the cargo chest grace period for new players.",
  bettingConfig: "Betting structures including street values (S1/S2/S3), ante systems, and edge pricing tiers that make trailing players pay less to call.",
  edgeTiers: "Dynamic call pricing system: Behind players get discounts on calls (not raises). Behind 50%, Co-leaders 75%, Leaders 100%, Dominant 125%. Players who are behind in role races pay less to stay in the hand, creating comeback opportunities.",
  rolePayouts: "Percentage of the pot awarded to each role winner. Ship (6s) gets the biggest share, followed by Captain (5s), then Crew (4s). Remaining goes to best Cargo (1s/2s/3s).",
  houseConfig: "House rake system - the percentage of each pot that goes to the house as profit, capped at a maximum amount per hand. This is separate from the cargo chest drip.",
  chestConfig: "Progressive jackpot system where a percentage of all wagers feeds a cargo chest. Players with low dice combinations can trigger bonus payouts from this chest.",
  bustFee: "Penalty for folding. 'Basis' determines fee amount: S1/S2/S3 (uses street value), 'fixed' (uses fixed amount below). When 'fixed' is selected, the fixed amount field sets the penalty. Destination: 'chest' (adds to progressive jackpot) or 'burn' (removes money from game).",
  s3Multiplier: "River betting multiplier - set to 2x or 3x to create bigger final pots and more dramatic showdowns.",
  tiebreakMethod: "Method for resolving ties when multiple players have cargo chest triggers. Available options: 'rank_then_time' (best combination wins, then earliest timestamp), 'time_then_rank' (earliest timestamp wins, then best combination). Future options: 'split' and 'rank_then_split' (split chest among tied players) - Not Yet Implemented.",
  anteMode: "Ante system options: 'none' (no ante), 'per_player' (each player antes the amount below), 'button' (only button antes), 'every_nth' (ante every N hands). The ante amount is in gold coins (pennies) and is configured separately and is automatically used when mode is not 'none'.",
  advancedConfig: "Advanced game mechanics including tie resolution methods, role declaration requirements, and dice reveal sequences that affect gameplay flow and strategy.",
  timingConfig: "Time limits and delays that control the pace of the game, including phase timers for player actions, auto-advance delays, and disconnection handling timeouts.",
  displayConfig: "Interface settings that control how much game history is stored and displayed to players, affecting memory usage and player experience.",
  tiesResolution: "How to handle ties in role assignment: 'split_share' (divide pot - Not Implemented), 'reroll_one_die' (each tied player rerolls one die - Not Implemented), 'earliest_leader_priority' (first to achieve wins - Not Implemented). Currently all ties default to earliest timestamp.",
  cargoChestLearningMode: "Cargo chest stamp requirement enforcement. Options: 'Grace Period' (disabled/false) - new tables allow payouts even without stamps, 'Strict' (enabled/true) - players need minimum stamps to be eligible for cargo chest payouts.",
  dominantThreshold: "Number of roles a player must control to be considered 'dominant' for edge tier betting multipliers. If a player has this many roles or more, they get the dominant multiplier (125%) instead of leader multiplier (100%).",
  betRounding: "Minimum bet increment for rounding. All bets are rounded to the nearest multiple of this amount. Set to $0 to disable rounding (allows any bet amount). For example, with $1 rounding, bets are rounded to whole dollars.",
  streets: "The base betting amounts for each of the three betting rounds. S1 is the first round bet, S2 is the second round bet, S3 is the final round bet. These create escalating stakes throughout the hand."
}

// Dotted underline hyperlink component with tooltip
function TooltipLink({ tooltipKey, children, activeTooltip, setActiveTooltip, className = "" }: {
  tooltipKey: string;
  children: React.ReactNode;
  activeTooltip: string | null;
  setActiveTooltip: (key: string | null) => void;
  className?: string;
}) {
  const isActive = activeTooltip === tooltipKey;
  
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setActiveTooltip(isActive ? null : tooltipKey)}
        className={`border-b-2 border-dotted border-blue-400 hover:border-blue-300 transition-colors cursor-pointer bg-transparent p-0 ${className}`}
        title="Click for explanation"
      >
        {children}
      </button>
      {isActive && (
        <div className="absolute top-6 left-0 z-50 bg-slate-900 border border-slate-600 rounded-lg p-4 shadow-xl w-[500px] max-w-none text-sm text-gray-200">
          <div className="relative">
            {CONFIG_EXPLANATIONS[tooltipKey as keyof typeof CONFIG_EXPLANATIONS]}
            <button
              onClick={() => setActiveTooltip(null)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-slate-700 rounded-full text-gray-400 hover:text-white text-xs flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Info button component with tooltip - kept for headers
function InfoButton({ tooltipKey, activeTooltip, setActiveTooltip }: {
  tooltipKey: string;
  activeTooltip: string | null;
  setActiveTooltip: (key: string | null) => void;
}) {
  const isActive = activeTooltip === tooltipKey;
  
  return (
    <div className="relative">
      <button
        onClick={() => setActiveTooltip(isActive ? null : tooltipKey)}
        className="ml-2 w-4 h-4 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center hover:bg-blue-500 transition-colors"
        title="Click for explanation"
      >
        ℹ️
      </button>
      {isActive && (
        <div className="absolute top-6 left-0 z-50 bg-slate-900 border border-slate-600 rounded-lg p-4 shadow-xl w-[500px] max-w-none text-sm text-gray-200">
          <div className="relative">
            {CONFIG_EXPLANATIONS[tooltipKey as keyof typeof CONFIG_EXPLANATIONS]}
            <button
              onClick={() => setActiveTooltip(null)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-slate-700 rounded-full text-gray-400 hover:text-white text-xs flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfigManager({ isOpen, onClose, isAdmin = false }: ConfigManagerProps) {
  const [config, setConfig] = useState<TableConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'viewer' | 'presets'>('viewer')
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const [editedConfig, setEditedConfig] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Load config on open
  useEffect(() => {
    if (isOpen) {
      loadConfig()
    }
  }, [isOpen])

  const loadConfig = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${BACKEND_URL}/api/config`)
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`)
      }
      const configData = await response.json()
      setConfig(configData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const toggleConfigSetting = async (path: string[], newValue: any, successMessage: string) => {
    if (!config) return;

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      // Create a deep clone of the config
      const updatedConfig = JSON.parse(JSON.stringify(config));

      // Navigate to the correct path and update the value
      let current: any = updatedConfig;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = newValue;

      // Save the updated config
      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      })

      if (!response.ok) {
        throw new Error(`Failed to update config: ${response.statusText}`)
      }

      const result = await response.json()
      setConfig(result.config)
      setSuccess(successMessage)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting')
    } finally {
      setLoading(false)
    }
  }

  const toggleRake = () => {
    const newValue = !config?.house.rake_enabled;
    toggleConfigSetting(['house', 'rake_enabled'], newValue, `Rake ${newValue ? 'enabled' : 'disabled'}`);
  }

  const toggleBustFee = () => {
    const newValue = !config?.bust_fee.enabled;
    toggleConfigSetting(['bust_fee', 'enabled'], newValue, `Bust Fee ${newValue ? 'enabled' : 'disabled'}`);
  }

  const toggleEdgeTiers = () => {
    const newValue = !config?.betting.edge_tiers.enabled;
    toggleConfigSetting(['betting', 'edge_tiers', 'enabled'], newValue, `Edge Tiers ${newValue ? 'enabled' : 'disabled'}`);
  }

  const toggleAI = () => {
    if (!config) return;

    // AI is "enabled" when targetTotalPlayers > minHumanPlayers
    const aiEnabled = config.table.targetTotalPlayers > config.table.minHumanPlayers;

    // Toggle: if AI is enabled, set target to min (disable AI), otherwise set to 8 (enable AI)
    const newValue = aiEnabled ? config.table.minHumanPlayers : 8;
    toggleConfigSetting(['table', 'targetTotalPlayers'], newValue, `AI players ${aiEnabled ? 'disabled' : 'enabled'}`);
  }

  const saveEditedConfig = async () => {
    if (!editedConfig.trim()) return;
    
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      // First validate the JSON
      let parsedConfig;
      try {
        parsedConfig = JSON.parse(editedConfig);
      } catch (parseError) {
        throw new Error('Invalid JSON format');
      }

      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsedConfig),
      })
      if (!response.ok) {
        throw new Error(`Failed to save config: ${response.statusText}`)
      }
      const result = await response.json()
      setConfig(result.config)
      setIsEditing(false)
      setSuccess('Configuration saved successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  const startEditing = () => {
    if (config) {
      setEditedConfig(JSON.stringify(config, null, 2))
      setIsEditing(true)
    }
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditedConfig('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-75" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-white">⚙️ Configuration Manager</h2>
            {config && (
              <p className="text-sm text-gray-400">
                Version {config?._metadata.version} • Last modified: {new Date(config?._metadata.lastModified).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none p-1"
          >
            ×
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mx-6 mt-4 bg-red-600 text-white px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 bg-green-600 text-white px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-700 px-6">
          <button
            onClick={() => setActiveTab('viewer')}
            className={`px-4 py-3 font-medium text-sm border-b-2 ${
              activeTab === 'viewer'
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            📄 {isAdmin ? 'Config Viewer' : 'Table Configuration'}
          </button>
          {(() => { console.log('🔧 Admin section check: isAdmin =', isAdmin); return isAdmin; })() && (
            <button
              onClick={() => setActiveTab('presets')}
              className={`px-4 py-3 font-medium text-sm border-b-2 ${
                activeTab === 'presets'
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              🎯 Quick Presets
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-white">Loading...</div>
            </div>
          )}

          {(() => { console.log('🔧 Tab check: activeTab =', activeTab, 'config =', !!config, 'loading =', loading); return activeTab === 'viewer' && config && !loading; })() && (
            <div className="space-y-6">
              {/* Config Sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Table Settings */}
                <Panel title={
                  <div className="flex items-center">
                    🏴‍☠️ Table Settings
                    <InfoButton tooltipKey="tableSettings" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Min Human Players:</span>
                      <Badge>{config?.table.minHumanPlayers}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Target Total Players:</span>
                      <Badge>{config?.table.targetTotalPlayers}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Seats:</span>
                      <Badge>{config?.table.maxSeats}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <TooltipLink tooltipKey="cargoChestLearningMode" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                        <span className="text-gray-400">Cargo Chest Learning Mode:</span>
                      </TooltipLink>
                      <Badge variant={config?.table.cargoChestLearningMode ? "warning" : "success"}>
                        {config?.table.cargoChestLearningMode ? "Strict" : "Grace Period"}
                      </Badge>
                    </div>
                  </div>
                </Panel>

                {/* Betting Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    💰 Betting Configuration
                    <InfoButton tooltipKey="bettingConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-3 text-sm">
                    <div className="space-y-2">
                      <TooltipLink tooltipKey="streets" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                        <span className="text-gray-400 font-medium">Streets:</span>
                      </TooltipLink>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-yellow-400">S1</div>
                          <Badge>{config?.betting.streets.S1}</Badge>
                        </div>
                        <div className="text-center">
                          <div className="text-yellow-400">S2</div>
                          <Badge>{config?.betting.streets.S2}</Badge>
                        </div>
                        <div className="text-center">
                          <div className="text-yellow-400">S3</div>
                          <Badge>{config?.betting.streets.S3}</Badge>
                        </div>
                        <div className="text-center">
                          <TooltipLink tooltipKey="s3Multiplier" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                            <div className="text-yellow-400">Multiplier</div>
                          </TooltipLink>
                          <Badge variant={config?.betting.streets.s3_multiplier === "3x" ? "warning" : "secondary"}>
                            {config?.betting.streets.s3_multiplier}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <TooltipLink tooltipKey="anteMode" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                        <span className="text-gray-400">Ante Mode:</span>
                      </TooltipLink>
                      <Badge variant={config?.betting.ante.mode === "none" ? "secondary" : "info"}>
                        {config?.betting.ante.mode}
                      </Badge>
                    </div>
                    {config?.betting.ante.mode !== "none" && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Ante Amount:</span>
                        <Badge>{config?.betting.ante.amount} 🪙</Badge>
                      </div>
                    )}
                    {config?.betting.ante.mode === "every_nth" && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Every N Hands:</span>
                        <Badge>{config?.betting.ante.every_nth}</Badge>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <TooltipLink tooltipKey="betRounding" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                        <span className="text-gray-400">Bet Rounding:</span>
                      </TooltipLink>
                      <Badge>${config?.betting.rounding}</Badge>
                    </div>
                  </div>
                </Panel>

                {/* Edge Tiers */}
                <Panel title={
                  <div className="flex items-center">
                    📊 Edge Tiers
                    <InfoButton tooltipKey="edgeTiers" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Edge Tiers Enabled:</span>
                      <Badge variant={(config?.betting.edge_tiers.enabled ?? true) ? "success" : "secondary"}>
                        {(config?.betting.edge_tiers.enabled ?? true) ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className={(config?.betting.edge_tiers.enabled ?? true) ? "" : "opacity-50"}>
                      <div className="flex justify-between">
                        <span className="text-red-400">Behind:</span>
                        <Badge>{((config?.betting.edge_tiers.behind ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-400">Co-leader:</span>
                        <Badge>{((config?.betting.edge_tiers.co ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-400">Leader:</span>
                        <Badge>{((config?.betting.edge_tiers.leader ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-400">Dominant:</span>
                        <Badge>{((config?.betting.edge_tiers.dominant ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="flex justify-between">
                        <TooltipLink tooltipKey="dominantThreshold" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                          <span className="text-gray-400">Dominant Threshold:</span>
                        </TooltipLink>
                        <Badge>{config?.betting.dominant_threshold} roles</Badge>
                      </div>
                    </div>
                  </div>
                </Panel>

                {/* Role Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    🎯 Role Configuration
                    <InfoButton tooltipKey="rolePayouts" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-3 text-sm">
                    <div className="space-y-2">
                      <span className="text-gray-400 font-medium">Requirements:</span>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-yellow-400">Ship (6s)</div>
                          <Badge>{config?.payouts.role_requirements?.ship ?? 1}+ dice</Badge>
                        </div>
                        <div className="text-center">
                          <div className="text-blue-400">Captain (5s)</div>
                          <Badge>{config?.payouts.role_requirements?.captain ?? 1}+ dice</Badge>
                        </div>
                        <div className="text-center">
                          <div className="text-green-400">Crew (4s)</div>
                          <Badge>{config?.payouts.role_requirements?.crew ?? 1}+ dice</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-gray-400 font-medium">Payouts:</span>
                      <div className="flex justify-between">
                        <span className="text-yellow-400">Ship (6s):</span>
                        <Badge>{((config?.payouts.role_payouts.ship ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-400">Captain (5s):</span>
                        <Badge>{((config?.payouts.role_payouts.captain ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-400">Crew (4s):</span>
                        <Badge>{((config?.payouts.role_payouts.crew ?? 0) * 100).toFixed(0)}%</Badge>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Multi-role Allowed:</span>
                      <Badge variant={config?.payouts.multi_role_allowed ? "success" : "secondary"}>
                        {config?.payouts.multi_role_allowed ? "Yes" : "No"}
                      </Badge>
                    </div>
                    {config?.payouts.combo_kicker && (
                      <div className="space-y-2">
                        <span className="text-gray-400 font-medium">Combo Kickers:</span>
                        {config.payouts.combo_kicker.ship_captain && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Ship + Captain:</span>
                            <Badge>{((config.payouts.combo_kicker.ship_captain) * 100).toFixed(0)}%</Badge>
                          </div>
                        )}
                        {config.payouts.combo_kicker.all_three && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">All Three Roles:</span>
                            <Badge>{((config.payouts.combo_kicker.all_three) * 100).toFixed(0)}%</Badge>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Panel>

                {/* House Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    🏛️ House Configuration
                    <InfoButton tooltipKey="houseConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rake Enabled:</span>
                      <Badge variant={config?.house.rake_enabled ? "warning" : "secondary"}>
                        {config?.house.rake_enabled ? "Yes" : "No"}
                      </Badge>
                    </div>
                    {config?.house.rake_enabled && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Rake Percentage:</span>
                          <Badge>{(config?.house.rake_percent * 100).toFixed(0)}%</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Maximum Rake per Hand:</span>
                          <Badge>${((config?.house.rake_cap ?? 1000) / 100).toFixed(2)}</Badge>
                        </div>
                      </>
                    )}
                  </div>
                </Panel>

                {/* Chest Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    📦 Chest Configuration
                    <InfoButton tooltipKey="chestConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Drip to Chest:</span>
                      <Badge>{((config?.chest.drip_percent ?? 0) * 100).toFixed(0)}%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Carryover:</span>
                      <Badge variant={config?.chest.carryover ? "success" : "secondary"}>
                        {config?.chest.carryover ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Unfilled → Chest:</span>
                      <Badge>{((config?.chest.unfilled_role_to_chest ?? 0) * 100).toFixed(0)}%</Badge>
                    </div>
                  </div>
                </Panel>

                {/* Chest Payout Triggers */}
                <Panel title={
                  <div className="flex items-center">
                    🏆 Chest Payout Triggers
                    <InfoButton tooltipKey="chestConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="text-gray-400 font-medium mb-2">Low Dice Combinations:</div>
                    <div className="flex justify-between">
                      <span className="text-yellow-400">Trips (3 of a kind):</span>
                      <Badge>{((config?.chest.low_rank_triggers.trips ?? 0) * 100).toFixed(0)}% of chest</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-400">Quads (4 of a kind):</span>
                      <Badge>{((config?.chest.low_rank_triggers.quads ?? 0) * 100).toFixed(0)}% of chest</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-400">Yahtzee (5 of a kind):</span>
                      <Badge>{((config?.chest.low_rank_triggers.yahtzee ?? 0) * 100).toFixed(0)}% of chest</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <TooltipLink tooltipKey="tiebreakMethod" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                        <span className="text-gray-400">Tiebreak Method:</span>
                      </TooltipLink>
                      <Badge variant="info">{config?.chest.trigger_tiebreak.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                </Panel>

                {/* Bust Fee */}
                <Panel title={
                  <div className="flex items-center">
                    💥 Bust Fee
                    <InfoButton tooltipKey="bustFee" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Enabled:</span>
                      <Badge variant={config?.bust_fee.enabled ? "warning" : "secondary"}>
                        {config?.bust_fee.enabled ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className={config?.bust_fee.enabled ? "" : "opacity-50"}>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Basis:</span>
                        <Badge>{config?.bust_fee.basis}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Fixed Amount:</span>
                        <Badge>{config?.bust_fee.fixed_amount} pennies</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Destination:</span>
                        <Badge>{config?.bust_fee.to}</Badge>
                      </div>
                    </div>
                  </div>
                </Panel>

                {/* Advanced Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    ⚙️ Advanced Configuration
                    <InfoButton tooltipKey="advancedConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <TooltipLink tooltipKey="tiesResolution" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}>
                        <span className="text-gray-400">Ties Resolution:</span>
                      </TooltipLink>
                      <Badge variant="secondary">{config?.advanced.ties.replace('_', ' ')} (Not Implemented)</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Declare Role Required:</span>
                      <Badge variant="secondary">
                        {config?.advanced.declare_role ? "Yes" : "No"} (Not Implemented)
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Reveal Sequence:</span>
                      <Badge variant="secondary">[{config?.advanced.reveal_sequence.join(', ')}] (Not Implemented)</Badge>
                    </div>
                  </div>
                </Panel>

                {/* Timing Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    ⏱️ Timing Configuration
                    <InfoButton tooltipKey="timingConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-3 text-sm">
                    <div className="space-y-2">
                      <span className="text-gray-400 font-medium">Phase Timers:</span>
                      <div className="flex justify-between">
                        <span className="text-blue-400">Lock Phase:</span>
                        <Badge>{config?.timing.phase_timers.lock_phase_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-400">Betting Phase:</span>
                        <Badge>{config?.timing.phase_timers.betting_phase_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-400">Turn Timeout:</span>
                        <Badge>{config?.timing.phase_timers.turn_timeout_seconds}s</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-gray-400 font-medium">Game Delays:</span>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Auto Start:</span>
                        <Badge>{config?.timing.delays.auto_start_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Payout Display:</span>
                        <Badge>{config?.timing.delays.payout_display_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Showdown Display:</span>
                        <Badge>{config?.timing.delays.showdown_display_seconds ?? 8}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Hand End:</span>
                        <Badge>{config?.timing.delays.hand_end_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Countdown:</span>
                        <Badge>{config?.timing.delays.countdown_seconds}s</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-gray-400 font-medium">Session Management:</span>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Max Age:</span>
                        <Badge>{config?.timing.session.max_age_days} days</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Reconnect Timeout:</span>
                        <Badge>{config?.timing.session.reconnect_timeout_minutes}m</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Disconnect Action:</span>
                        <Badge>{config?.timing.session.disconnect_action_timeout_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Disconnect Fold:</span>
                        <Badge>{config?.timing.session.disconnect_fold_timeout_seconds}s</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Disconnect Kick:</span>
                        <Badge>{config?.timing.session.disconnect_kick_timeout_minutes}m</Badge>
                      </div>
                    </div>
                  </div>
                </Panel>

                {/* Display Configuration */}
                <Panel title={
                  <div className="flex items-center">
                    📺 Display Configuration
                    <InfoButton tooltipKey="displayConfig" activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                }>
                  <div className="space-y-2 text-sm">
                    <div className="space-y-2">
                      <span className="text-gray-400 font-medium">History Settings:</span>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Max Hands Stored:</span>
                        <Badge>{config?.display.history.max_hands_stored}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Recent Display Count:</span>
                        <Badge>{config?.display.history.recent_display_count}</Badge>
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* Raw JSON Editor - Admin Only */}
              {(() => { console.log('🔧 Admin section check: isAdmin =', isAdmin); return isAdmin; })() && (
                <Panel title="🔍 Raw Configuration Editor">
                  <div className="space-y-3">
                    <div className="flex gap-3 mb-3">
                      <Button onClick={startEditing} variant="secondary" disabled={loading}>
                        ✏️ Edit JSON
                      </Button>
                    </div>
                    {isEditing && (
                      <>
                        <div className="flex gap-3 mb-3">
                          <Button onClick={saveEditedConfig} variant="primary" disabled={loading}>
                            💾 Save Changes
                          </Button>
                          <Button onClick={cancelEditing} variant="secondary" disabled={loading}>
                            ❌ Cancel
                          </Button>
                        </div>
                        <textarea
                          value={editedConfig}
                          onChange={(e) => setEditedConfig(e.target.value)}
                          className="w-full h-60 text-xs bg-slate-900 p-4 rounded text-gray-300 font-mono resize-none border border-slate-600 focus:border-blue-400 focus:outline-none"
                          placeholder="Edit configuration JSON..."
                        />
                      </>
                    )}
                  </div>
                </Panel>
              )}
            </div>
          )}

          {activeTab === 'presets' && !loading && config && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-900/30 border border-blue-600/50 rounded mb-4">
                <p className="text-sm text-blue-300">
                  💡 Quick toggles for common table settings. Changes take effect immediately.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Rake Toggle */}
                <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-white">🏦 House Rake</h3>
                      <p className="text-sm text-gray-300 mt-1">
                        {config.house.rake_enabled
                          ? `${config.house.rake_percent}% rake (cap: $${(config.house.rake_cap / 100).toFixed(2)})`
                          : 'No rake collected'}
                      </p>
                    </div>
                    <Badge variant={config.house.rake_enabled ? 'success' : 'secondary'}>
                      {config.house.rake_enabled ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <Button
                    onClick={toggleRake}
                    variant={config.house.rake_enabled ? 'warning' : 'primary'}
                    size="sm"
                    className="w-full"
                    disabled={loading}
                  >
                    {config.house.rake_enabled ? 'Disable Rake' : 'Enable Rake'}
                  </Button>
                </div>

                {/* Bust Fee Toggle */}
                <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-white">💥 Bust Fee</h3>
                      <p className="text-sm text-gray-300 mt-1">
                        {config.bust_fee.enabled
                          ? `Penalty for folding (${config.bust_fee.basis})`
                          : 'No penalty for folding'}
                      </p>
                    </div>
                    <Badge variant={config.bust_fee.enabled ? 'success' : 'secondary'}>
                      {config.bust_fee.enabled ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <Button
                    onClick={toggleBustFee}
                    variant={config.bust_fee.enabled ? 'warning' : 'primary'}
                    size="sm"
                    className="w-full"
                    disabled={loading}
                  >
                    {config.bust_fee.enabled ? 'Disable Bust Fee' : 'Enable Bust Fee'}
                  </Button>
                </div>

                {/* Edge Tiers Toggle */}
                <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-white">📊 Edge Tiers</h3>
                      <p className="text-sm text-gray-300 mt-1">
                        {config.betting.edge_tiers.enabled
                          ? 'Position-based bet pricing'
                          : 'Flat bet pricing'}
                      </p>
                    </div>
                    <Badge variant={config.betting.edge_tiers.enabled ? 'success' : 'secondary'}>
                      {config.betting.edge_tiers.enabled ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <Button
                    onClick={toggleEdgeTiers}
                    variant={config.betting.edge_tiers.enabled ? 'warning' : 'primary'}
                    size="sm"
                    className="w-full"
                    disabled={loading}
                  >
                    {config.betting.edge_tiers.enabled ? 'Disable Edge Tiers' : 'Enable Edge Tiers'}
                  </Button>
                </div>

                {/* AI Players Toggle */}
                <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-white">🤖 AI Players</h3>
                      <p className="text-sm text-gray-300 mt-1">
                        {config.table.targetTotalPlayers > config.table.minHumanPlayers
                          ? `Fill table to ${config.table.targetTotalPlayers} players`
                          : 'Only human players'}
                      </p>
                    </div>
                    <Badge variant={config.table.targetTotalPlayers > config.table.minHumanPlayers ? 'success' : 'secondary'}>
                      {config.table.targetTotalPlayers > config.table.minHumanPlayers ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <Button
                    onClick={toggleAI}
                    variant={config.table.targetTotalPlayers > config.table.minHumanPlayers ? 'warning' : 'primary'}
                    size="sm"
                    className="w-full"
                    disabled={loading}
                  >
                    {config.table.targetTotalPlayers > config.table.minHumanPlayers ? 'Disable AI' : 'Enable AI'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}