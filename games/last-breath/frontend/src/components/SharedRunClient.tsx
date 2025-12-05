/**
 * Last Breath Shared Run Client
 *
 * Server-driven continuous loop design:
 * - Server manages all run lifecycle and timing
 * - Client syncs state on table join and via events
 * - No local timers for run scheduling
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

const TopNav = ({ onBack }: { onBack: () => void }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700 px-6 py-3">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Back to Games</span>
      </button>
      <div className="text-white font-bold text-xl">Last Breath</div>
      <div className="w-24" />
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

  // Am I in the current run?
  const getMyPlayer = useCallback((): Player | undefined => {
    return runState?.players.find(p => p.playerId === myPlayerId || p.playerId === socket?.id);
  }, [runState, myPlayerId, socket?.id]);

  const myPlayer = getMyPlayer();
  const amInRun = !!myPlayer;
  const amSpectator = myPlayer && !myPlayer.active;

  // Join the current/next run
  const joinRun = useCallback(() => {
    if (!socket || !tableJoined) return;
    console.log('[Last Breath] Joining run with bid:', bid);
    socket.emit('join_run', { playerName, bid });
    setLastResult(null);
  }, [socket, tableJoined, playerName, bid]);

  useEffect(() => {
    if (!socket) return;

    setMyPlayerId(socket.id || '');

    // Handle table joined - now includes current state!
    const handleTableJoined = (data: { tableId: string; currentRun: RunState | null; nextRunAt: number | null }) => {
      console.log('[Last Breath] Table joined:', data.tableId, 'currentRun:', data.currentRun?.phase, 'nextRunAt:', data.nextRunAt);
      setTableJoined(true);

      // Sync with server state
      if (data.currentRun) {
        setRunState(data.currentRun);
        // If there's a current run, join its socket room
        if (data.currentRun.runId) {
          socket.emit('join_run_room', { runId: data.currentRun.runId });
        }
      } else {
        setRunState(null);
      }

      setNextRunAt(data.nextRunAt);
    };

    socket.on('table_joined', handleTableJoined);

    if (socket.connected && tableId) {
      console.log('[Last Breath] Socket connected, joining table:', tableId);
      socket.emit('join_table', { tableId });
    }

    const handleConnect = () => {
      console.log('[Last Breath] Socket reconnected');
      setMyPlayerId(socket.id || '');
      if (tableId) {
        socket.emit('join_table', { tableId });
      }
    };

    socket.on('connect', handleConnect);

    const handleRunJoined = (data: { runId: string; state: RunState; config: any; autoStartAt?: number }) => {
      console.log('[Last Breath] Run joined:', data.state.phase);
      setRunState(data.state);
      setNextRunAt(null); // Clear next run timer since we're in a run
      setMessage('');
    };

    const handlePlayerJoinedRun = (data: { playerName: string; playerCount: number; autoStartAt?: number }) => {
      setMessage(`${data.playerName} joined! (${data.playerCount} divers)`);
      // Update autoStartAt if provided (first player triggers timer)
      if (data.autoStartAt !== undefined) {
        setRunState(prev => prev ? { ...prev, autoStartAt: data.autoStartAt as number } : prev);
      }
    };

    const handleDescentStarted = (data: { state: RunState }) => {
      console.log('[Last Breath] Descent started!');
      setRunState(data.state);
      setMessage('Descent begins!');
    };

    const handleStateUpdate = (data: { state: RunState }) => {
      setRunState(data.state);
    };

    const handlePlayerExfiltrated = (data: { playerId: string; depth: number; payout: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) {
        setMessage(`${player.playerName} exfiltrated at ${data.depth}m: +${data.payout} TC`);
      }
      if (data.playerId === myPlayerId || data.playerId === socket.id) {
        setLastResult({ won: true, payout: data.payout, depth: data.depth });
      }
    };

    const handlePlayerBusted = (data: { playerId: string; reason: string; depth: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) {
        setMessage(`${player.playerName} BUSTED at ${data.depth}m (${data.reason})`);
      }
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
      console.log('[Last Breath] Run completed at depth:', data.depth);
      setRunState(data.finalState);
      setMessage(`Dive ended at ${data.depth}m`);
    };

    // New server-driven events
    const handleNextRunScheduled = (data: { nextRunAt: number }) => {
      console.log('[Last Breath] Next run scheduled at:', data.nextRunAt);
      setNextRunAt(data.nextRunAt);
      setRunState(null); // Clear old run state
    };

    const handleLobbyCreated = (data: { runId: string; state: RunState }) => {
      console.log('[Last Breath] Lobby created:', data.runId);
      setRunState(data.state);
      setNextRunAt(null);
    };

    const handleError = (data: { message: string }) => {
      setMessage(`Error: ${data.message}`);
    };

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

  // Countdown timer for lobby auto-start
  useEffect(() => {
    if (!runState?.autoStartAt || runState.phase !== 'lobby') {
      setCountdown(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((runState.autoStartAt! - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [runState?.autoStartAt, runState?.phase]);

  // Countdown timer for next run (server-driven)
  useEffect(() => {
    if (!nextRunAt) {
      setNextRunCountdown(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRunAt - Date.now()) / 1000));
      setNextRunCountdown(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [nextRunAt]);

  // Countdown timer for next advance during descent
  useEffect(() => {
    if (!runState?.nextAdvanceAt || runState.phase !== 'descending') {
      setNextAdvanceCountdown(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((runState.nextAdvanceAt! - Date.now()) / 1000));
      setNextAdvanceCountdown(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [runState?.nextAdvanceAt, runState?.phase]);

  const handleExfiltrate = () => {
    if (socket) {
      socket.emit('player_decision', { decision: 'exfiltrate' });
    }
  };

  const handleBack = () => {
    window.location.hash = '';
  };

  const getO2Color = (o2: number): string => {
    if (o2 > 60) return '#00ff00';
    if (o2 > 30) return '#ffff00';
    return '#ff0000';
  };

  const getSuitColor = (suit: number): string => {
    if (suit > 0.7) return '#00ff00';
    if (suit > 0.4) return '#ffff00';
    return '#ff0000';
  };

  const isLobby = runState?.phase === 'lobby';
  const isDescending = runState?.phase === 'descending';
  const isCompleted = runState?.phase === 'completed';
  // Waiting for next run: no current run but we have a nextRunAt timestamp
  const isWaitingForNextRun = !runState && tableJoined && nextRunAt !== null;
  // Ready to join: lobby exists (empty or with players) and we're not in it
  const isReadyToJoin = isLobby && !amInRun;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', fontFamily: 'monospace' }}>
      <TopNav onBack={handleBack} />

      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '20px',
        display: 'grid',
        gridTemplateColumns: isDescending ? '260px 1fr 260px' : '1fr',
        gap: '20px',
        minHeight: 'calc(100vh - 80px)'
      }}>
        {/* LEFT PANEL - Stats (during descent) */}
        {isDescending && runState && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {amSpectator && lastResult && (
              <div style={{
                padding: '12px',
                backgroundColor: lastResult.won ? '#1a3320' : '#331a1a',
                border: `2px solid ${lastResult.won ? '#44aa44' : '#aa4444'}`,
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '22px', color: lastResult.won ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>
                  {lastResult.won ? `+${lastResult.payout} TC` : 'BUSTED'}
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                  {lastResult.won ? 'Watching for FOMO...' : myPlayer?.bustReason}
                </div>
              </div>
            )}

            <div style={{
              padding: '15px',
              backgroundColor: '#1a2530',
              border: '2px solid #00ddff',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: '#88ccff', marginBottom: '4px' }}>DEPTH</div>
              <div style={{ fontSize: '44px', fontWeight: 'bold', color: '#00ddff', textShadow: '0 0 15px rgba(0, 221, 255, 0.5)' }}>
                {runState.depth}m
              </div>
            </div>

            <div style={{ padding: '12px', backgroundColor: '#1a2530', border: '2px solid #335577', borderRadius: '8px' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: '#88ccff', marginBottom: '2px' }}>OXYGEN</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: getO2Color(runState.O2) }}>
                  {runState.O2.toFixed(0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#88ccff', marginBottom: '2px' }}>SUIT</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: getSuitColor(runState.Suit) }}>
                  {(runState.Suit * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div style={{
              padding: '10px',
              backgroundColor: '#1a2530',
              border: '2px solid #ff6600',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '10px', color: '#ff9944', marginBottom: '2px' }}>CORRUPTION</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ff6600' }}>{runState.Corruption}</div>
            </div>
          </div>
        )}

        {/* CENTER PANEL */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}>
          {/* WAITING FOR NEXT RUN (server-driven countdown) */}
          {isWaitingForNextRun && (
            <>
              <div style={{ fontSize: '28px', color: '#00ddff', textAlign: 'center' }}>
                NEXT DIVE IN
              </div>
              <div style={{
                fontSize: '80px',
                fontWeight: 'bold',
                color: '#ffdd00',
                textShadow: '0 0 30px rgba(255, 221, 0, 0.5)'
              }}>
                {nextRunCountdown}
              </div>
              <div style={{ fontSize: '70px', animation: 'pulse 1.5s infinite' }}>🤿</div>

              {lastResult && (
                <div style={{
                  padding: '12px 25px',
                  backgroundColor: lastResult.won ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                  border: `2px solid ${lastResult.won ? '#00ff88' : '#ff4444'}`,
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '20px', color: lastResult.won ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>
                    {lastResult.won ? `EXFILTRATED: +${lastResult.payout} TC` : 'BUSTED'}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '16px', color: '#6699cc' }}>
                Preparing next dive...
              </div>
            </>
          )}

          {/* LOBBY - Empty (waiting for first player) */}
          {isLobby && runState && runState.players.length === 0 && !amInRun && (
            <>
              <div style={{ fontSize: '28px', color: '#00ddff', textAlign: 'center' }}>
                DIVE READY
              </div>
              <div style={{ fontSize: '70px', animation: 'pulse 1.5s infinite' }}>🤿</div>

              {lastResult && (
                <div style={{
                  padding: '12px 25px',
                  backgroundColor: lastResult.won ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                  border: `2px solid ${lastResult.won ? '#00ff88' : '#ff4444'}`,
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '20px', color: lastResult.won ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>
                    {lastResult.won ? `EXFILTRATED: +${lastResult.payout} TC` : 'BUSTED'}
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <div style={{ fontSize: '14px', color: '#6699cc', marginBottom: '10px' }}>SELECT STAKE</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {BUY_IN_OPTIONS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBid(amount)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        backgroundColor: bid === amount ? '#00ddff' : '#1a2530',
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
              </div>

              <button
                onClick={joinRun}
                style={{
                  padding: '16px 50px',
                  fontSize: '22px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  backgroundColor: '#00ff88',
                  color: '#000',
                  border: '3px solid #00ff88',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 0 25px rgba(0, 255, 136, 0.4)'
                }}
              >
                START DIVE - {bid} TC
              </button>
            </>
          )}

          {/* LOBBY - Has players, countdown active */}
          {isLobby && runState && (runState.players.length > 0 || amInRun) && (
            <>
              <div style={{ fontSize: '28px', color: '#00ddff', textAlign: 'center' }}>
                DIVE LAUNCHING IN
              </div>
              <div style={{
                fontSize: '96px',
                fontWeight: 'bold',
                color: countdown <= 3 ? '#ff3344' : '#ffdd00',
                textShadow: countdown <= 3 ? '0 0 40px rgba(255, 51, 68, 0.8)' : '0 0 30px rgba(255, 221, 0, 0.5)'
              }}>
                {countdown}
              </div>

              <div style={{ fontSize: '18px', color: '#88ccff' }}>
                {runState.players.length} Diver{runState.players.length !== 1 ? 's' : ''} Ready
              </div>

              {amInRun ? (
                <div style={{
                  padding: '12px 25px',
                  backgroundColor: 'rgba(0, 255, 136, 0.15)',
                  border: '2px solid #00ff88',
                  borderRadius: '8px',
                  fontSize: '18px',
                  color: '#00ff88'
                }}>
                  YOUR STAKE: {myPlayer?.bid} TC
                </div>
              ) : (
                <>
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <div style={{ fontSize: '14px', color: '#6699cc', marginBottom: '10px' }}>JOIN THIS DIVE</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {BUY_IN_OPTIONS.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setBid(amount)}
                          style={{
                            padding: '10px 20px',
                            fontSize: '16px',
                            fontFamily: 'monospace',
                            fontWeight: 'bold',
                            backgroundColor: bid === amount ? '#00ddff' : '#1a2530',
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
                  </div>
                  <button
                    onClick={joinRun}
                    style={{
                      padding: '16px 50px',
                      fontSize: '22px',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      backgroundColor: '#00ff88',
                      color: '#000',
                      border: '3px solid #00ff88',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      boxShadow: '0 0 25px rgba(0, 255, 136, 0.4)'
                    }}
                  >
                    JOIN - {bid} TC
                  </button>
                </>
              )}
            </>
          )}

          {/* DESCENDING */}
          {isDescending && runState && (
            <>
              <div style={{
                textAlign: 'center',
                padding: '15px 40px',
                backgroundColor: 'rgba(255, 221, 0, 0.1)',
                border: '3px solid #ffdd00',
                borderRadius: '8px',
                boxShadow: '0 0 25px rgba(255, 221, 0, 0.3)'
              }}>
                <div style={{ fontSize: '11px', color: '#ffdd00', letterSpacing: '2px' }}>DATA RECOVERED</div>
                <div style={{
                  fontSize: '56px',
                  fontWeight: 'bold',
                  color: '#ffdd00',
                  textShadow: '0 0 20px rgba(255, 221, 0, 0.5)',
                  lineHeight: '1.1'
                }}>
                  {runState.DataMultiplier.toFixed(2)}x
                </div>
                {amInRun && (
                  <div style={{ fontSize: '14px', color: '#ffaa00', marginTop: '4px' }}>
                    Payout: {Math.floor((myPlayer?.bid || bid) * runState.DataMultiplier)} TC
                  </div>
                )}
              </div>

              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '650px',
                aspectRatio: '16 / 9',
                backgroundColor: '#0a0a0f',
                border: '4px solid #1a2530',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: `0 0 25px ${eventGlow}`
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at center, rgba(0, 100, 150, 0.2) 0%, rgba(0, 0, 0, 1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{ fontSize: '70px', opacity: 0.2, color: '#006480' }}>🌊</div>
                </div>
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
              </div>

              {myPlayer?.active && (
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={handleExfiltrate}
                    style={{
                      padding: '16px 50px',
                      fontSize: '24px',
                      backgroundColor: '#00ff88',
                      color: '#000',
                      border: '4px solid #ffdd00',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      boxShadow: '0 0 20px rgba(0, 255, 136, 0.5)'
                    }}
                  >
                    EXFILTRATE
                  </button>
                  <div style={{ fontSize: '12px', color: '#6699cc', marginTop: '6px' }}>
                    Next depth in {nextAdvanceCountdown}s
                  </div>
                </div>
              )}

              {amSpectator && (
                <div style={{ fontSize: '14px', color: '#6699cc' }}>Watching dive continue...</div>
              )}

              {!amInRun && (
                <div style={{ fontSize: '14px', color: '#ff9944' }}>Spectating - join next dive!</div>
              )}
            </>
          )}

          {/* COMPLETED */}
          {isCompleted && (
            <>
              <div style={{ fontSize: '50px' }}>{lastResult?.won ? '💰' : '💀'}</div>
              <div style={{ fontSize: '32px', color: lastResult?.won ? '#00ff88' : '#ff4444' }}>
                DIVE COMPLETE
              </div>
              {lastResult && (
                <div style={{ fontSize: '24px', color: lastResult.won ? '#ffdd00' : '#666' }}>
                  {lastResult.won ? `+${lastResult.payout} TC` : `Lost ${bid} TC`}
                </div>
              )}
              <div style={{ fontSize: '16px', color: '#888', marginTop: '10px' }}>Next dive starting soon...</div>
            </>
          )}

          {/* Not connected yet */}
          {!tableJoined && (
            <>
              <div style={{ fontSize: '70px', animation: 'pulse 1.5s infinite' }}>🤿</div>
              <div style={{ fontSize: '20px', color: '#6699cc' }}>Connecting to dive station...</div>
            </>
          )}

          {message && (
            <div style={{
              fontSize: '13px',
              color: '#00ddff',
              backgroundColor: 'rgba(0, 221, 255, 0.1)',
              padding: '8px 16px',
              borderRadius: '6px',
              maxWidth: '400px',
              textAlign: 'center'
            }}>
              {message}
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Event Log & Players (during descent) */}
        {isDescending && runState && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              padding: '10px',
              backgroundColor: '#1a2530',
              border: '2px solid #335577',
              borderRadius: '8px',
              maxHeight: '220px',
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '11px', color: '#00ddff', marginBottom: '6px', fontWeight: 'bold' }}>EVENT LOG</div>
              {runState.eventHistory.length === 0 && (
                <div style={{ fontSize: '10px', color: '#446688' }}>No events yet...</div>
              )}
              {runState.eventHistory.slice(-8).reverse().map((event, idx) => {
                const icons: Record<string, string> = { 'surge': '⚡', 'micro-leak': '💧', 'air-canister': '🫧', 'structural-brace': '🔧' };
                const colors: Record<string, string> = { 'surge': '#ffdd00', 'micro-leak': '#00ddff', 'air-canister': '#88ccff', 'structural-brace': '#00ff88' };
                return (
                  <div key={idx} style={{
                    fontSize: '10px',
                    marginBottom: '5px',
                    padding: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '3px',
                    borderLeft: `3px solid ${colors[event.type] || '#88ccff'}`,
                    display: 'flex',
                    gap: '5px'
                  }}>
                    <span>{icons[event.type] || '•'}</span>
                    <span style={{ color: '#88ccff' }}>{event.description}</span>
                  </div>
                );
              })}
            </div>

            <div style={{
              padding: '10px',
              backgroundColor: '#1a2530',
              border: '2px solid #335577',
              borderRadius: '8px',
              flex: 1,
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '11px', color: '#00ddff', marginBottom: '6px', fontWeight: 'bold' }}>
                DIVERS ({runState.players.length})
              </div>
              {runState.players.map((player) => {
                const isMe = player.playerId === myPlayerId || player.playerId === socket?.id;
                const statusColor = player.active ? '#00ff88' : player.exfiltrated ? '#ffdd00' : '#ff4444';
                return (
                  <div key={player.playerId} style={{
                    padding: '6px',
                    marginBottom: '5px',
                    backgroundColor: isMe ? 'rgba(0, 221, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
                    border: `1px solid ${statusColor}`,
                    borderRadius: '4px'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>
                      {player.playerName}{isMe && ' (You)'}
                    </div>
                    <div style={{ fontSize: '9px', color: statusColor, marginTop: '2px' }}>
                      {player.active && `Active - ${Math.floor(player.bid * runState.DataMultiplier)} TC`}
                      {player.exfiltrated && `Exfil @ ${player.exfiltrateDepth}m: ${player.payout} TC`}
                      {!player.active && !player.exfiltrated && `Busted @ ${player.bustDepth}m`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
};
