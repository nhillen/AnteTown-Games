/**
 * Last Breath Shared Run Client
 *
 * Single-screen design:
 * - Shows rig status, bet selection, and dive controls in one view
 * - Seamlessly transitions between idle/lobby/descent/results
 * - FOMO-driven: watch the dive continue even after exfiltrating
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// TopNav component
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

// Preset buy-in amounts
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
  const [inRun, setInRun] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{ won: boolean; payout: number; depth: number } | null>(null);

  // Join the run with selected bid
  const joinRun = useCallback(() => {
    if (!socket || !tableJoined) return;

    console.log('[Last Breath] Joining run with bid:', bid);
    socket.emit('join_run', { playerName, bid });
    setInRun(true);
    setLastResult(null);
    setMessage('Preparing dive equipment...');
  }, [socket, tableJoined, playerName, bid]);

  // Connect to socket and join table
  useEffect(() => {
    if (!socket) return;

    setMyPlayerId(socket.id || '');

    const handleTableJoined = (data: { tableId: string }) => {
      console.log('[Last Breath] Table joined:', data.tableId);
      setTableJoined(true);
    };

    socket.on('table_joined', handleTableJoined);

    // Join table if socket is already connected
    if (socket.connected && tableId) {
      console.log('[Last Breath] Socket connected, joining table:', tableId);
      socket.emit('join_table', { tableId });
    }

    const handleConnect = () => {
      console.log('[Last Breath] Socket reconnected, joining table:', tableId);
      setMyPlayerId(socket.id || '');
      if (tableId) {
        socket.emit('join_table', { tableId });
      }
    };

    socket.on('connect', handleConnect);

    const handleRunJoined = (data: { runId: string; state: RunState; config: any; autoStartAt?: number }) => {
      console.log('[Last Breath] Run joined:', data.state.phase);
      setRunState(data.state);
      setInRun(true);
      setMessage('');
    };

    const handlePlayerJoinedRun = (data: { playerName: string; playerCount: number }) => {
      setMessage(`${data.playerName} joined! (${data.playerCount} divers)`);
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
        setMessage(`${player.playerName} exfiltrated at depth ${data.depth} with ${data.payout} TC!`);
      }

      if (data.playerId === myPlayerId || data.playerId === socket.id) {
        setLastResult({ won: true, payout: data.payout, depth: data.depth });
      }
    };

    const handlePlayerBusted = (data: { playerId: string; reason: string; depth: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) {
        setMessage(`${player.playerName} BUSTED at depth ${data.depth} (${data.reason})!`);
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
          if (event.type === 'surge') {
            setEventGlow('rgba(255, 200, 50, 0.5)');
          } else if (event.type === 'micro-leak') {
            setEventGlow('rgba(0, 200, 255, 0.5)');
          } else if (event.type === 'structural-brace') {
            setEventGlow('rgba(50, 255, 150, 0.4)');
          } else if (event.type === 'air-canister') {
            setEventGlow('rgba(100, 200, 255, 0.4)');
          }
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
      setMessage(`Expedition ended at depth ${data.depth}`);
      // After a short delay, allow new run
      setTimeout(() => {
        setInRun(false);
        setRunState(null);
      }, 3000);
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
      socket.off('error', handleError);
    };
  }, [socket, tableId, playerName, myPlayerId]);

  // Countdown timer for auto-start
  useEffect(() => {
    if (!runState?.autoStartAt || runState.phase !== 'lobby') {
      setCountdown(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((runState.autoStartAt! - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [runState?.autoStartAt, runState?.phase]);

  const handleExfiltrate = () => {
    if (socket) {
      socket.emit('player_decision', { decision: 'exfiltrate' });
      setMessage('Exfiltrating...');
    }
  };

  const handleBack = () => {
    window.location.hash = '';
  };

  // Helper functions
  const getMyPlayer = (): Player | undefined => {
    return runState?.players.find(p => p.playerId === myPlayerId || p.playerId === socket?.id);
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

  const myPlayer = getMyPlayer();
  const amSpectator = myPlayer && !myPlayer.active;
  const isDescending = runState?.phase === 'descending';
  const isLobby = runState?.phase === 'lobby';
  const isCompleted = runState?.phase === 'completed';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', fontFamily: 'monospace' }}>
      <TopNav onBack={handleBack} />

      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '20px',
        display: 'grid',
        gridTemplateColumns: isDescending ? '280px 1fr 280px' : '1fr',
        gap: '20px',
        minHeight: 'calc(100vh - 80px)'
      }}>
        {/* LEFT PANEL - Stats (only during descent) */}
        {isDescending && runState && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Result Banner */}
            {amSpectator && (
              <div style={{
                padding: '15px',
                backgroundColor: myPlayer?.exfiltrated ? '#1a3320' : '#331a1a',
                border: `2px solid ${myPlayer?.exfiltrated ? '#44aa44' : '#aa4444'}`,
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '24px',
                  color: myPlayer?.exfiltrated ? '#00ff88' : '#ff4444',
                  fontWeight: 'bold'
                }}>
                  {myPlayer?.exfiltrated ? `+${myPlayer.payout} TC` : 'BUSTED'}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                  {myPlayer?.exfiltrated ? 'Watching for FOMO...' : `${myPlayer?.bustReason}`}
                </div>
              </div>
            )}

            {/* Depth */}
            <div style={{
              padding: '20px',
              backgroundColor: '#1a2530',
              border: '2px solid #00ddff',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#88ccff', marginBottom: '5px' }}>DEPTH</div>
              <div style={{
                fontSize: '48px',
                fontWeight: 'bold',
                color: '#00ddff',
                textShadow: '0 0 20px rgba(0, 221, 255, 0.6)'
              }}>
                {runState.depth}
              </div>
            </div>

            {/* Vitals */}
            <div style={{
              padding: '15px',
              backgroundColor: '#1a2530',
              border: '2px solid #335577',
              borderRadius: '8px'
            }}>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '11px', color: '#88ccff', marginBottom: '3px' }}>OXYGEN</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: getO2Color(runState.O2) }}>
                  {runState.O2.toFixed(0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#88ccff', marginBottom: '3px' }}>SUIT</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: getSuitColor(runState.Suit) }}>
                  {(runState.Suit * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Corruption */}
            <div style={{
              padding: '12px',
              backgroundColor: '#1a2530',
              border: '2px solid #ff6600',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '11px', color: '#ff9944', marginBottom: '3px' }}>CORRUPTION</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff6600' }}>
                {runState.Corruption}
              </div>
            </div>
          </div>
        )}

        {/* CENTER PANEL - Main View */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isDescending ? 'flex-start' : 'center',
          gap: '20px',
          paddingTop: isDescending ? '0' : '0'
        }}>
          {/* IDLE STATE - Show bet selection */}
          {!inRun && (
            <>
              {/* Diver Visual */}
              <div style={{
                width: '100%',
                maxWidth: '500px',
                aspectRatio: '16 / 10',
                backgroundColor: '#0f1a24',
                border: '3px solid #00ddff',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 0 40px rgba(0, 221, 255, 0.2)'
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at 30% 70%, rgba(0, 150, 200, 0.15) 0%, transparent 50%)',
                }} />
                <div style={{
                  fontSize: '100px',
                  animation: 'float 3s ease-in-out infinite',
                  textShadow: '0 0 30px rgba(0, 221, 255, 0.4)'
                }}>
                  🤿
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: '15px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '14px',
                  color: tableJoined ? '#00ff88' : '#ffaa00',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  padding: '8px 20px',
                  borderRadius: '20px',
                  border: `1px solid ${tableJoined ? '#00ff88' : '#ffaa00'}`
                }}>
                  {tableJoined ? 'RIG ONLINE - READY TO DIVE' : 'CONNECTING TO RIG...'}
                </div>
              </div>

              {/* Last Result */}
              {lastResult && (
                <div style={{
                  padding: '15px 30px',
                  backgroundColor: lastResult.won ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)',
                  border: `2px solid ${lastResult.won ? '#00ff88' : '#ff4444'}`,
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '24px',
                    color: lastResult.won ? '#00ff88' : '#ff4444',
                    fontWeight: 'bold'
                  }}>
                    {lastResult.won ? `EXFILTRATED: +${lastResult.payout} TC` : 'BUSTED'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                    Reached depth {lastResult.depth}
                  </div>
                </div>
              )}

              {/* Bet Selection */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '16px',
                  color: '#6699cc',
                  marginBottom: '15px'
                }}>
                  SELECT YOUR STAKE
                </div>
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  flexWrap: 'wrap',
                  justifyContent: 'center'
                }}>
                  {BUY_IN_OPTIONS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBid(amount)}
                      style={{
                        padding: '12px 24px',
                        fontSize: '18px',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        backgroundColor: bid === amount ? '#00ddff' : '#1a2530',
                        color: bid === amount ? '#000' : '#00ddff',
                        border: `2px solid ${bid === amount ? '#00ddff' : '#335577'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {amount} TC
                    </button>
                  ))}
                </div>
              </div>

              {/* Dive Button */}
              <button
                onClick={joinRun}
                disabled={!tableJoined}
                style={{
                  padding: '18px 60px',
                  fontSize: '24px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  backgroundColor: tableJoined ? '#00ff88' : '#333',
                  color: tableJoined ? '#000' : '#666',
                  border: `3px solid ${tableJoined ? '#00ff88' : '#444'}`,
                  borderRadius: '10px',
                  cursor: tableJoined ? 'pointer' : 'not-allowed',
                  boxShadow: tableJoined ? '0 0 30px rgba(0, 255, 136, 0.4)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                DIVE - {bid} TC
              </button>
            </>
          )}

          {/* LOBBY STATE - Waiting for descent */}
          {isLobby && runState && (
            <>
              <div style={{
                fontSize: '32px',
                color: '#00ddff',
                textShadow: '0 0 15px rgba(0, 221, 255, 0.4)',
                textAlign: 'center'
              }}>
                DIVE COMMENCING
              </div>

              <div style={{
                display: 'flex',
                gap: '40px',
                fontSize: '18px',
                color: '#88ccff'
              }}>
                <div>{runState.players.length} Diver{runState.players.length !== 1 ? 's' : ''}</div>
                <div>Your stake: {bid} TC</div>
              </div>

              {countdown > 0 && (
                <div style={{
                  fontSize: '96px',
                  fontWeight: 'bold',
                  color: countdown <= 3 ? '#ff3344' : '#ffdd00',
                  textShadow: countdown <= 3
                    ? '0 0 40px rgba(255, 51, 68, 0.8)'
                    : '0 0 40px rgba(255, 221, 0, 0.5)',
                  marginTop: '20px'
                }}>
                  {countdown}
                </div>
              )}

              <div style={{
                fontSize: '80px',
                animation: 'pulse 1.5s infinite',
                marginTop: '20px'
              }}>
                🤿
              </div>
            </>
          )}

          {/* DESCENDING STATE */}
          {isDescending && runState && (
            <>
              {/* Data Multiplier */}
              <div style={{
                textAlign: 'center',
                padding: '20px 50px',
                backgroundColor: 'rgba(255, 221, 0, 0.1)',
                border: '3px solid #ffdd00',
                borderRadius: '8px',
                boxShadow: '0 0 30px rgba(255, 221, 0, 0.3)'
              }}>
                <div style={{ fontSize: '12px', color: '#ffdd00', letterSpacing: '2px' }}>
                  DATA RECOVERED
                </div>
                <div style={{
                  fontSize: '64px',
                  fontWeight: 'bold',
                  color: '#ffdd00',
                  textShadow: '0 0 25px rgba(255, 221, 0, 0.6)',
                  lineHeight: '1.1'
                }}>
                  {runState.DataMultiplier.toFixed(2)}x
                </div>
                <div style={{ fontSize: '16px', color: '#ffaa00', marginTop: '5px' }}>
                  Payout: {Math.floor((myPlayer?.bid || bid) * runState.DataMultiplier)} TC
                </div>
              </div>

              {/* Airlock Door */}
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '700px',
                aspectRatio: '16 / 9',
                backgroundColor: '#0a0a0f',
                border: '4px solid #1a2530',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: `0 0 30px ${eventGlow}`
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at center, rgba(0, 100, 150, 0.2) 0%, rgba(0, 0, 0, 1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{ fontSize: '80px', opacity: 0.2, color: '#006480' }}>🌊</div>
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
                  transition: 'transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  boxShadow: doorOpen ? 'none' : `inset -5px 0 20px ${eventGlow}`
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
                  transition: 'transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  boxShadow: doorOpen ? 'none' : `inset 5px 0 20px ${eventGlow}`
                }} />

                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '12px',
                  color: doorOpen ? '#00ff88' : '#88ccff',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  padding: '5px 15px',
                  borderRadius: '4px'
                }}>
                  {doorOpen ? 'ADVANCING' : 'SEALED'}
                </div>
              </div>

              {/* Exfiltrate Button */}
              {myPlayer?.active && (
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={handleExfiltrate}
                    style={{
                      padding: '18px 60px',
                      fontSize: '26px',
                      backgroundColor: '#00ff88',
                      color: '#000',
                      border: '4px solid #ffdd00',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      boxShadow: '0 0 25px rgba(0, 255, 136, 0.5)',
                      transition: 'all 0.2s'
                    }}
                  >
                    EXFILTRATE
                  </button>
                  <div style={{ fontSize: '13px', color: '#6699cc', marginTop: '8px' }}>
                    Next room in {Math.max(0, Math.ceil(((runState.nextAdvanceAt || 0) - Date.now()) / 1000))}s
                  </div>
                </div>
              )}

              {/* Spectator Message */}
              {amSpectator && (
                <div style={{
                  fontSize: '16px',
                  color: '#6699cc',
                  textAlign: 'center'
                }}>
                  Watching dive continue...
                </div>
              )}
            </>
          )}

          {/* COMPLETED STATE */}
          {isCompleted && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '60px', marginBottom: '20px' }}>
                {lastResult?.won ? '💰' : '💀'}
              </div>
              <div style={{
                fontSize: '36px',
                color: lastResult?.won ? '#00ff88' : '#ff4444',
                marginBottom: '10px'
              }}>
                DIVE COMPLETE
              </div>
              <div style={{ fontSize: '18px', color: '#888' }}>
                Returning to surface...
              </div>
            </div>
          )}

          {/* Message */}
          {message && !isDescending && (
            <div style={{
              fontSize: '14px',
              color: '#00ddff',
              backgroundColor: 'rgba(0, 221, 255, 0.1)',
              padding: '10px 20px',
              borderRadius: '6px',
              marginTop: '10px'
            }}>
              {message}
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Event Log & Players (only during descent) */}
        {isDescending && runState && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Event Log */}
            <div style={{
              padding: '12px',
              backgroundColor: '#1a2530',
              border: '2px solid #335577',
              borderRadius: '8px',
              maxHeight: '250px',
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '12px', color: '#00ddff', marginBottom: '8px', fontWeight: 'bold' }}>
                EVENT LOG
              </div>
              {runState.eventHistory.length === 0 && (
                <div style={{ fontSize: '11px', color: '#446688' }}>No events yet...</div>
              )}
              {runState.eventHistory.slice(-10).reverse().map((event, idx) => {
                const icons: Record<string, string> = {
                  'surge': '⚡',
                  'micro-leak': '💧',
                  'air-canister': '🫧',
                  'structural-brace': '🔧'
                };
                const colors: Record<string, string> = {
                  'surge': '#ffdd00',
                  'micro-leak': '#00ddff',
                  'air-canister': '#88ccff',
                  'structural-brace': '#00ff88'
                };
                return (
                  <div key={idx} style={{
                    fontSize: '11px',
                    marginBottom: '6px',
                    padding: '5px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '3px',
                    borderLeft: `3px solid ${colors[event.type] || '#88ccff'}`,
                    display: 'flex',
                    gap: '6px'
                  }}>
                    <span>{icons[event.type] || '•'}</span>
                    <span style={{ color: '#88ccff' }}>{event.description}</span>
                  </div>
                );
              })}
            </div>

            {/* Players */}
            <div style={{
              padding: '12px',
              backgroundColor: '#1a2530',
              border: '2px solid #335577',
              borderRadius: '8px',
              flex: 1,
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '12px', color: '#00ddff', marginBottom: '8px', fontWeight: 'bold' }}>
                DIVERS ({runState.players.length})
              </div>
              {runState.players.map((player) => {
                const isMe = player.playerId === myPlayerId || player.playerId === socket?.id;
                const statusColor = player.active ? '#00ff88' : player.exfiltrated ? '#ffdd00' : '#ff4444';
                return (
                  <div key={player.playerId} style={{
                    padding: '8px',
                    marginBottom: '6px',
                    backgroundColor: isMe ? 'rgba(0, 221, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
                    border: `1px solid ${statusColor}`,
                    borderRadius: '4px'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>
                      {player.playerName}{isMe && ' (You)'}
                    </div>
                    <div style={{ fontSize: '10px', color: statusColor, marginTop: '2px' }}>
                      {player.active && `Active - ${Math.floor(player.bid * runState.DataMultiplier)} TC`}
                      {player.exfiltrated && `Exfil @ ${player.exfiltrateDepth}: ${player.payout} TC`}
                      {!player.active && !player.exfiltrated && `Busted @ ${player.bustDepth}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Message */}
            {message && (
              <div style={{
                padding: '10px',
                backgroundColor: 'rgba(0, 221, 255, 0.1)',
                border: '1px solid #335577',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#00ddff',
                textAlign: 'center'
              }}>
                {message}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
};
