import React, { useState, useEffect } from 'react'
import Badge from './ui/Badge'
import { Die } from './Dice'
import Button from './ui/Button'
import ProgressBar from './ProgressBar'
import CenterProgressBar from './CenterProgressBar'
import GameLegend from './GameLegend'
import GameInfo from './GameInfo'
import ShowdownCeremony from './ShowdownCeremony'
import { formatGoldCoinsCompact } from '../utils/currency'
import { TITLES, EMBLEMS } from '../config/cosmetics'


type DieType = { value: number; locked: boolean; isPublic?: boolean }
type Seat = {
  playerId: string
  name: string
  isAI: boolean
  tableStack: number
  dice: DieType[]
  hasFolded: boolean
  lockAllowance: number
  minLocksRequired?: number
  currentBet: number
  isActive?: boolean
  lockingDone: boolean
  hasActed: boolean
  hasPostedAnte?: boolean
  stamps?: { current: number; window: number; eligible: boolean }
  cosmetics?: {
    banner: string
    emblem: string
    title: string
    highSkin: string
    lowSkin: string
  }
}

type GameState = {
  phase: string
  seats: Seat[]
  pot: number
  currentBet: number
  currentTurnPlayerId?: string
  phaseEndsAtMs?: number
  countdownEndsAtMs?: number
  dealerSeatIndex?: number
  showdownResults?: any[]
  allLockingComplete?: boolean
  antePhaseComplete?: boolean
}

type LogEntry = {
  id: string
  timestamp: number
  playerName: string
  action: string
  details?: string
  isAI: boolean
}

type Props = {
  game: GameState | null
  meId: string | null
  userName?: string | null
  onPlayerAction: (action: 'bet' | 'call' | 'raise' | 'fold' | 'check' | 'post_ante', amount?: number) => void
  onLockSelect: (index: number) => void
  onLockDone: () => void
  onSitDown?: (seatIndex: number, buyInAmount: number) => void
  actionLog: LogEntry[]
  setActionLog: React.Dispatch<React.SetStateAction<LogEntry[]>>
  tableConfig?: {
    minHumanPlayers: number
    targetTotalPlayers: number
    betting?: {
      ante?: {
        mode: string
        amount: number
      }
    }
  }
  myCosmetics: {
    banner: string
    emblem: string
    title: string
    highSkin: string
    lowSkin: string
  }
  tableRequirements?: {
    minimumTableStack: number;
    requiredTableStack: number;
    tableMinimumMultiplier: number;
  } | null;
}

function renderStampIndicators(stamps?: { current: number; window: number; eligible: boolean }) {
  if (!stamps) return null;
  
  const indicators = [];
  for (let i = 0; i < stamps.window; i++) {
    // First pip should be green when filled, rest should be blue/purple
    const isFilled = i < stamps.current;
    let colorClass = 'text-slate-600'; // unfilled default
    if (isFilled) {
      colorClass = i === 0 ? 'text-green-500' : 'text-blue-500'; // Use -500 variants for better visibility
    }
    indicators.push(
      <span key={i} className={`text-xs ${colorClass} font-bold`}>
        {isFilled ? '●' : '○'}
      </span>
    );
  }
  
  return (
    <div className="flex items-center gap-1 text-xs">
      <div className="flex gap-0.5">{indicators}</div>
      <span className="text-slate-400">{stamps.current}/{stamps.window}</span>
      {stamps.eligible ? (
        <span className="text-green-400" title="Eligible for Cargo Chest">✅</span>
      ) : (
        <span className="text-slate-500" title="Not eligible for Cargo Chest">—</span>
      )}
    </div>
  );
}

export default function ImprovedGameTable({ game, meId, userName, onPlayerAction, onLockSelect, onLockDone, onSitDown, setActionLog, tableConfig, tableRequirements }: Props) {
  const [foldedPlayers, setFoldedPlayers] = useState<Set<string>>(new Set())
  const [lastPlayerBets, setLastPlayerBets] = useState<Record<string, number>>({})
  const [lastCargoChest, setLastCargoChest] = useState<number>(0)
  const [lastPhase, setLastPhase] = useState<string>('')

  // Helper function to determine if table stack is dangerously low
  const getTableStackStatus = (tableStack: number) => {
    if (!tableRequirements) return 'normal';

    const minimumRequired = tableRequirements.minimumTableStack;
    const warningThreshold = minimumRequired * 1.5; // Show warning at 1.5x minimum

    if (tableStack <= minimumRequired) {
      return 'critical'; // Will be auto-stood next hand
    } else if (tableStack <= warningThreshold) {
      return 'warning'; // Close to minimum
    }
    return 'normal';
  };
  const [showBuyInDialog, setShowBuyInDialog] = useState(false)
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(null)
  const [buyInAmount, setBuyInAmount] = useState<number>(100)
  const [lastPlayerActed, setLastPlayerActed] = useState<Record<string, boolean>>({})
  
  
  const maxSeats = 8
  const isGameActive = game && game.phase !== 'Lobby' && game.phase !== 'PreHand'
  const isBettingPhase = game?.phase.includes('Bet')
  const isLockPhase = game?.phase.includes('Lock')
  // Find player's seat with robust detection for both game and table seat formats
  const mySeat = game?.seats.find(s => {
    if (!s || !meId) return false;
    // Handle both playerId (game seats) and id (table seats) formats
    return s.playerId === meId || (s as any).id === meId;
  }) || 
  // Fallback: Find by name if socket IDs don't match (common during reconnection)
  (userName ? game?.seats.find(s => s && s.name && s.name.includes(userName)) : null)
  
  // Debug logging (removed - was too spammy)
  
  // Seat positions no longer needed with horizontal rail layout

  // Handle sit down with buy-in dialog
  const handleSitDown = (seatIndex: number) => {
    setSelectedSeatIndex(seatIndex)
    setShowBuyInDialog(true)
  }

  const confirmSitDown = () => {
    if (selectedSeatIndex !== null && onSitDown) {
      onSitDown(selectedSeatIndex, buyInAmount)
      setShowBuyInDialog(false)
      setSelectedSeatIndex(null)
    }
  }

  const cancelSitDown = () => {
    setShowBuyInDialog(false)
    setSelectedSeatIndex(null)
  }
  
  // Track game state changes for action log
  useEffect(() => {
    if (!game || !game.seats) return

    // Log betting actions by tracking individual player bets
    game.seats.forEach((seat: Seat | null) => {
      if (!seat) return; // Skip null seats
      
      // Track folds
      if (seat.hasFolded && !foldedPlayers.has(seat.playerId)) {
        const entry: LogEntry = {
          id: Date.now().toString() + '_fold_' + seat.playerId,
          timestamp: Date.now(),
          playerName: seat.name,
          action: 'Folded',
          isAI: seat.isAI
        }
        setActionLog(prev => [...prev.slice(-9), entry]) // Keep last 10 entries
        setFoldedPlayers(prev => new Set(prev).add(seat.playerId))
      }
      
      // Track betting actions
      if (seat.currentBet && seat.currentBet > 0) {
        const previousBet = lastPlayerBets[seat.playerId] || 0
        if (seat.currentBet !== previousBet) {
          const betAmount = seat.currentBet - previousBet
          if (betAmount > 0) {
            const action = previousBet === 0 ? 'Bet' : 'Call'
            const entry: LogEntry = {
              id: Date.now().toString() + '_bet_' + seat.playerId,
              timestamp: Date.now() + 1,
              playerName: seat.name,
              action: `${action} ${formatGoldCoinsCompact(betAmount)}`,
              isAI: seat.isAI
            }
            setActionLog(prev => [...prev.slice(-9), entry])
            setLastPlayerBets(prev => ({...prev, [seat.playerId]: seat.currentBet || 0}))
          }
        }
      }
      
      // Track check actions (player acted but currentBet is 0)
      if (isBettingPhase && seat.hasActed && !seat.hasFolded) {
        const wasActed = lastPlayerActed[seat.playerId] || false
        if (!wasActed && (seat.currentBet === 0 || seat.currentBet === undefined)) {
          // This player just checked
          const entry: LogEntry = {
            id: Date.now().toString() + '_check_' + seat.playerId,
            timestamp: Date.now() + 2, // Slightly later than bets
            playerName: seat.name,
            action: 'Checked',
            isAI: seat.isAI
          }
          setActionLog(prev => [...prev.slice(-9), entry])
        }
        setLastPlayerActed(prev => ({...prev, [seat.playerId]: seat.hasActed}))
      }
    })
    
    // Track cargo chest changes (drip events)
    const currentCargoChest = (game as any)?.cargoChest || 0
    if (currentCargoChest !== lastCargoChest && lastCargoChest > 0) {
      const increase = currentCargoChest - lastCargoChest
      if (increase > 0) {
        const entry: LogEntry = {
          id: Date.now().toString() + '_chest_drip',
          timestamp: Date.now() + 2,
          playerName: 'System',
          action: `Cargo Chest +${formatGoldCoinsCompact(increase)}`,
          details: `Now ${formatGoldCoinsCompact(currentCargoChest)}`,
          isAI: false
        }
        setActionLog(prev => [...prev.slice(-9), entry])
      }
    }
    setLastCargoChest(currentCargoChest)
    
    // Track chest awards during showdown
    if (game?.phase === 'Showdown' && lastPhase !== 'Showdown' && (game as any)?.chestAwards) {
      (game as any).chestAwards.forEach((award: any) => {
        const player = game.seats.find(s => s && s.playerId === award.playerId)
        if (player) {
          const entry: LogEntry = {
            id: Date.now().toString() + '_chest_award_' + award.playerId,
            timestamp: Date.now() + 3,
            playerName: player.name,
            action: `Won Cargo Chest ${formatGoldCoinsCompact(award.amount)}`,
            details: award.type,
            isAI: player.isAI
          }
          setActionLog(prev => [...prev.slice(-9), entry])
        }
      })
    }
    
    // Reset tracking states when phase changes
    if (game?.phase !== lastPhase) {
      setLastPlayerActed({})
      setFoldedPlayers(new Set())
    }
    
    setLastPhase(game?.phase || '')
  }, [game?.seats, game?.phase, (game as any)?.cargoChest, (game as any)?.chestAwards, foldedPlayers, lastPlayerBets, lastCargoChest, lastPhase, lastPlayerActed, isBettingPhase])

  return (
    <div className="space-y-4">

      {/* Showdown Ceremony Overlay */}
      {game?.phase === 'Showdown' && game.showdownResults && (
        <ShowdownCeremony
          showdownResults={game.showdownResults}
          pot={game.pot}
          seats={game.seats}
          chestAwards={(game as any).chestAwards}
          cargoChest={(game as any).cargoChest}
          roleTies={(game as any).roleTies}
          meId={meId || undefined}
        />
      )}
      
      {/* Progress bar - only show for lobby countdown, not for in-game phases */}
      {game?.countdownEndsAtMs && (
        <ProgressBar 
          startTime={game.countdownEndsAtMs - 5000}
          endTime={game.countdownEndsAtMs}
          className="mx-auto max-w-md"
        />
      )}
      
      
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Player Rail - Main display replaces circular table */}

        {/* Player Rail - Main Game Display */}
        <div className="bg-slate-800/95 backdrop-blur rounded-lg p-6 border border-slate-700 shadow-xl">
          {/* Seat status header */}
          <div className="text-center mb-4">
            <div className="text-slate-400 text-sm">
              {game?.seats ? (
                <>
                  Seats: {game.seats.filter(s => s !== null).length}/{maxSeats}
                  {!isGameActive && (
                    <span className="ml-2 text-slate-500">
                      (Need {tableConfig?.minHumanPlayers || 2} to start)
                    </span>
                  )}
                </>
              ) : (
                'Loading...'
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            {/* Show seated players */}
            {game?.seats?.filter(seat => seat !== null)?.map((seat) => {
              if (!seat) return null
              const isMe = seat.playerId === meId || (seat as any)?.id === meId
              const isTurn = seat.playerId === game?.currentTurnPlayerId
              const isDealer = game?.dealerSeatIndex === game?.seats?.findIndex(s => s === seat)
              const isVisible = !isGameActive || isMe || (seat?.dice && seat.dice.some(die => die.isPublic))

              return (
                <div
                  key={seat?.playerId || `seat-${Math.random()}`}
                  className={`
                    relative flex flex-col rounded-xl border-2 transition-all min-w-[180px] max-w-[200px] overflow-hidden
                    ${seat.hasFolded ? 'opacity-50 border-slate-600 bg-slate-800/50' :
                      isMe ? 'border-emerald-500 bg-slate-700/50 shadow-lg shadow-emerald-500/20' :
                      isTurn ? 'border-yellow-500 bg-slate-700/50 shadow-lg shadow-yellow-500/20 animate-pulse' :
                      isDealer ? 'border-blue-500 bg-slate-700/50 shadow-lg shadow-blue-500/20' :
                      'border-slate-600 bg-slate-700/30'}
                  `}
                >
                  {/* SECTION 1: Header Bar - COD Style */}
                  <div className="relative">
                    {/* Header background with banner styling */}
                    <div
                      className="p-3 relative"
                      style={{
                        background: seat.cosmetics?.banner &&
                                   seat.cosmetics.banner !== 'Default' &&
                                   seat.cosmetics.banner !== 'None' &&
                                   seat.cosmetics.banner !== 'default' &&
                                   seat.cosmetics.banner !== 'none' ? (() => {
                          const banner = seat.cosmetics.banner.toLowerCase()
                          if (banner.includes('pirate') || banner.includes('skull'))
                            return `linear-gradient(135deg, rgba(139, 69, 19, 0.6) 0%, rgba(160, 82, 45, 0.6) 100%)`
                          if (banner.includes('royal') || banner.includes('gold'))
                            return `linear-gradient(135deg, rgba(255, 215, 0, 0.6) 0%, rgba(218, 165, 32, 0.6) 100%)`
                          if (banner.includes('storm') || banner.includes('captain'))
                            return `linear-gradient(135deg, rgba(30, 58, 138, 0.6) 0%, rgba(59, 130, 246, 0.6) 100%)`
                          if (banner.includes('bone') || banner.includes('ghost'))
                            return `linear-gradient(135deg, rgba(75, 85, 99, 0.6) 0%, rgba(156, 163, 175, 0.6) 100%)`
                          return `linear-gradient(135deg, rgba(59, 130, 246, 0.4) 0%, rgba(147, 51, 234, 0.4) 100%)`
                        })() : 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%)',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      {/* Logo/Emblem on left */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* Show emblem only if actually set */}
                          {seat.cosmetics?.emblem &&
                           seat.cosmetics.emblem !== 'Default' &&
                           seat.cosmetics.emblem !== 'None' &&
                           seat.cosmetics.emblem !== 'default' &&
                           seat.cosmetics.emblem !== 'none' ? (
                            <span className="text-xl">{EMBLEMS[seat.cosmetics.emblem as keyof typeof EMBLEMS]?.icon || seat.cosmetics.emblem}</span>
                          ) : (
                            <span className="text-xl">⚔️</span>
                          )}

                          {/* Player name and title */}
                          <div>
                            <div className="font-bold text-base text-white drop-shadow-lg leading-tight">
                              {seat.name}
                            </div>
                            {seat.cosmetics?.title &&
                             seat.cosmetics.title !== 'Default' &&
                             seat.cosmetics.title !== 'None' &&
                             seat.cosmetics.title !== 'default' &&
                             seat.cosmetics.title !== 'none' && (
                              <div className="text-xs text-slate-200 italic drop-shadow-md leading-tight">
                                {TITLES[seat.cosmetics.title as keyof typeof TITLES] || seat.cosmetics.title}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status badges on right */}
                        <div className="flex flex-col gap-1">
                          {isMe && <Badge variant="success" className="text-[10px] px-2">YOU</Badge>}
                          {isTurn && <Badge variant="warning" className="text-[10px] px-2">TURN</Badge>}
                          {isDealer && <Badge variant="info" className="text-[10px] px-2">DEALER</Badge>}
                          {seat.isAI && <Badge variant="secondary" className="text-[10px] px-2">AI</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: Dice Tray - Clean centered area */}
                  <div className="flex-1 flex items-center justify-center p-3 bg-slate-800/30">
                    {isGameActive && seat?.dice && Array.isArray(seat.dice) && isVisible && (
                      <div className="flex flex-wrap gap-0 justify-center p-2 bg-slate-900/50 rounded-lg shadow-inner max-w-[140px]">
                        {isMe ? (
                          // For current player: show dice that are either public OR the minimum required locked dice
                          (() => {
                            const minRequired = seat.minLocksRequired || 1;
                            const lockedDice = seat.dice
                              ?.filter(die => die && die.locked)
                              ?.sort((a, b) => (b.value || 0) - (a.value || 0)) || [];

                            // Show either public dice OR the top N locked dice (whichever gives more visibility)
                            const visibleDice = seat.dice?.filter(die => die && die.isPublic) || [];
                            if (visibleDice.length === 0 && lockedDice.length > 0) {
                              // If no dice are marked public yet, show the minimum required locked dice
                              return lockedDice.slice(0, minRequired);
                            }
                            return visibleDice;
                          })()
                            ?.sort((a, b) => (b.value || 0) - (a.value || 0))
                            ?.map((die, i) => (
                              die && (
                                <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-6px' : '0' }}>
                                  <Die
                                    value={(die.value || 1) as 1|2|3|4|5|6}
                                    locked={die.locked}
                                    size="sm"
                                    highSkin={seat.cosmetics?.highSkin}
                                    lowSkin={seat.cosmetics?.lowSkin}
                                  />
                                </div>
                              )
                            ))
                        ) : (
                          // For other players: show dice that are either public OR the minimum required locked dice
                          (() => {
                            const minRequired = seat.minLocksRequired || 1;
                            const lockedDice = seat.dice
                              ?.filter(die => die && die.locked)
                              ?.sort((a, b) => (b.value || 0) - (a.value || 0)) || [];

                            // Show either public dice OR the top N locked dice (whichever gives more visibility)
                            const visibleDice = seat.dice?.filter(die => die && die.isPublic) || [];
                            if (visibleDice.length === 0 && lockedDice.length > 0) {
                              // If no dice are marked public yet, show the minimum required locked dice
                              return lockedDice.slice(0, minRequired);
                            }
                            return visibleDice;
                          })()
                            ?.sort((a, b) => (b.value || 0) - (a.value || 0))
                            ?.map((die, i) => (
                              die && (
                                <div key={i} className="flex-shrink-0" style={{ marginLeft: i > 0 ? '-6px' : '0' }}>
                                  <Die
                                    value={(die.value || 1) as 1|2|3|4|5|6}
                                    locked={die.locked}
                                    size="sm"
                                    highSkin={seat.cosmetics?.highSkin}
                                    lowSkin={seat.cosmetics?.lowSkin}
                                  />
                                </div>
                              )
                            ))
                        )}
                        {(() => {
                          const lockedDice = seat.dice?.filter(die => die && die.locked) || [];
                          const visibleDice = seat.dice?.filter(die => die && die.isPublic) || [];
                          const hasVisibleDice = visibleDice.length > 0 || lockedDice.length > 0;

                          if (!hasVisibleDice) {
                            return isMe ? (
                              <div className="text-xs text-slate-500 px-3 py-2">
                                No visible dice
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 px-3 py-2">
                                Hidden dice
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                    {(!isGameActive || !seat?.dice || !isVisible) && (
                      <div className="text-slate-500 text-sm">—</div>
                    )}
                  </div>

                  {/* SECTION 3: Footer - Bank/Bet/Status info */}
                  <div className="p-3 bg-slate-900/50 border-t border-slate-600/50">
                    <div className="flex items-center justify-between text-sm">
                      {/* Left: Bank info */}
                      <div className="flex items-center gap-1">
                        <span className={`font-bold ${
                          getTableStackStatus(seat.tableStack) === 'critical'
                            ? 'text-red-400 animate-pulse'
                            : getTableStackStatus(seat.tableStack) === 'warning'
                            ? 'text-yellow-300 animate-pulse'
                            : 'text-yellow-400'
                        }`}>
                          {formatGoldCoinsCompact(seat.tableStack)}
                          {getTableStackStatus(seat.tableStack) === 'critical' && ' ⚠️'}
                          {getTableStackStatus(seat.tableStack) === 'warning' && ' ⚠️'}
                        </span>
                        {seat.currentBet > 0 && (
                          <span className="text-amber-300 text-xs">
                            (Bet: {formatGoldCoinsCompact(seat.currentBet)})
                          </span>
                        )}
                      </div>

                      {/* Right: Status info */}
                      <div className="flex items-center gap-2">
                        {seat.hasFolded && (
                          <Badge variant="warning" className="text-[10px]">FOLDED</Badge>
                        )}
                        {isGameActive && seat?.stamps && (
                          <div className="scale-75">
                            {renderStampIndicators(seat.stamps)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Cargo Chest Display */}
          <div className="text-center mb-4">
            <div className="text-slate-400 text-sm">
              💰 Cargo Chest: {formatGoldCoinsCompact((game as any)?.cargoChest || 0)}
            </div>
          </div>

          {/* Join/Sit actions */}
          {meId && !mySeat && (
            <div className="text-center mt-6">
              {!isGameActive ? (
                <div className="space-y-3">
                  <div className="text-slate-400">Ready to join?</div>
                  <Button onClick={() => handleSitDown(0)} variant="primary">
                    Join Game
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-slate-400">Game in progress</div>
                  <Button onClick={() => handleSitDown(0)} variant="secondary">
                    Sit Next Hand
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Game starts automatically when enough players join */}
        </div>

        {/* Controls and Action Log row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* My dice control area - spans 2 columns */}
          {(isGameActive && mySeat && !mySeat?.hasFolded) && (
            // @ts-ignore - game and mySeat are guaranteed non-null in this block by the conditional check above
            <div className="lg:col-span-2 bg-slate-800/95 backdrop-blur rounded-lg p-4 border border-slate-700 shadow-2xl">
            {isLockPhase ? (
              <div className="space-y-3">
                {/* Phase timer */}
                {game.phaseEndsAtMs && (
                  <CenterProgressBar
                    startTime={game.phaseEndsAtMs - 30000}
                    endTime={game.phaseEndsAtMs}
                    className="mb-2"
                  />
                )}

                {/* Pot and Cargo Chest Display */}
                <div className="bg-slate-700/50 rounded-lg p-3 text-center space-y-2">
                  {/* Main Pot */}
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-yellow-400">{formatGoldCoinsCompact(game.pot)}</div>
                    <div className="text-xs text-slate-400">Main Pot</div>
                  </div>

                  {/* Cargo Chest */}
                  {(game as any).cargoChest !== undefined && (
                    <div className="space-y-1">
                      <div className="text-lg font-bold text-purple-400">{formatGoldCoinsCompact((game as any).cargoChest || 0)}</div>
                      <div className="text-xs text-purple-300">
                        Cargo Chest
                        <span className="ml-1 text-slate-500 cursor-help" title="5% of each wager feeds the progressive Cargo Chest">ⓘ</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-sm text-center">
                  <span className="text-amber-400">
                    Round {game!.phase.slice(-1)}: Lock {mySeat!.minLocksRequired || 1} dice minimum
                  </span>
                  <br />
                  <span className="text-slate-400">
                    Currently locked: {mySeat.dice.filter(d => d.locked).length}
                    {mySeat.lockAllowance > 0 &&
                      ` (need ${mySeat.lockAllowance} more)`
                    }
                  </span>
                  {/* Debug info */}
                </div>
                <div className="flex gap-2 justify-center">
                  {mySeat.dice.map((die, i) => {
                    // Determine if this die will be public when locked
                    const lockedDice = mySeat.dice
                      .map((d, idx) => ({ die: d, index: idx }))
                      .filter(item => item.die.locked)
                      .sort((a, b) => (b.die.value || 0) - (a.die.value || 0));
                    
                    const minRequired = mySeat.minLocksRequired || 1;
                    const willBePublic = die.locked && lockedDice.findIndex(item => item.index === i) < minRequired;
                    
                    // Use green ring for public dice, blue for private
                    const ringColor = die.locked ? (willBePublic ? 'ring-green-500' : 'ring-blue-500') : 'ring-transparent';
                    
                    return (
                      <button
                        key={i}
                        onClick={() => onLockSelect(i)}
                        className={`
                          transition-all transform hover:scale-110 relative
                          cursor-pointer hover:shadow-lg hover:shadow-emerald-500/30
                          active:scale-95 active:shadow-inner
                          ring-2 ${ringColor}
                        `}
                      >
                        <Die
                          value={(die.value || 1) as 1|2|3|4|5|6}
                          locked={die.locked}
                          highSkin={mySeat?.cosmetics?.highSkin}
                          lowSkin={mySeat?.cosmetics?.lowSkin}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-center text-slate-500 mb-3">
                  <span className="text-green-400">Green</span>: Public dice | <span className="text-blue-400">Blue</span>: Private dice | Click to select/deselect
                </div>
                {/* Done button and Fold button */}
                <div className="text-center space-y-2">
                  {mySeat.lockingDone ? (
                    <Badge variant="success" className="text-sm px-4 py-2">
                      ✓ Locking Complete - Waiting for others
                    </Badge>
                  ) : (
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={onLockDone}
                        variant="primary"
                        size="sm"
                        disabled={mySeat.dice.filter(d => d.locked).length < (mySeat.minLocksRequired || 1)}
                      >
                        {tableConfig?.betting?.ante?.mode === 'per_player'
                          ? `Lock + Ante (${formatGoldCoinsCompact(tableConfig.betting.ante.amount)})`
                          : 'Done Locking'}
                      </Button>
                      {tableConfig?.betting?.ante?.mode === 'per_player' && (
                        <Button
                          onClick={() => onPlayerAction('fold')}
                          variant="secondary"
                          size="sm"
                        >
                          Fold
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : isBettingPhase ? (
              <div className="space-y-3">
                {/* Pot and Game Info */}
                <div className="bg-slate-700/50 rounded-lg p-3 text-center space-y-2">
                  {/* Main Pot */}
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-yellow-400">{formatGoldCoinsCompact(game.pot)}</div>
                    <div className="text-xs text-slate-400">Main Pot</div>
                  </div>

                  {/* Cargo Chest */}
                  {(game as any).cargoChest !== undefined && (
                    <div className="space-y-1">
                      <div className="text-lg font-bold text-purple-400">{formatGoldCoinsCompact((game as any).cargoChest || 0)}</div>
                      <div className="text-xs text-purple-300">
                        Cargo Chest
                        <span className="ml-1 text-slate-500 cursor-help" title="10% of each bet feeds the progressive Cargo Chest">ⓘ</span>
                      </div>
                    </div>
                  )}

                  {/* Current bet and phase info */}
                  <div className="flex justify-center gap-4 text-xs">
                    <Badge variant="default" className="text-xs px-2 py-1">
                      {game.phase?.includes('Lock') ? `🎲 ${game.phase}` :
                       game.phase?.includes('Bet') ? `💰 ${game.phase}` :
                       game.phase || 'Loading...'}
                    </Badge>
                    {game.currentBet > 0 && (
                      <div className="text-amber-400">To call: {formatGoldCoinsCompact(game.currentBet)}</div>
                    )}
                  </div>

                  {/* Rake info */}
                  {((game as any).davyJonesRake > 0 || (game as any).totalDavyJonesRake > 0) && (
                    <div className="text-xs text-red-400">
                      Rake: {formatGoldCoinsCompact((game as any).totalDavyJonesRake || (game as any).davyJonesRake || 0)}
                    </div>
                  )}
                </div>

                {/* Phase timer */}
                {game.phaseEndsAtMs && (
                  <CenterProgressBar
                    startTime={game.phaseEndsAtMs - 30000}
                    endTime={game.phaseEndsAtMs}
                    className="mb-2"
                  />
                )}
                {(() => {
                  const isMyTurn = game.currentTurnPlayerId === meId;
                  return isMyTurn;
                })() ? (
                  <div className="space-y-2">
                    <div className="text-center text-amber-400 font-semibold">Your Turn</div>
                    <div className="flex gap-2 justify-center flex-wrap">
                      {/* Check if we're in ante collection mode */}
                      {(() => {
                        console.log('🎲 Ante button check:', {
                          phase: game.phase,
                          antePhaseComplete: game.antePhaseComplete,
                          showButton: game.phase === 'Ante' && !game.antePhaseComplete
                        });
                        return null;
                      })()}
                      {game.phase === 'Ante' && !game.antePhaseComplete ? (
                        <>
                          {(() => {
                            const anteAmount = tableConfig?.betting?.ante?.amount || 0;
                            return (
                              <Button onClick={() => onPlayerAction('post_ante')} variant="primary" size="sm">
                                Post Ante ({formatGoldCoinsCompact(anteAmount)})
                              </Button>
                            );
                          })()}
                          <Button onClick={() => onPlayerAction('fold')} variant="ghost" size="sm">
                            Fold
                          </Button>
                        </>
                      ) : game.currentBet === 0 ? (
                        <>
                          <Button onClick={() => onPlayerAction('check')} variant="secondary" size="sm">
                            Check
                          </Button>
                          {(() => {
                            const smallBetAmount = Math.max(10, Math.floor((game?.pot || 0) * 0.25));
                            return (
                              <Button onClick={() => onPlayerAction('bet', smallBetAmount)} variant="primary" size="sm">
                                Bet {formatGoldCoinsCompact(smallBetAmount)}
                              </Button>
                            );
                          })()}
                          {(() => {
                            const largeBetAmount = Math.floor((game?.pot || 0) * 0.5);
                            return (
                              <Button onClick={() => onPlayerAction('bet', largeBetAmount)} variant="primary" size="sm">
                                Bet {formatGoldCoinsCompact(largeBetAmount)}
                              </Button>
                            );
                          })()}
                          <Button onClick={() => onPlayerAction('fold')} variant="ghost" size="sm">
                            Fold
                          </Button>
                        </>
                      ) : (
                        <>
                          {(() => {
                            const callAmount = (game?.currentBet || 0) - (mySeat?.currentBet || 0);
                            return (
                              <Button onClick={() => onPlayerAction('call')} variant="secondary" size="sm">
                                Call {formatGoldCoinsCompact(callAmount)}
                              </Button>
                            );
                          })()}
                          {(() => {
                            const smallRaiseAmount = Math.floor((game?.pot || 0) * 0.5);
                            return (
                              <Button onClick={() => onPlayerAction('raise', smallRaiseAmount)} variant="primary" size="sm">
                                Raise +{formatGoldCoinsCompact(smallRaiseAmount)}
                              </Button>
                            );
                          })()}
                          {(() => {
                            const largeRaiseAmount = game?.pot || 0;
                            return (
                              <Button onClick={() => onPlayerAction('raise', largeRaiseAmount)} variant="primary" size="sm">
                                Raise +{formatGoldCoinsCompact(largeRaiseAmount)}
                              </Button>
                            );
                          })()}
                          <Button onClick={() => onPlayerAction('fold')} variant="ghost" size="sm">
                            Fold
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-400">
                    Waiting for {game?.seats?.find(s => s && s.playerId === game?.currentTurnPlayerId)?.name || 'other player'} to bet
                  </div>
                )}
              </div>
            ) : null}
            </div>
          )}
          
          {/* Right column - Game Legend only */}
          <div className="space-y-4">
            <GameLegend />
          </div>
        </div>
        
        {/* Game Info panel - under controls */}
        <GameInfo 
          pot={game?.pot || 0}
          mySeat={mySeat ? { dice: mySeat.dice, name: mySeat.name } : undefined}
          isGameActive={!!isGameActive}
        />

        {/* Buy-in Dialog */}
        {showBuyInDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-75" onClick={cancelSitDown} />
            <div className="relative bg-slate-800 rounded-lg shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-white mb-4">💰 Buy In to Sit Down</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Buy-in Amount (Your Bankroll for This Session)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    step="10"
                    value={buyInAmount}
                    onChange={(e) => setBuyInAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    This amount will be your table bankroll. You can stand up to cash out.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="secondary" 
                    onClick={cancelSitDown}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={confirmSitDown}
                    className="flex-1"
                  >
                    Sit Down (${buyInAmount})
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}