/**
 * Last Breath Shared Run Client
 *
 * FIXED LAYOUT - Same structure always, content changes based on state
 * - Left: Stats panel (always visible)
 * - Center: Main view with airlock (always visible)
 * - Right: Players/Events (always visible)
 *
 * NEW MECHANICS:
 * - Game loop runs continuously when players are connected
 * - Players set "stakes" that auto-join them in the next dive
 * - Can set stake at any time (during dive, after exfil, etc.)
 * - No waiting for stakes - loop keeps rolling
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

const TopNav = ({ onBack }: { onBack: () => void }) => (
  <div style={{
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid #334155',
    padding: '12px 24px'
  }}>
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#9ca3af',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'monospace'
        }}
      >
        ← Back to Games
      </button>
      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '20px' }}>Last Breath</div>
      <div style={{ width: '100px' }} />
    </div>
  </div>
);

interface Player {
  playerId: string;
  playerName: string;
  bid: number;
  active: boolean;
  exfiltrated: boolean;
  bustReason?: 'oxygen' | 'suit' | 'hazard';
  bustDepth?: number;
  exfiltrateDepth?: number;
  payout?: number;
  joinedAtDepth: number;
}

interface PendingStake {
  playerId: string;
  playerName: string;
  bid: number;
}

interface GameEvent {
  type: 'micro-leak' | 'air-canister' | 'structural-brace' | 'surge';
  description: string;
}

interface RunState {
  runId: string;
  tableId: string;
  seed: number;
  depth: number;
  O2: number;
  Suit: number;
  Corruption: number;
  DataMultiplier: number;
  phase: 'lobby' | 'descending' | 'completed';
  active: boolean;
  currentEvents: GameEvent[];
  eventHistory: GameEvent[];
  players: Player[];
  nextAdvanceAt?: number;
  autoStartAt?: number;
}

interface SharedRunClientProps {
  socket?: Socket | null;
  tableId?: string;
  playerName?: string;
  onLeaveTable?: () => void;
}

const BUY_IN_OPTIONS = [50, 100, 250, 500, 1000];

export const SharedRunClient: React.FC<SharedRunClientProps> = ({
  socket: platformSocket = null,
  tableId = '',
  playerName = 'Player',
  onLeaveTable
}) => {
  const socket = platformSocket;
  const [runState, setRunState] = useState<RunState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [bid, setBid] = useState<number>(100);
  const [countdown, setCountdown] = useState<number>(0);
  const [doorOpen, setDoorOpen] = useState<boolean>(false);
  const [eventGlow, setEventGlow] = useState<string>('rgba(0, 221, 255, 0.3)');
  const [tableJoined, setTableJoined] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{ won: boolean; payout: number; depth: number } | null>(null);
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [nextRunCountdown, setNextRunCountdown] = useState<number>(0);
  const [nextAdvanceCountdown, setNextAdvanceCountdown] = useState<number>(0);
  const [pendingStakes, setPendingStakes] = useState<PendingStake[]>([]);
  const [myStakeSet, setMyStakeSet] = useState<boolean>(false);
  const [myStakeAmount, setMyStakeAmount] = useState<number>(0);

  const getMyPlayer = useCallback((): Player | undefined => {
    return runState?.players.find(p => p.playerId === myPlayerId || p.playerId === socket?.id);
  }, [runState, myPlayerId, socket?.id]);

  const myPlayer = getMyPlayer();
  const amInRun = !!myPlayer;
  const amActive = myPlayer?.active === true;

  // Check if I have a pending stake
  const myPendingStake = pendingStakes.find(s => s.playerId === myPlayerId || s.playerId === socket?.id);
  const hasPendingStake = myStakeSet || !!myPendingStake;

  // Set stake for next dive
  const setStake = useCallback(() => {
    if (!socket || !tableJoined) return;
    console.log('[Last Breath] Setting stake:', bid);
    socket.emit('set_stake', { playerName, bid });
  }, [socket, tableJoined, playerName, bid]);

  // Clear stake (opt out)
  const clearStake = useCallback(() => {
    if (!socket || !tableJoined) return;
    console.log('[Last Breath] Clearing stake');
    socket.emit('clear_stake');
    setMyStakeSet(false);
    setMyStakeAmount(0);
  }, [socket, tableJoined]);

  useEffect(() => {
    if (!socket) return;
    setMyPlayerId(socket.id || '');

    const handleTableJoined = (data: {
      tableId: string;
      currentRun: RunState | null;
      nextRunAt: number | null;
      pendingStakes?: PendingStake[];
      watcherCount?: number;
    }) => {
      console.log('[Last Breath] Table joined:', data.tableId, 'currentRun:', data.currentRun?.phase, 'nextRunAt:', data.nextRunAt, 'pendingStakes:', data.pendingStakes?.length);
      setTableJoined(true);
      if (data.currentRun) {
        setRunState(data.currentRun);
      } else {
        setRunState(null);
      }
      setNextRunAt(data.nextRunAt);
      if (data.pendingStakes) {
        setPendingStakes(data.pendingStakes);
        // Check if I have a pending stake
        const myStake = data.pendingStakes.find(s => s.playerId === socket.id);
        if (myStake) {
          setMyStakeSet(true);
          setMyStakeAmount(myStake.bid);
        }
      }
    };

    socket.on('table_joined', handleTableJoined);

    if (socket.connected && tableId) {
      socket.emit('join_table', { tableId });
    }

    const handleConnect = () => {
      setMyPlayerId(socket.id || '');
      if (tableId) socket.emit('join_table', { tableId });
    };

    socket.on('connect', handleConnect);

    // Stake confirmed
    const handleStakeConfirmed = (data: { playerId: string; bid: number; pendingStakes: PendingStake[] }) => {
      if (data.playerId === socket.id) {
        setMyStakeSet(true);
        setMyStakeAmount(data.bid);
        setMessage(`Stake set: ${data.bid} TC for next dive`);
      }
      setPendingStakes(data.pendingStakes);
    };

    // Stake set by someone (broadcast)
    const handleStakeSet = (data: { playerId: string; playerName: string; bid: number; pendingStakes: PendingStake[] }) => {
      setPendingStakes(data.pendingStakes);
      if (data.playerId !== socket.id) {
        setMessage(`${data.playerName} set stake: ${data.bid} TC`);
      }
    };

    // Stake cleared
    const handleStakeCleared = (data: { playerId: string; pendingStakes: PendingStake[] }) => {
      setPendingStakes(data.pendingStakes);
      if (data.playerId === socket.id) {
        setMyStakeSet(false);
        setMyStakeAmount(0);
      }
    };

    const handleStakeClearedConfirm = (data: { playerId: string }) => {
      if (data.playerId === socket.id) {
        setMyStakeSet(false);
        setMyStakeAmount(0);
        setMessage('Stake cleared');
      }
    };

    const handleRunJoined = (data: { runId: string; state: RunState; pendingStakes?: PendingStake[] }) => {
      setRunState(data.state);
      setNextRunAt(null);
      setMessage('');
      if (data.pendingStakes) {
        setPendingStakes(data.pendingStakes);
      }
    };

    const handlePlayerJoinedRun = (data: { playerName: string; playerCount: number; autoStartAt?: number }) => {
      setMessage(`${data.playerName} joined! (${data.playerCount} divers)`);
      if (data.autoStartAt !== undefined) {
        setRunState(prev => prev ? { ...prev, autoStartAt: data.autoStartAt as number } : prev);
      }
    };

    const handleDescentStarted = (data: { state: RunState }) => {
      setRunState(data.state);
      setMessage('Descent begins!');
      setLastResult(null); // Clear last result when new dive starts
    };

    const handleStateUpdate = (data: { state: RunState }) => setRunState(data.state);

    const handlePlayerExfiltrated = (data: { playerId: string; depth: number; payout: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) setMessage(`${player.playerName} exfiltrated at ${data.depth}m: +${data.payout} TC`);
      if (data.playerId === myPlayerId || data.playerId === socket.id) {
        setLastResult({ won: true, payout: data.payout, depth: data.depth });
      }
    };

    const handlePlayerBusted = (data: { playerId: string; reason: string; depth: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) setMessage(`${player.playerName} BUSTED at ${data.depth}m (${data.reason})`);
      if (data.playerId === myPlayerId || data.playerId === socket.id) {
        setLastResult({ won: false, payout: 0, depth: data.depth });
      }
    };

    const handleRunAdvanced = (data: { depth: number; events: GameEvent[]; state: RunState }) => {
      setDoorOpen(true);
      if (data.events.length > 0) {
        const event = data.events[0];
        if (event) {
          const glowColors: Record<string, string> = {
            'surge': 'rgba(255, 200, 50, 0.5)',
            'micro-leak': 'rgba(0, 200, 255, 0.5)',
            'structural-brace': 'rgba(50, 255, 150, 0.4)',
            'air-canister': 'rgba(100, 200, 255, 0.4)'
          };
          setEventGlow(glowColors[event.type] || 'rgba(0, 221, 255, 0.3)');
        }
        setMessage(data.events.map(e => e.description).join(', '));
      } else {
        setEventGlow('rgba(0, 221, 255, 0.3)');
      }
      setTimeout(() => {
        setDoorOpen(false);
        setRunState(data.state);
      }, 500);
    };

    const handleRunCompleted = (data: { depth: number; finalState: RunState }) => {
      setRunState(data.finalState);
      setMessage(`Dive ended at ${data.depth}m`);
    };

    const handleNextRunScheduled = (data: { nextRunAt: number }) => {
      setNextRunAt(data.nextRunAt);
      setRunState(null);
    };

    const handleLobbyCreated = (data: { runId: string; state: RunState; autoStartAt?: number }) => {
      setRunState(data.state);
      setNextRunAt(null);
      setLastResult(null); // Clear result for new lobby
    };

    const handleError = (data: { message: string }) => setMessage(`Error: ${data.message}`);

    socket.on('stake_confirmed', handleStakeConfirmed);
    socket.on('stake_set', handleStakeSet);
    socket.on('stake_cleared', handleStakeCleared);
    socket.on('stake_cleared_confirm', handleStakeClearedConfirm);
    socket.on('run_joined', handleRunJoined);
    socket.on('player_joined_run', handlePlayerJoinedRun);
    socket.on('descent_started', handleDescentStarted);
    socket.on('state_update', handleStateUpdate);
    socket.on('player_exfiltrated', handlePlayerExfiltrated);
    socket.on('player_busted', handlePlayerBusted);
    socket.on('run_advanced', handleRunAdvanced);
    socket.on('run_completed', handleRunCompleted);
    socket.on('next_run_scheduled', handleNextRunScheduled);
    socket.on('lobby_created', handleLobbyCreated);
    socket.on('error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('table_joined', handleTableJoined);
      socket.off('stake_confirmed', handleStakeConfirmed);
      socket.off('stake_set', handleStakeSet);
      socket.off('stake_cleared', handleStakeCleared);
      socket.off('stake_cleared_confirm', handleStakeClearedConfirm);
      socket.off('run_joined', handleRunJoined);
      socket.off('player_joined_run', handlePlayerJoinedRun);
      socket.off('descent_started', handleDescentStarted);
      socket.off('state_update', handleStateUpdate);
      socket.off('player_exfiltrated', handlePlayerExfiltrated);
      socket.off('player_busted', handlePlayerBusted);
      socket.off('run_advanced', handleRunAdvanced);
      socket.off('run_completed', handleRunCompleted);
      socket.off('next_run_scheduled', handleNextRunScheduled);
      socket.off('lobby_created', handleLobbyCreated);
      socket.off('error', handleError);
    };
  }, [socket, tableId, playerName, myPlayerId]);

  // Countdown timers
  useEffect(() => {
    if (!runState?.autoStartAt || runState.phase !== 'lobby') { setCountdown(0); return; }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((runState.autoStartAt! - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [runState?.autoStartAt, runState?.phase]);

  useEffect(() => {
    if (!nextRunAt) { setNextRunCountdown(0); return; }
    const interval = setInterval(() => {
      setNextRunCountdown(Math.max(0, Math.ceil((nextRunAt - Date.now()) / 1000)));
    }, 100);
    return () => clearInterval(interval);
  }, [nextRunAt]);

  useEffect(() => {
    if (!runState?.nextAdvanceAt || runState.phase !== 'descending') { setNextAdvanceCountdown(0); return; }
    const interval = setInterval(() => {
      setNextAdvanceCountdown(Math.max(0, Math.ceil((runState.nextAdvanceAt! - Date.now()) / 1000)));
    }, 100);
    return () => clearInterval(interval);
  }, [runState?.nextAdvanceAt, runState?.phase]);

  const handleExfiltrate = () => socket?.emit('player_decision', { decision: 'exfiltrate' });
  const handleBack = () => { window.location.hash = ''; };

  const getO2Color = (o2: number) => o2 > 60 ? '#00ff00' : o2 > 30 ? '#ffff00' : '#ff0000';
  const getSuitColor = (suit: number) => suit > 0.7 ? '#00ff00' : suit > 0.4 ? '#ffff00' : '#ff0000';

  const isLobby = runState?.phase === 'lobby';
  const isDescending = runState?.phase === 'descending';
  const isCompleted = runState?.phase === 'completed';
  const isWaiting = !runState && nextRunAt !== null;

  // Status text for header
  const getStatusText = () => {
    if (!tableJoined) return 'CONNECTING...';
    if (isWaiting) return `NEXT DIVE IN ${nextRunCountdown}`;
    if (isLobby) return `DIVE LAUNCHING IN ${countdown}`;
    if (isDescending) return `DEPTH ${runState?.depth || 0}m`;
    if (isCompleted) return 'DIVE COMPLETE';
    return 'WAITING...';
  };

  // Can I change my stake? (not while actively in a descending dive)
  const canChangeStake = !amActive || !isDescending;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', fontFamily: 'monospace' }}>
      <TopNav onBack={handleBack} />

      {/* FIXED 3-COLUMN LAYOUT - ALWAYS THE SAME STRUCTURE */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '20px',
        display: 'grid',
        gridTemplateColumns: '220px 1fr 220px',
        gap: '20px',
        minHeight: 'calc(100vh - 80px)'
      }}>
        {/* LEFT PANEL - Stats (always visible) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* My Result Banner */}
          {lastResult && (
            <div style={{
              padding: '10px',
              backgroundColor: lastResult.won ? '#1a3320' : '#331a1a',
              border: `2px solid ${lastResult.won ? '#44aa44' : '#aa4444'}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '18px', color: lastResult.won ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>
                {lastResult.won ? `+${lastResult.payout} TC` : 'BUSTED'}
              </div>
            </div>
          )}

          {/* Depth */}
          <div style={{
            padding: '12px',
            backgroundColor: '#1a2530',
            border: '2px solid #00ddff',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '10px', color: '#88ccff', marginBottom: '4px' }}>DEPTH</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#00ddff' }}>
              {isDescending || isCompleted ? `${runState?.depth || 0}m` : '--'}
            </div>
          </div>

          {/* Vitals */}
          <div style={{ padding: '10px', backgroundColor: '#1a2530', border: '2px solid #335577', borderRadius: '8px' }}>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', color: '#88ccff' }}>OXYGEN</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: runState ? getO2Color(runState.O2) : '#446688' }}>
                {runState ? runState.O2.toFixed(0) : '--'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '9px', color: '#88ccff' }}>SUIT</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: runState ? getSuitColor(runState.Suit) : '#446688' }}>
                {runState ? `${(runState.Suit * 100).toFixed(0)}%` : '--'}
              </div>
            </div>
          </div>

          {/* Corruption */}
          <div style={{
            padding: '8px',
            backgroundColor: '#1a2530',
            border: '2px solid #ff6600',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '9px', color: '#ff9944' }}>CORRUPTION</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff6600' }}>
              {runState ? runState.Corruption : '--'}
            </div>
          </div>

          {/* Data Multiplier */}
          <div style={{
            padding: '10px',
            backgroundColor: 'rgba(255, 221, 0, 0.1)',
            border: '2px solid #ffdd00',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '9px', color: '#ffdd00' }}>MULTIPLIER</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffdd00' }}>
              {runState ? `${runState.DataMultiplier.toFixed(2)}x` : '1.00x'}
            </div>
            {amInRun && runState && (
              <div style={{ fontSize: '11px', color: '#ffaa00', marginTop: '2px' }}>
                = {Math.floor((myPlayer?.bid || bid) * runState.DataMultiplier)} TC
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL - Main View */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {/* Status Header */}
          <div style={{
            textAlign: 'center',
            padding: '15px',
            backgroundColor: '#1a2530',
            border: '2px solid #00ddff',
            borderRadius: '8px'
          }}>
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: isDescending ? '#00ddff' : isCompleted ? (lastResult?.won ? '#00ff88' : '#ff4444') : '#ffdd00'
            }}>
              {getStatusText()}
            </div>
            {isLobby && (
              <div style={{ fontSize: '14px', color: '#88ccff', marginTop: '5px' }}>
                {runState?.players.length || 0} Diver{(runState?.players.length || 0) !== 1 ? 's' : ''} Ready
              </div>
            )}
          </div>

          {/* Airlock Door - ALWAYS VISIBLE */}
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            backgroundColor: '#0a0a0f',
            border: '4px solid #1a2530',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: `0 0 25px ${eventGlow}`
          }}>
            {/* Background */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at center, rgba(0, 100, 150, 0.2) 0%, rgba(0, 0, 0, 1) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isDescending && <div style={{ fontSize: '60px', opacity: 0.2, color: '#006480' }}>🌊</div>}
              {!isDescending && <div style={{ fontSize: '80px', opacity: 0.3 }}>🤿</div>}
            </div>

            {/* Left Door */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '50%',
              height: '100%',
              backgroundColor: '#1a2530',
              backgroundImage: 'linear-gradient(90deg, #0f1419 0%, #1a2530 100%)',
              borderRight: `2px solid ${eventGlow}`,
              transform: doorOpen ? 'translateX(-100%)' : 'translateX(0)',
              transition: 'transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)'
            }} />

            {/* Right Door */}
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '50%',
              height: '100%',
              backgroundColor: '#1a2530',
              backgroundImage: 'linear-gradient(270deg, #0f1419 0%, #1a2530 100%)',
              borderLeft: `2px solid ${eventGlow}`,
              transform: doorOpen ? 'translateX(100%)' : 'translateX(0)',
              transition: 'transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)'
            }} />

            {/* Center overlay text when not descending */}
            {!isDescending && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
              }}>
                {isLobby && countdown > 0 && (
                  <div style={{
                    fontSize: '120px',
                    fontWeight: 'bold',
                    color: countdown <= 3 ? '#ff3344' : '#ffdd00',
                    textShadow: `0 0 40px ${countdown <= 3 ? 'rgba(255, 51, 68, 0.8)' : 'rgba(255, 221, 0, 0.5)'}`
                  }}>
                    {countdown}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Area */}
          <div style={{
            padding: '15px',
            backgroundColor: '#1a2530',
            border: '2px solid #335577',
            borderRadius: '8px'
          }}>
            {/* Active in run - show exfiltrate */}
            {amActive && isDescending && (
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={handleExfiltrate}
                  style={{
                    padding: '14px 40px',
                    fontSize: '20px',
                    backgroundColor: '#00ff88',
                    color: '#000',
                    border: '3px solid #ffdd00',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    boxShadow: '0 0 20px rgba(0, 255, 136, 0.5)'
                  }}
                >
                  EXFILTRATE
                </button>
                <div style={{ fontSize: '11px', color: '#6699cc', marginTop: '6px' }}>
                  Next depth in {nextAdvanceCountdown}s
                </div>
              </div>
            )}

            {/* Stake selection - show when NOT actively descending OR when spectating */}
            {canChangeStake && (
              <div style={{ textAlign: 'center' }}>
                {/* Show current stake status */}
                {hasPendingStake && (
                  <div style={{
                    marginBottom: '12px',
                    padding: '8px',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    border: '1px solid #00ff88',
                    borderRadius: '6px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#00ff88' }}>
                      ✓ STAKE SET: {myStakeAmount || myPendingStake?.bid || bid} TC
                    </div>
                    <div style={{ fontSize: '10px', color: '#6699cc', marginTop: '2px' }}>
                      You'll auto-join the next dive
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '12px', color: '#6699cc', marginBottom: '8px' }}>
                  {hasPendingStake ? 'CHANGE STAKE' : 'SET STAKE FOR NEXT DIVE'}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '12px' }}>
                  {BUY_IN_OPTIONS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBid(amount)}
                      style={{
                        padding: '8px 14px',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        backgroundColor: bid === amount ? '#00ddff' : '#0f1419',
                        color: bid === amount ? '#000' : '#00ddff',
                        border: `2px solid ${bid === amount ? '#00ddff' : '#335577'}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                    onClick={setStake}
                    style={{
                      padding: '12px 30px',
                      fontSize: '16px',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      backgroundColor: '#00ff88',
                      color: '#000',
                      border: '3px solid #00ff88',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)'
                    }}
                  >
                    {hasPendingStake ? 'UPDATE' : 'SET'} STAKE - {bid} TC
                  </button>
                  {hasPendingStake && (
                    <button
                      onClick={clearStake}
                      style={{
                        padding: '12px 20px',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        backgroundColor: 'transparent',
                        color: '#ff6666',
                        border: '2px solid #ff6666',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      OPT OUT
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* In run but spectating (exfiltrated/busted) - already handled by canChangeStake */}
            {amInRun && !amActive && isDescending && !canChangeStake && (
              <div style={{ textAlign: 'center', color: '#6699cc' }}>
                Watching dive continue...
              </div>
            )}

            {/* Additional info during lobby */}
            {isLobby && amInRun && (
              <div style={{ textAlign: 'center', color: '#00ff88', marginTop: '10px' }}>
                YOUR STAKE: {myPlayer?.bid} TC - Waiting for launch...
              </div>
            )}
          </div>

          {/* Message */}
          {message && (
            <div style={{
              fontSize: '12px',
              color: '#00ddff',
              backgroundColor: 'rgba(0, 221, 255, 0.1)',
              padding: '8px 12px',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Players & Events (always visible) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Pending Stakes */}
          {pendingStakes.length > 0 && (
            <div style={{
              padding: '10px',
              backgroundColor: '#1a2530',
              border: '2px solid #00ff88',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '10px', color: '#00ff88', marginBottom: '6px', fontWeight: 'bold' }}>
                NEXT DIVE ({pendingStakes.length})
              </div>
              {pendingStakes.slice(0, 5).map((stake) => {
                const isMe = stake.playerId === myPlayerId || stake.playerId === socket?.id;
                return (
                  <div key={stake.playerId} style={{
                    fontSize: '9px',
                    padding: '3px 6px',
                    marginBottom: '2px',
                    backgroundColor: isMe ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '3px',
                    color: '#00ff88'
                  }}>
                    {stake.playerName}{isMe && ' (You)'}: {stake.bid} TC
                  </div>
                );
              })}
              {pendingStakes.length > 5 && (
                <div style={{ fontSize: '9px', color: '#6699cc' }}>+{pendingStakes.length - 5} more</div>
              )}
            </div>
          )}

          {/* Event Log */}
          <div style={{
            padding: '10px',
            backgroundColor: '#1a2530',
            border: '2px solid #335577',
            borderRadius: '8px',
            maxHeight: '180px',
            overflowY: 'auto'
          }}>
            <div style={{ fontSize: '10px', color: '#00ddff', marginBottom: '6px', fontWeight: 'bold' }}>EVENT LOG</div>
            {(!runState || runState.eventHistory.length === 0) && (
              <div style={{ fontSize: '10px', color: '#446688' }}>No events yet...</div>
            )}
            {runState?.eventHistory.slice(-6).reverse().map((event, idx) => {
              const icons: Record<string, string> = { 'surge': '⚡', 'micro-leak': '💧', 'air-canister': '🫧', 'structural-brace': '🔧' };
              const colors: Record<string, string> = { 'surge': '#ffdd00', 'micro-leak': '#00ddff', 'air-canister': '#88ccff', 'structural-brace': '#00ff88' };
              return (
                <div key={idx} style={{
                  fontSize: '9px',
                  marginBottom: '4px',
                  padding: '4px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '3px',
                  borderLeft: `3px solid ${colors[event.type] || '#88ccff'}`,
                  display: 'flex',
                  gap: '4px'
                }}>
                  <span>{icons[event.type] || '•'}</span>
                  <span style={{ color: '#88ccff' }}>{event.description}</span>
                </div>
              );
            })}
          </div>

          {/* Current Dive Players */}
          <div style={{
            padding: '10px',
            backgroundColor: '#1a2530',
            border: '2px solid #335577',
            borderRadius: '8px',
            flex: 1,
            overflowY: 'auto'
          }}>
            <div style={{ fontSize: '10px', color: '#00ddff', marginBottom: '6px', fontWeight: 'bold' }}>
              CURRENT DIVERS ({runState?.players.length || 0})
            </div>
            {(!runState || runState.players.length === 0) && (
              <div style={{ fontSize: '10px', color: '#446688' }}>No divers yet...</div>
            )}
            {runState?.players.map((player) => {
              const isMe = player.playerId === myPlayerId || player.playerId === socket?.id;
              const statusColor = player.active ? '#00ff88' : player.exfiltrated ? '#ffdd00' : '#ff4444';
              return (
                <div key={player.playerId} style={{
                  padding: '5px',
                  marginBottom: '4px',
                  backgroundColor: isMe ? 'rgba(0, 221, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${statusColor}`,
                  borderRadius: '4px'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>
                    {player.playerName}{isMe && ' (You)'}
                  </div>
                  <div style={{ fontSize: '9px', color: statusColor, marginTop: '2px' }}>
                    {player.active && runState && `${Math.floor(player.bid * runState.DataMultiplier)} TC`}
                    {player.exfiltrated && `Exfil: ${player.payout} TC`}
                    {!player.active && !player.exfiltrated && `Busted`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
