import { useEffect, useState } from 'react'
import ImprovedGameTable from './ImprovedGameTable'
import Button from './ui/Button'
import Panel from './ui/Panel'
import Badge from './ui/Badge'
import Sidebar from './ui/Sidebar'
import ActionLog from './ActionLog'
import { LoginButton } from './LoginButton'
import { PlayerProfile } from './PlayerProfile'
import { Store } from './Store'
import RulesModal from './RulesModal'
import BuyInModal from './BuyInModal'
import CurrencyDisplay from './CurrencyDisplay'
import { useAuth } from './AuthProvider'
import { type CurrencyType } from '../utils/currency'
import { APP_VERSION, BUILD_TIMESTAMP } from '../version'
import { getBackendUrl } from '../utils/backendUrl'
import {
  DEFAULT_COSMETICS
} from '../config/cosmetics'

type Player = {
  id: string
  name: string
  isAI: boolean
  bankroll: number
}

type LobbyState = {
  players: Player[]
}

type Seat = {
  playerId: string
  name: string
  isAI: boolean
  tableStack: number
  dice?: any[]
  hasFolded?: boolean
  lockAllowance?: number
  currentBet?: number
}

type TableConfig = {
  minHumanPlayers: number
  targetTotalPlayers: number
  maxSeats: number
  cargoChestLearningMode: boolean
  currency?: string // e.g., 'TC', 'SC', 'Event Tokens'
  minBuyIn?: number // Minimum buy-in amount in pennies
}

type TableState = {
  seats: (Seat | null)[]
  config: TableConfig
  cargoChest?: any
}

// TEMPORARILY DISABLED - Flipz package issues
// type FlipzTable = {
//   tableId: string
//   displayName: string
//   variant: 'coin-flip' | 'card-flip'
//   ante: number
//   maxSeats: number
//   description: string
//   emoji: string
//   currentPlayers: number
// }

const BACKEND_URL = getBackendUrl()

// Client-side deployment and state validation
async function checkDeploymentInfo() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/deploy-info`)
    return await response.json()
  } catch (e) {
    console.warn('Could not fetch deployment info:', e)
    return null
  }
}

type LogEntry = {
  id: string
  timestamp: number
  playerName: string
  action: string
  details?: string
  isAI: boolean
}

interface BuyInModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (amount: number) => void
  minBuyIn: number
  maxBuyIn: number
  userBalance: number
  currency: CurrencyType
  initialAmount?: number
  title?: string
}

interface GameAppProps {
  platformMode?: boolean  // When true, hide platform-provided UI (Profile, Store, Login, etc.)
  tableId?: string        // Table ID to join (for multi-table platform mode)
  BuyInModalComponent?: React.ComponentType<BuyInModalProps>  // Shared BuyInModal from platform
}

export default function GameApp({ platformMode = false, tableId, BuyInModalComponent }: GameAppProps = {}) {
  // Use platform's BuyInModal if provided, otherwise use local version
  const BuyInModalToUse = BuyInModalComponent || BuyInModal
  const { user, loading, refreshUser, socket } = useAuth()
  const [connected, setConnected] = useState(false)
  const [me, setMe] = useState<Player | null>(null)
  const [_lobby, setLobby] = useState<LobbyState>({ players: [] })
  const [table, setTable] = useState<TableState | null>(null)
  const [game, setGame] = useState<any>(null)
  const [actionLog, setActionLog] = useState<LogEntry[]>([])
  const [cosmetics, setCosmetics] = useState(user?.cosmetics || DEFAULT_COSMETICS)
  const [showRules, setShowRules] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const [isSeated, setIsSeated] = useState(false)
  const [isGameAdmin, setIsGameAdmin] = useState(false) // Server-verified admin status
  const [showBuyInModal, setShowBuyInModal] = useState(false)
  const [buyInAmount, setBuyInAmount] = useState(10)
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(null)  // For ImprovedGameTable sit-down
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [versionInfo, setVersionInfo] = useState<{backendVersion?: string, frontendVersion?: string}>({
    frontendVersion: APP_VERSION || '1.0.5' // Frontend version from version.ts
  })
  const [standUpPending, setStandUpPending] = useState(false)

  // Update cosmetics when user changes
  useEffect(() => {
    if (user?.cosmetics) {
      // Use gameCosmetics if available, otherwise fall back to old cosmetics system
      const diceCosmetic = user.gameCosmetics?.['pirate-plunder']?.dice

      setCosmetics({
        ...user.cosmetics,
        // Map new dice cosmetic to both highSkin and lowSkin for backwards compatibility
        highSkin: diceCosmetic || user.cosmetics.highSkin || 'bone-classic',
        lowSkin: diceCosmetic || user.cosmetics.lowSkin || 'pearl-simple'
      })
    }
  }, [user])

  // Debug: Track when me changes
  useEffect(() => {
    console.log(`👤 me state changed:`, { hasMe: !!me, meId: me?.id, meName: me?.name, meData: me });
  }, [me]);

  // Debug: Track when game state changes
  useEffect(() => {
    console.log(`🎮 GAME STATE CHANGED:`, {
      hasGame: !!game,
      phase: game?.phase,
      seatsCount: game?.seats?.length,
      fullGame: game
    });
  }, [game]);

  useEffect(() => {
    if (!socket || !user) return

    const handleConnect = async () => {
      setConnected(true)

      // Check deployment info for debugging
      const deployInfo = await checkDeploymentInfo()
      if (deployInfo) {
        // Update version info with backend version
        setVersionInfo(prev => ({
          ...prev,
          backendVersion: deployInfo.backendVersion
        }))
      }

      // Join table with platform socket
      console.log('📤 Emitting join_table with:', { tableId });
      socket.emit('join_table', { tableId })
    }

    const handleDisconnect = (reason: string) => {
      console.error(`🔌 Socket disconnected:`, reason)
      console.error('Stack trace:', new Error().stack)
      setConnected(false)
      setMe(null)
      setGame(null)
    }

    const handleTableJoined = (data: { tableId: string; state: any }) => {
      console.log(`🔗 Table joined:`, { tableId: data.tableId, phase: data.state?.phase });
      // Platform provides full game state, not just player info
      // Extract me from socket auth
      const myId = socket?.id;
      if (myId) {
        setMe({
          id: myId,
          name: user.name,
          isAI: false,
          bankroll: user.bankroll
        });
      }
      // Don't auto-sit - let user choose
    }

    const handleLobbyState = (state: LobbyState) => {
      console.log(`🎭 LOBBY_STATE received with ${state.players.length} players:`, state.players.map(p => `${p.name}: $${p.bankroll/100}`));
      setLobby(state)

      // Update using setMe callback to get current me value (avoid closure issue)
      setMe(currentMe => {
        console.log(`🔍 Current me in setMe callback:`, { hasMe: !!currentMe, meId: currentMe?.id });

        if (currentMe && currentMe.id) {
          const updatedMe = state.players.find(p => p.id === currentMe.id)
          console.log(`🔍 Found updatedMe:`, !!updatedMe, updatedMe ? `$${updatedMe.bankroll/100}` : 'none');

          if (updatedMe) {
            // Return new me object with updated data
            // NOTE: We don't call updateBankroll here because it causes the socket
            // useEffect to re-run when user changes, which breaks the connection
            return {
              ...updatedMe,
              lastUpdate: Date.now()
            };
          }
        }

        // Return current me unchanged if we can't update
        return currentMe;
      });
    }

    const handleGameState = (gameState: any) => {
      console.log(`📡 handleGameState CALLED:`, { phase: gameState?.phase, seats: gameState?.seats?.length, timestamp: Date.now() });
      console.log(`🔥 FULL GAME STATE:`, gameState);
      setGame(gameState)

      // Clear standUpPending when hand ends or goes back to lobby
      if (standUpPending && (gameState?.phase === 'Lobby' || gameState?.phase === 'HandEnd')) {
        console.log('🚪 Hand ended - clearing stand up pending state')
        setStandUpPending(false)
      }

      // Add action to log if phase changed
      if (gameState.phaseHistory && gameState.phaseHistory.length > 0) {
        const lastPhase = gameState.phaseHistory[gameState.phaseHistory.length - 1]
        addToActionLog('System', `Phase: ${lastPhase}`, '', false)
      }
    }

    const handlePlayerAction = (data: any) => {
      addToActionLog(data.playerName, data.action, data.details || '', data.isAI || false)
    }

    const handleTableState = (state: TableState) => {
      console.log('🪑 TABLE_STATE received:', {
        seatedCount: state.seats.filter(s => s !== null).length,
        seats: state.seats.map((s, i) => s ? `${i}: ${s.name} (${String(s.playerId || '').slice(0,6) || 'no-id'})` : `${i}: empty`),
        mySocketId: String(socket?.id || '').slice(0,6)
      })
      setTable(state)
      // Check if we're seated using socket ID since me might not be set yet
      const seated = state.seats.some(s => s?.playerId === socket?.id)
      console.log('🪑 Am I seated?', seated, 'Socket ID:', String(socket?.id || '').slice(0,6))
      setIsSeated(seated)

      // Reset standUpPending if we're no longer seated (i.e., standing up completed)
      if (!seated && standUpPending) {
        console.log('🚪 Stand up completed - no longer seated')
        setStandUpPending(false)
      }
    }

    const handleError = (error: string) => {
      setErrorMessage(error)
      // Clear error after 5 seconds
      setTimeout(() => setErrorMessage(''), 5000)
    }

    const handleStandUpPending = (data: { message: string }) => {
      console.log('🚪 Stand up pending:', data.message)
      setStandUpPending(true)
      addToActionLog('System', data.message, '', false)
    }

    // TEMPORARILY DISABLED - Flipz package issues
    // const handleFlipzTables = (tables: FlipzTable[]) => {
    //   console.log('🪙 Received Flipz tables:', tables)
    //   setFlipzTables(tables)
    // }

    // Debug: Log all incoming socket events, especially game_state
    const debugListener = (eventName: string, ...args: any[]) => {
      if (eventName === 'game_state') {
        console.log(`🔔 Socket received game_state event (via onAny):`, { phase: args[0]?.phase, timestamp: Date.now() });
      } else if (eventName !== 'table_state') {
        console.log(`🔔 Socket event: ${eventName}`, args);
      }
    };
    socket.onAny(debugListener);

    // Handler for connection health checks
    const handleHealthCheck = () => {
      socket.emit('connection_health_response');
    };

    // Register all event listeners
    const registerListeners = () => {
      console.log('🔌 Registering socket event listeners');
      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('table_joined', handleTableJoined)
      socket.on('lobby_state', handleLobbyState)
      socket.on('table_state', handleTableState)
      socket.on('game_state', handleGameState)
      socket.on('player_action', handlePlayerAction)
      socket.on('stand_up_pending', handleStandUpPending)
      socket.on('connection_health_check', handleHealthCheck)
      socket.on('error', handleError)
    }

    // Unregister all event listeners
    const unregisterListeners = () => {
      console.log('🔌 Unregistering socket event listeners');
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('table_joined', handleTableJoined)
      socket.off('lobby_state', handleLobbyState)
      socket.off('table_state', handleTableState)
      socket.off('game_state', handleGameState)
      socket.off('player_action', handlePlayerAction)
      socket.off('stand_up_pending', handleStandUpPending)
      socket.off('connection_health_check', handleHealthCheck)
      socket.off('error', handleError)
    }

    // Register listeners initially
    registerListeners()

    // CRITICAL: Re-register listeners on Socket.io reconnect
    const handleReconnect = () => {
      console.log('🔌 Socket reconnected - re-registering event listeners');
      unregisterListeners()
      registerListeners()
      // Request fresh game state after reconnection
      if (user && tableId) {
        socket.emit('join_table', { tableId })
      }
    }
    socket.on('reconnect', handleReconnect)

    return () => {
      socket.off('reconnect', handleReconnect)
      socket.offAny(debugListener)
      unregisterListeners()
      // DON'T disconnect - let the socket persist for reconnections
      // socket.disconnect()
    }
  }, [socket, user])

  // DISABLED: Heartbeat was causing UI flashing every 10 seconds
  // TODO: Fix the root cause - why aren't game_state events being received?
  // useEffect(() => {
  //   if (!socket || !game) return

  //   let lastUpdateTime = Date.now()
  //   let lastSeenPhase = game.phase

  //   const syncCheckInterval = setInterval(() => {
  //     const now = Date.now()
  //     const timeSinceUpdate = now - lastUpdateTime

  //     // Update tracking when phase changes
  //     if (game.phase !== lastSeenPhase) {
  //       lastUpdateTime = now
  //       lastSeenPhase = game.phase
  //     }

  //     // If we haven't received a game_state update in 10 seconds AND we're in an active game phase
  //     if (timeSinceUpdate > 10000 && game.phase && !game.phase.includes('Lobby') && !game.phase.includes('GameEnd')) {
  //       console.warn(`⚠️ Frontend may be out of sync! Last update ${Math.floor(timeSinceUpdate / 1000)}s ago. Phase: ${game.phase}`)

  //       // Request fresh state by re-joining
  //       if (user && socket.connected) {
  //         console.log('🔄 Requesting fresh game state...')
  //         socket.emit('join', {
  //           name: user.name,
  //           cosmetics: user.cosmetics,
  //           bankroll: Math.round(user.bankroll * 100), // Convert dollars to pennies
  //           gameType
  //         })
  //         lastUpdateTime = now // Reset timer after requesting
  //       }
  //     }
  //   }, 5000) // Check every 5 seconds

  //   return () => clearInterval(syncCheckInterval)
  // }, [socket, game, user])

  const addToActionLog = (playerName: string, action: string, details?: string, isAI?: boolean) => {
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random(),
      timestamp: Date.now(),
      playerName,
      action,
      details,
      isAI: isAI || false
    }
    setActionLog(prev => [entry, ...prev.slice(0, 49)]) // Keep last 50 entries
  }

  const handleJoinLobby = () => {
    if (socket && user && tableId) {
      socket.emit('join_table', { tableId })
    }
  }


  const handleStartHand = () => {
    if (socket) {
      socket.emit('start_hand')
      addToActionLog('System', 'Started new hand', '', false)
    }
  }

  const handleSitDown = () => {
    if (!isSeated) {
      // Use table config minBuyIn, fallback to safe default (1000 TC)
      const minRequired = table?.config?.minBuyIn || 1000
      const maxBankroll = me?.bankroll || 10000  // Already in TC
      const defaultAmount = Math.max(minRequired, Math.min(maxBankroll, minRequired * 2))  // Default 2x minimum
      setBuyInAmount(defaultAmount)
      setShowBuyInModal(true)
    }
  }

  const confirmBuyIn = (amount: number) => {
    if (socket) {
      // Include seatIndex if it was set (from ImprovedGameTable)
      const sitDownPayload = selectedSeatIndex !== null
        ? { seatIndex: selectedSeatIndex, buyInAmount: amount }
        : { buyInAmount: amount }

      socket.emit('sit_down', sitDownPayload)

      if (selectedSeatIndex !== null) {
        addToActionLog('System', `Sitting down at seat ${selectedSeatIndex + 1} with ${amount} ${table?.config?.currency || 'TC'}`, '', false)
        setSelectedSeatIndex(null)  // Clear it after use
      } else {
        addToActionLog('System', `Sitting down with ${amount} ${table?.config?.currency || 'TC'}`, '', false)
      }

      // Refresh user data after a short delay to ensure backend updates are complete
      setTimeout(() => {
        refreshUser()
      }, 1000)
    }
  }

  const handleModalSitDown = (seatIndex: number) => {
    // Store seatIndex and show BuyInModal
    setSelectedSeatIndex(seatIndex)

    // Use table config minBuyIn, fallback to safe default (1000 TC)
    const minRequired = table?.config?.minBuyIn || 1000
    const maxBankroll = me?.bankroll || 10000  // Already in TC
    const defaultAmount = Math.max(minRequired, Math.min(maxBankroll, minRequired * 2))  // Default 2x minimum

    setBuyInAmount(defaultAmount)
    setShowBuyInModal(true)
  }

  // TEMPORARILY DISABLED - Flipz package issues
  // const handleSelectFlipzTable = (tableId: string) => {
  //   if (socket) {
  //     console.log('🎯 Selecting Flipz table:', tableId)
  //     socket.emit('select_flipz_table', { tableId })
  //     setSelectedTableId(tableId)
  //     addToActionLog('System', `Selected table: ${tableId}`, '', false)
  //   }
  // }

  const handleStandUp = () => {
    if (socket && isSeated) {
      socket.emit('stand_up')
      addToActionLog('System', 'Standing up from table', '', false)
      // Reset table selection when standing up from Flipz
      // TEMPORARILY DISABLED
      // if (gameType === 'flipz') {
      //   setSelectedTableId(undefined)
      // }
    }
  }

  const handleStandUpImmediate = () => {
    if (socket && isSeated) {
      socket.emit('stand_up_immediate')
      addToActionLog('System', 'Standing up immediately (folding current hand)', '', false)
      // Reset table selection when standing up from Flipz
      // TEMPORARILY DISABLED
      // if (gameType === 'flipz') {
      //   setSelectedTableId(undefined)
      // }
    }
  }

  const handleResetGame = () => {
    console.log('🔧 Admin reset clicked', { hasSocket: !!socket, isAdmin: user?.isAdmin });
    if (socket && user?.isAdmin) {
      console.log('🔧 Emitting admin_reset_game');
      socket.emit('admin_reset_game')
      addToActionLog('Admin', 'Resetting game to lobby', '', false)
      setShowAdminMenu(false)
    } else {
      console.warn('🔧 Cannot reset - socket or admin check failed');
    }
  }

  const handleRestartGame = () => {
    console.log('🔧 Admin restart clicked', { hasSocket: !!socket, isAdmin: user?.isAdmin });
    if (socket && user?.isAdmin) {
      console.log('🔧 Emitting admin_restart_game');
      socket.emit('admin_restart_game')
      addToActionLog('Admin', 'Restarting current hand', '', false)
      setShowAdminMenu(false)
    } else {
      console.warn('🔧 Cannot restart - socket or admin check failed');
    }
  }

  const handleTopUp = async (amount: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket || !isSeated) {
        reject(new Error('Not connected or not seated'));
        return;
      }

      // Set up one-time listeners for response
      const handleSuccess = (data: any) => {
        addToActionLog('System', `Topped up table stack by $${data.amount}`, '', false);
        socket.off('top_up_success', handleSuccess);
        socket.off('error', handleError);
        resolve();
      };

      const handleError = (error: any) => {
        socket.off('top_up_success', handleSuccess);
        socket.off('error', handleError);
        reject(new Error(error.message || 'Top-up failed'));
      };

      socket.on('top_up_success', handleSuccess);
      socket.on('error', handleError);

      // Send the top-up request
      socket.emit('top_up', { amount });
      addToActionLog('System', `Requesting top-up of $${amount}`, '', false);
    });
  }


  // const handleNextPhase = () => {
  //   if (socket) {
  //     socket.emit('next_phase')
  //   }
  // }

  const handlePlayerGameAction = (action: string, amountOrData?: number | any) => {
    if (socket && me) {
      // Support both amount (number) for Pirate Plunder and data (object) for WarFaire
      const payload = typeof amountOrData === 'number'
        ? { action, amount: amountOrData }
        : { action, data: amountOrData };

      socket.emit('player_action', payload);

      // Extract amount for logging
      const displayAmount = typeof amountOrData === 'number'
        ? amountOrData
        : amountOrData?.amount;
      addToActionLog(me.name, action, displayAmount ? `$${displayAmount}` : '', false);
    }
  }

  const handleLockSelect = (index: number) => {
    console.log('🎲 LOCK SELECT CLICKED:', { index, hasSocket: !!socket });
    if (socket) {
      console.log('🎲 Emitting lock_select event with index:', index);
      socket.emit('lock_select', { index })
    } else {
      console.error('🎲 No socket available to emit lock_select!');
    }
  }

  // HouseRules Poker lobby handlers
  // const handleToggleLock = (diceIndex: number) => {
  //   if (socket) {
  //     socket.emit('lock_toggle', { index: diceIndex })
  //   }
  // }

  // Show login screen if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-emerald-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-emerald-900 flex flex-col items-center justify-center text-white">
        <div className="text-center space-y-6 max-w-md mx-auto p-6">
          <h1 className="text-4xl font-bold mb-4">🏴‍☠️ Pirate Plunder</h1>
          <p className="text-lg text-gray-300 mb-8">
            Ahoy, matey! Set sail on the high seas of dice and fortune. 
            Login to create your pirate profile and start plunderin'!
          </p>
          <LoginButton gameBankroll={me?.bankroll} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-emerald-900 text-white relative">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        {/* Left side - only show in standalone mode */}
        {!platformMode && (
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">
                🏴‍☠️ Pirate Plunder
              </h1>
              {connected && me && (
                <div className="text-sm text-gray-300 flex items-center gap-2">
                  <Badge variant="success">Connected</Badge>
                  <span>Playing as: {me.name}</span>
                  <span>Bankroll: ${(me.bankroll / 100).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Stand Up - always show when seated */}
          {isSeated && (
            <Button
              onClick={handleStandUpImmediate}
              variant="ghost"
              size="sm"
              title="Leave the table and forfeit current hand"
            >
              🚪 Stand Up
            </Button>
          )}

          {/* Platform-provided buttons - only in standalone mode */}
          {!platformMode && (
            <>
              <Button
                onClick={() => setShowProfile(true)}
                variant="secondary"
                size="sm"
              >
                Profile
              </Button>
              {user?.isAdmin && (
                <Button
                  onClick={() => setShowAdminMenu(true)}
                  variant="warning"
                  size="sm"
                >
                  🔧 Admin
                </Button>
              )}
              <Button
                onClick={() => setShowStore(true)}
                variant="secondary"
                size="sm"
              >
                🛒 Store
              </Button>
              <Button
                onClick={() => setShowRules(!showRules)}
                variant="secondary"
                size="sm"
              >
                {showRules ? 'Hide Rules' : 'Rules'}
              </Button>
              {isGameAdmin && (
                <Button
                  onClick={() => window.location.hash = 'backoffice'}
                  variant="secondary"
                  size="sm"
                >
                  🔧 BackOffice
                </Button>
              )}
              <LoginButton gameBankroll={me?.bankroll} />
            </>
          )}
        </div>
      </div>

      {/* Error Message Display */}
      {errorMessage && (
        <div className="absolute top-20 left-4 right-4 z-20">
          <div className="bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <span>{errorMessage}</span>
              <button 
                onClick={() => setErrorMessage('')}
                className="text-red-200 hover:text-white ml-4 text-lg"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex h-screen pt-20 pb-4">
        {/* Left Sidebar - Temporarily hidden */}
        {false && <Sidebar title="🎮 Game Controls">
          <div className="space-y-4">
            {!connected && (
              <div className="text-center">
                <Badge variant="warning" className="mb-4">Disconnected</Badge>
                <Button onClick={handleJoinLobby} className="w-full">
                  Reconnect
                </Button>
              </div>
            )}

            {connected && table && (
              <Panel title="🏴‍☠️ Table">
                <div className="space-y-3">
                  <div className="text-sm text-gray-300">
                    <p>Seated: {table?.seats.filter(s => s !== null).length}/{table?.config.maxSeats}</p>
                    <p>Humans: {table?.seats.filter(s => s && !s.isAI).length} (min: {table?.config.minHumanPlayers})</p>
                    <p>Target players: {table?.config.targetTotalPlayers}</p>
                  </div>
                  
                  {!isSeated ? (
                    <Button onClick={handleSitDown} className="w-full" variant="primary">
                      Sit Down at Table
                    </Button>
                  ) : standUpPending ? (
                    <div className="space-y-2">
                      <Button disabled className="w-full" variant="secondary">
                        🚪 Standing up after hand
                      </Button>
                      <Button onClick={handleStandUpImmediate} className="w-full" variant="warning" size="sm">
                        Stand up now (fold hand)
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button onClick={handleStandUp} className="w-full" variant="warning">
                        Stand Up from Table
                      </Button>
                      {game && game.phase !== 'Lobby' && game.phase !== 'HandEnd' && (
                        <Button onClick={handleStandUpImmediate} className="w-full" variant="ghost" size="sm">
                          Stand up now (fold hand)
                        </Button>
                      )}
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    {table?.seats.filter(s => s !== null).map((player) => (
                      <div key={player!.playerId} className="flex justify-between items-center text-sm">
                        <span className={player!.isAI ? "text-yellow-400" : "text-white"}>
                          {player!.name}
                          {player!.isAI && " (AI)"}
                          {player!.playerId === me?.id && " (You)"}
                        </span>
                        <span className="text-gray-400">
                          ${(player!.tableStack / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            {/* Admin Controls - Server verified */}
            {connected && isGameAdmin && table && (
              <Panel title="⚙️ Admin Controls">
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 text-center">
                    Table settings are managed via "⚙️ Table Config" in the top menu
                  </p>
                </div>
              </Panel>
            )}

            {/* Game starts automatically when enough players join */}

            {connected && !isGameAdmin && (
              <Panel title="ℹ️ Info">
                <div className="space-y-3">
                  <p className="text-sm text-gray-400 text-center">
                    {isSeated
                      ? "Game will start automatically when enough players join"
                      : "Only admins can manage AI players"
                    }
                  </p>
                  <Button
                    onClick={() => window.open('/api/hand-history', '_blank')}
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    📜 Hand History (Debug)
                  </Button>
                  <Button
                    onClick={() => window.open('/api/money-flow/audit', '_blank')}
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    💰 Money Flow Audit
                  </Button>
                </div>
              </Panel>
            )}

            {game && (
              <Panel title={`🎯 Game Info`}>
                <div className="space-y-2">
                  <p className="text-sm">Phase: {game.phase || 'Unknown'}</p>
                  <p className="text-sm">
                    Pot: <CurrencyDisplay amount={game.pot || 0} currency={(table?.config?.currency as CurrencyType) || 'TC'} compact />
                  </p>
                  <p className="text-sm">
                    Current Bet: <CurrencyDisplay amount={game.currentBet || 0} currency={(table?.config?.currency as CurrencyType) || 'TC'} compact />
                  </p>
                  
                  {game.phase === 'Lobby' && (
                    <Button onClick={handleStartHand} className="w-full">
                      Start New Hand
                    </Button>
                  )}
                </div>
              </Panel>
            )}

            <Panel title="⏰ Recent Actions">
              <ActionLog entries={actionLog} />
            </Panel>
          </div>
        </Sidebar>}

        {/* Game Table - Always show */}
        <div className="flex-1 px-4">
          {(() => {
              // Create a default empty table if table_state hasn't been received yet
              const defaultTable = {
                seats: Array(8).fill(null),
                config: {
                  minHumanPlayers: 2,
                  targetTotalPlayers: 4,
                  maxSeats: 8,
                  cargoChestLearningMode: false
                }
              };
              const effectiveTable = table || defaultTable;

              // Debug logging
              const fakeGame = effectiveTable ? { phase: 'Lobby', seats: effectiveTable.seats, pot: 0, currentBet: 0 } : null;
              // Create hybrid game object that combines game state with table seats when needed
              let gameToPass;
              const gameSeatedCount = game?.seats?.filter((s: any) => s !== null).length || 0;
              const tableSeatedCount = effectiveTable?.seats?.filter((s: any) => s !== null).length || 0;

              console.log('🔀 Game/Table merge logic:', {
                hasGame: !!game,
                gamePhase: game?.phase,
                gameSeatedCount,
                tableSeatedCount,
                willUseBranch: game && gameSeatedCount >= tableSeatedCount && gameSeatedCount > 0 ? 'GAME_AS_IS' :
                              game && effectiveTable && tableSeatedCount > 0 ? 'HYBRID' : 'FAKE_GAME'
              });

              if (game && gameSeatedCount >= tableSeatedCount && gameSeatedCount > 0) {
                // Game has all players from table - use it as-is
                console.log('✅ Using game as-is');
                gameToPass = game;
              } else if (game && effectiveTable && tableSeatedCount > 0) {
                // Game exists but missing players from table - create hybrid with properly mapped seats
                console.log('🔀 Creating hybrid game');

                const hybridSeats = effectiveTable.seats.map((tableSeat: any) => {
                  if (!tableSeat) return null;
                  // Convert table seat to game seat format with default game properties
                  return {
                    playerId: tableSeat.id || tableSeat.playerId,
                    name: tableSeat.name,
                    isAI: tableSeat.isAI,
                    tableStack: tableSeat.tableStack || 0, // Prevent undefined
                    dice: [],
                    hasFolded: false,
                    lockAllowance: 0,
                    minLocksRequired: 1,
                    currentBet: 0,
                    isActive: false,
                    lockingDone: false,
                    hasActed: false,
                    cosmetics: tableSeat.cosmetics || {
                      banner: 'classic',
                      emblem: 'none',
                      title: 'none',
                      highSkin: 'bone-classic',
                      lowSkin: 'pearl-simple'
                    }
                  };
                });
                gameToPass = { ...game, seats: hybridSeats };
              } else {
                // No active game - use fakeGame
                console.log('⚠️ Using fakeGame (Lobby phase)');
                gameToPass = fakeGame;
              }

              // CRITICAL DEBUG: Log what's being passed to ImprovedGameTable
              console.log('🎯 Rendering ImprovedGameTable with:', {
                hasGame: !!gameToPass,
                phase: gameToPass?.phase,
                seatsCount: gameToPass?.seats?.length,
                meId: me?.id,
                userName: user?.name
              });

              // Always render ImprovedGameTable (even if table_state hasn't arrived yet)
              // ImprovedGameTable will show the sit-down button when meId exists
              return (
                <ImprovedGameTable
                  game={gameToPass}
                  meId={me?.id || ''}
                  userName={user?.name}
                  onPlayerAction={handlePlayerGameAction}
                  onLockSelect={handleLockSelect}
                  onLockDone={() => socket?.emit('lock_done')}
                  onSitDown={handleModalSitDown}
                  actionLog={actionLog}
                  setActionLog={setActionLog}
                  tableConfig={effectiveTable?.config}
                  myCosmetics={{
                    banner: cosmetics.banner || 'classic',
                    emblem: cosmetics.emblem || 'none',
                    title: cosmetics.title || 'none',
                    highSkin: cosmetics.highSkin || 'bone-classic',
                    lowSkin: cosmetics.lowSkin || 'pearl-simple'
                  }}
                  currency={(table?.config?.currency as CurrencyType) || 'TC'}
                />
              );
            })()}
        </div>
      </div>

      {/* Profile Modal */}
      <PlayerProfile
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        mySeat={game?.seats.find((s: any) => s?.playerId === me?.id)}
        onStandUp={handleStandUp}
        onTopUp={handleTopUp}
        versionInfo={versionInfo}
        buildTimestamp={BUILD_TIMESTAMP}
        debugInfo={{
          phase: game?.phase,
          isGameActive: game && game.phase !== 'Lobby' && game.phase !== 'PreHand',
          meId: me?.id,
          hasFolded: game?.seats.find((s: any) => s?.playerId === me?.id)?.hasFolded
        }}
      />

      {/* Admin Menu Modal */}
      {showAdminMenu && user?.isAdmin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-[600px] max-w-[90vw] border border-slate-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">🔧 Admin Panel</h2>
              <button
                onClick={() => setShowAdminMenu(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* AI Management Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3">AI Players</h3>
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      if (socket) {
                        socket.emit('add_ai', { count: 1 })
                        addToActionLog('Admin', 'Adding 1 AI player', '', false)
                      }
                    }}
                    variant="primary"
                    className="w-full"
                  >
                    ➕ Add 1 AI Player
                  </Button>
                  <Button
                    onClick={() => {
                      if (socket) {
                        socket.emit('add_ai', { count: 3 })
                        addToActionLog('Admin', 'Adding 3 AI players', '', false)
                      }
                    }}
                    variant="secondary"
                    className="w-full"
                  >
                    ➕ Add 3 AI Players
                  </Button>
                  <p className="text-xs text-gray-400">
                    AI players will sit down and play automatically
                  </p>
                </div>
              </div>

              {/* Game Controls Section */}
              <div className="border-t border-slate-600 pt-4">
                <h3 className="text-lg font-semibold mb-3">Game Controls</h3>
                <div className="p-3 bg-yellow-900/30 border border-yellow-600/50 rounded mb-3">
                  <p className="text-sm text-yellow-300">
                    ⚠️ These actions will affect all players at the table.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={handleResetGame}
                    variant="warning"
                    className="w-full"
                  >
                    🔄 Reset to Lobby
                  </Button>
                  <p className="text-xs text-gray-400">
                    Returns all players to lobby, preserving their seats and stacks
                  </p>

                  <Button
                    onClick={handleRestartGame}
                    variant="warning"
                    className="w-full"
                  >
                    ♻️ Restart Current Hand
                  </Button>
                  <p className="text-xs text-gray-400">
                    Restarts the current hand from the beginning
                  </p>
                </div>
              </div>

              {/* BackOffice Link */}
              <div className="border-t border-slate-600 pt-4">
                <Button
                  onClick={() => {
                    setShowAdminMenu(false)
                    window.location.hash = 'backoffice'
                  }}
                  variant="primary"
                  className="w-full"
                >
                  🔧 Open BackOffice
                </Button>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Hand analysis, debugging tools, and dice lab
                </p>
              </div>

              <Button
                onClick={() => setShowAdminMenu(false)}
                variant="ghost"
                className="w-full mt-4"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {/* Store Modal */}
      <Store
            isOpen={showStore}
            onClose={() => setShowStore(false)}
          />

      {/* Rules Modal */}
      <RulesModal
        isOpen={showRules}
        onClose={() => setShowRules(false)}
        cargoChestValue={game?.cargoChest?.currentValue || 0}
      />

      {/* Buy-in Modal */}
      <BuyInModalToUse
        isOpen={showBuyInModal}
        onClose={() => setShowBuyInModal(false)}
        onConfirm={confirmBuyIn}
        minBuyIn={table?.config?.minBuyIn || 1000}
        maxBuyIn={me?.bankroll || 10000}
        userBalance={me?.bankroll || 0}
        currency={(table?.config?.currency as CurrencyType) || 'TC'}
        initialAmount={buyInAmount}
      />

      {/* Version Info moved to Profile menu */}
    </div>
  )
}