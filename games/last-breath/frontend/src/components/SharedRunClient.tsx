/**
 * Last Breath Shared Run Client
 *
 * Deep-sea sci-fi salvage theme with sliding airlock doors
 * FOMO-driven multiplayer experience:
 * - All players see the SAME descent
 * - Individual decisions (exfiltrate only)
 * - Spectator mode when eliminated (watch others continue!)
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
}

// Client-side phases
type ClientPhase = 'funding' | 'waiting' | 'lobby' | 'descending' | 'results';

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
  const [clientPhase, setClientPhase] = useState<ClientPhase>('funding');
  const [runState, setRunState] = useState<RunState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [bid, setBid] = useState<number>(100);
  const [autoStartAt, setAutoStartAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [doorOpen, setDoorOpen] = useState<boolean>(false);
  const [eventGlow, setEventGlow] = useState<string>('rgba(0, 221, 255, 0.3)');
  const [tableJoined, setTableJoined] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{ won: boolean; payout: number; depth: number } | null>(null);

  // Join the run with selected bid
  const fundExpedition = useCallback(() => {
    if (!socket || !tableJoined) return;

    console.log('[Last Breath] Funding expedition with bid:', bid);
    socket.emit('join_run', { playerName, bid });
    setClientPhase('waiting');
    setMessage('Preparing dive equipment...');
  }, [socket, tableJoined, playerName, bid]);

  // Connect to socket and join table
  useEffect(() => {
    if (!socket) return;

    setMyPlayerId(socket.id || '');

    // Handle table_joined - now just mark table as joined, don't auto-join run
    const handleTableJoined = (data: { tableId: string }) => {
      console.log('[Last Breath] Table joined:', data.tableId);
      setTableJoined(true);
      // Stay in funding phase - user must choose to fund expedition
    };

    socket.on('table_joined', handleTableJoined);

    // Join table if socket is already connected
    if (socket.connected && tableId) {
      console.log('[Last Breath] Socket connected, joining table:', tableId);
      socket.emit('join_table', { tableId });
    }

    // Handle reconnections
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
      if (data.autoStartAt) {
        setAutoStartAt(data.autoStartAt);
      }
      setClientPhase('lobby');
      setMessage('Joined expedition! Waiting for launch...');
    };

    const handlePlayerJoinedRun = (data: { playerName: string; playerCount: number; autoStartAt?: number }) => {
      setMessage(`${data.playerName} joined! (${data.playerCount} divers)`);
      if (data.autoStartAt) {
        setAutoStartAt(data.autoStartAt);
      }
    };

    const handleDescentStarted = (data: { state: RunState }) => {
      setRunState(data.state);
      setClientPhase('descending');
      setMessage('The descent begins...');
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

      // If it's us, store the result
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

      // If it's us, store the result
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
      setClientPhase('results');
      setMessage(`Expedition ended at depth ${data.depth}`);
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
    if (!autoStartAt || !runState || runState.phase !== 'lobby') {
      setCountdown(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((autoStartAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [autoStartAt, runState]);

  // Transition to results when run completes
  useEffect(() => {
    if (runState?.phase === 'completed' && clientPhase === 'descending') {
      setClientPhase('results');
    }
  }, [runState?.phase, clientPhase]);

  const handleExfiltrate = () => {
    if (socket) {
      socket.emit('player_decision', { decision: 'exfiltrate' });
      setMessage('Exfiltrating...');
    }
  };

  const handleNewExpedition = () => {
    // Reset state for new run
    setRunState(null);
    setLastResult(null);
    setAutoStartAt(null);
    setClientPhase('funding');
    setMessage('');
  };

  const handleBack = () => {
    window.location.hash = '';
  };

  // Helper functions
  const getMyPlayer = (): Player | undefined => {
    return runState?.players.find(p => p.playerId === myPlayerId || p.playerId === socket?.id);
  };

  const getStatusColor = (player: Player): string => {
    if (player.active) return '#00ff00';
    if (player.exfiltrated) return '#ffff00';
    return '#ff0000';
  };

  const getStatusIcon = (player: Player): string => {
    if (player.active) return '';
    if (player.exfiltrated) return '';
    return '';
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f' }}>
      <TopNav onBack={handleBack} />

      {/* Funding Phase - Choose buy-in */}
      {clientPhase === 'funding' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 60px)',
          padding: '20px',
          fontFamily: 'monospace'
        }}>
          {/* Diver Animation Area */}
          <div style={{
            width: '100%',
            maxWidth: '600px',
            aspectRatio: '16 / 9',
            backgroundColor: '#0f1a24',
            border: '3px solid #00ddff',
            borderRadius: '12px',
            marginBottom: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 0 60px rgba(0, 221, 255, 0.3)'
          }}>
            {/* Bubbles background effect */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 30% 70%, rgba(0, 150, 200, 0.2) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(0, 100, 150, 0.15) 0%, transparent 40%)',
            }} />

            {/* Diver */}
            <div style={{
              fontSize: '120px',
              animation: 'float 3s ease-in-out infinite',
              textShadow: '0 0 40px rgba(0, 221, 255, 0.5)'
            }}>
              🤿
            </div>

            {/* Status Text */}
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '14px',
              color: '#00ddff',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '8px 20px',
              borderRadius: '20px',
              border: '1px solid #00ddff'
            }}>
              {tableJoined ? 'DIVER READY' : 'CONNECTING TO RIG...'}
            </div>
          </div>

          {/* Title */}
          <div style={{
            fontSize: '32px',
            color: '#00ddff',
            marginBottom: '10px',
            textShadow: '0 0 20px rgba(0, 221, 255, 0.5)',
            textAlign: 'center'
          }}>
            FUND YOUR EXPEDITION
          </div>

          <div style={{
            fontSize: '16px',
            color: '#6699cc',
            marginBottom: '30px',
            textAlign: 'center'
          }}>
            How deep are you willing to go?
          </div>

          {/* Buy-in Options */}
          <div style={{
            display: 'flex',
            gap: '15px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginBottom: '30px'
          }}>
            {BUY_IN_OPTIONS.map((amount) => (
              <button
                key={amount}
                onClick={() => setBid(amount)}
                style={{
                  padding: '15px 30px',
                  fontSize: '20px',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  backgroundColor: bid === amount ? '#00ddff' : '#1a2530',
                  color: bid === amount ? '#000' : '#00ddff',
                  border: `2px solid ${bid === amount ? '#00ddff' : '#335577'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '100px'
                }}
              >
                {amount} TC
              </button>
            ))}
          </div>

          {/* Launch Button */}
          <button
            onClick={fundExpedition}
            disabled={!tableJoined}
            style={{
              padding: '20px 60px',
              fontSize: '24px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              backgroundColor: tableJoined ? '#00ff88' : '#333',
              color: tableJoined ? '#000' : '#666',
              border: `3px solid ${tableJoined ? '#00ff88' : '#444'}`,
              borderRadius: '12px',
              cursor: tableJoined ? 'pointer' : 'not-allowed',
              boxShadow: tableJoined ? '0 0 40px rgba(0, 255, 136, 0.5)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            LAUNCH DIVE - {bid} TC
          </button>

          {/* Info */}
          <div style={{
            marginTop: '30px',
            fontSize: '12px',
            color: '#446688',
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            Your funding determines your potential payout. Go deeper to multiply your investment - but know when to surface!
          </div>

          <style>{`
            @keyframes float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-15px); }
            }
          `}</style>
        </div>
      )}

      {/* Waiting Phase - Joining run */}
      {clientPhase === 'waiting' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 60px)',
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#00ddff'
        }}>
          <div style={{ fontSize: '80px', marginBottom: '30px', animation: 'pulse 1.5s infinite' }}>
            🤿
          </div>
          Preparing dive equipment...
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}</style>
        </div>
      )}

      {/* Lobby Phase - Waiting for run to start */}
      {clientPhase === 'lobby' && runState && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 60px)',
          textAlign: 'center',
          fontFamily: 'monospace',
          padding: '20px'
        }}>
          <div style={{
            fontSize: '48px',
            color: '#00ddff',
            marginBottom: '40px',
            textShadow: '0 0 20px rgba(0, 221, 255, 0.5)'
          }}>
            SALVAGE RIG INITIALIZING
          </div>
          <div style={{
            fontSize: '24px',
            color: '#88ccff',
            marginBottom: '20px'
          }}>
            {runState.players.length} Diver{runState.players.length !== 1 ? 's' : ''} Ready
          </div>
          <div style={{
            fontSize: '18px',
            color: '#ffdd00',
            marginBottom: '30px'
          }}>
            Your stake: {bid} TC
          </div>
          {countdown > 0 && (
            <div style={{
              fontSize: '96px',
              fontWeight: 'bold',
              color: countdown <= 3 ? '#ff3344' : '#ffdd00',
              marginTop: '20px',
              textShadow: countdown <= 3
                ? '0 0 40px rgba(255, 51, 68, 0.8)'
                : '0 0 40px rgba(255, 221, 0, 0.8)'
            }}>
              {countdown}
            </div>
          )}
          <div style={{
            fontSize: '16px',
            color: '#6699cc',
            marginTop: '20px'
          }}>
            Descent commencing...
          </div>
        </div>
      )}

      {/* Descending Phase - Main gameplay */}
      {clientPhase === 'descending' && runState && (
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto',
          padding: '20px',
          fontFamily: 'monospace'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr 320px',
            gap: '30px',
            alignItems: 'start',
            minHeight: 'calc(100vh - 100px)'
          }}>
            {/* Left Column: Stats */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {amSpectator && (
                <div style={{
                  padding: '15px',
                  backgroundColor: myPlayer?.exfiltrated ? '#226622' : '#662222',
                  color: '#fff',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  border: `2px solid ${myPlayer?.exfiltrated ? '#44aa44' : '#aa4444'}`,
                  borderRadius: '4px'
                }}>
                  {myPlayer?.exfiltrated
                    ? `EXFILTRATED: +${myPlayer.payout} TC`
                    : `BUSTED (${myPlayer?.bustReason})`}
                </div>
              )}

              <div style={{
                padding: '20px',
                backgroundColor: '#1a2530',
                border: '2px solid #00ddff',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '12px', color: '#88ccff', marginBottom: '8px' }}>DEPTH</div>
                <div style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: '#00ddff',
                  textShadow: '0 0 20px rgba(0, 221, 255, 0.6)'
                }}>
                  {runState.depth}
                </div>
              </div>

              <div style={{
                padding: '15px',
                backgroundColor: '#1a2530',
                border: '2px solid #00ddff',
                borderRadius: '4px'
              }}>
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#88ccff', marginBottom: '5px' }}>OXYGEN</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: getO2Color(runState.O2) }}>
                    {runState.O2.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#88ccff', marginBottom: '5px' }}>SUIT INTEGRITY</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: getSuitColor(runState.Suit) }}>
                    {(runState.Suit * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              <div style={{
                padding: '15px',
                backgroundColor: '#1a2530',
                border: '2px solid #ff6600',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '12px', color: '#ff6600', marginBottom: '5px' }}>CORRUPTION</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff6600' }}>
                  {runState.Corruption}
                </div>
              </div>
            </div>

            {/* Center Column: Airlock Door + Data Multiplier */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '30px',
              paddingTop: '20px'
            }}>
              <div style={{
                textAlign: 'center',
                padding: '20px 40px',
                backgroundColor: 'rgba(255, 221, 0, 0.1)',
                border: '3px solid #ffdd00',
                borderRadius: '8px',
                boxShadow: '0 0 30px rgba(255, 221, 0, 0.4)'
              }}>
                <div style={{ fontSize: '14px', color: '#ffdd00', marginBottom: '5px', letterSpacing: '2px' }}>
                  DATA RECOVERED
                </div>
                <div style={{
                  fontSize: '72px',
                  fontWeight: 'bold',
                  color: '#ffdd00',
                  textShadow: '0 0 30px rgba(255, 221, 0, 0.8)',
                  lineHeight: '1'
                }}>
                  {runState.DataMultiplier.toFixed(2)}x
                </div>
                <div style={{ fontSize: '16px', color: '#ffaa00', marginTop: '10px' }}>
                  Your Payout: {Math.floor((myPlayer?.bid || bid) * runState.DataMultiplier)} TC
                </div>
              </div>

              {/* Airlock Door Viewport */}
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '800px',
                aspectRatio: '16 / 9',
                backgroundColor: '#0a0a0f',
                border: '4px solid #1a2530',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: `0 0 40px ${eventGlow}`
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at center, rgba(0, 100, 150, 0.3) 0%, rgba(0, 0, 0, 1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{ fontSize: '96px', opacity: 0.3, color: '#006480' }}>
                    🌊
                  </div>
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
                  transition: 'transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  padding: '20px',
                  boxShadow: doorOpen ? 'none' : `inset -5px 0 20px ${eventGlow}`
                }}>
                  <div style={{ fontSize: '14px', color: '#00ddff', textAlign: 'right', opacity: 0.6 }}>
                    AIRLOCK-L<br/>07-B
                  </div>
                </div>

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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '20px',
                  boxShadow: doorOpen ? 'none' : `inset 5px 0 20px ${eventGlow}`
                }}>
                  <div style={{ fontSize: '14px', color: '#00ddff', textAlign: 'left', opacity: 0.6 }}>
                    AIRLOCK-R<br/>07-B
                  </div>
                </div>

                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '12px',
                  color: doorOpen ? '#00ff88' : '#88ccff',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  padding: '5px 15px',
                  borderRadius: '4px',
                  border: `1px solid ${doorOpen ? '#00ff88' : '#88ccff'}`
                }}>
                  {doorOpen ? 'OPEN' : 'SEALED'}
                </div>
              </div>

              {myPlayer?.active && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%'
                }}>
                  <button
                    onClick={handleExfiltrate}
                    style={{
                      padding: '20px 60px',
                      fontSize: '28px',
                      backgroundColor: '#00ff88',
                      color: '#000',
                      border: '4px solid #ffdd00',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      boxShadow: '0 0 30px rgba(0, 255, 136, 0.6)',
                      transition: 'all 0.2s'
                    }}
                  >
                    EXFILTRATE
                  </button>
                  <div style={{ fontSize: '14px', color: '#6699cc' }}>
                    Auto-advance in {Math.max(0, Math.ceil(((runState.nextAdvanceAt || 0) - Date.now()) / 1000))}s
                  </div>
                </div>
              )}

              {amSpectator && (
                <div style={{
                  fontSize: '18px',
                  color: myPlayer?.exfiltrated ? '#00ff88' : '#ff6600',
                  textAlign: 'center',
                  padding: '20px'
                }}>
                  {myPlayer?.exfiltrated ? 'EXFILTRATED - Watch others continue!' : 'BUSTED - Spectating...'}
                </div>
              )}
            </div>

            {/* Right Column: Event Log & Players */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <div style={{
                padding: '15px',
                backgroundColor: '#1a2530',
                border: '2px solid #00ddff',
                borderRadius: '4px',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                <div style={{ fontSize: '14px', color: '#00ddff', marginBottom: '10px', fontWeight: 'bold' }}>
                  EVENT LOG
                </div>
                {runState.eventHistory.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#6699cc', opacity: 0.6 }}>
                    No events yet...
                  </div>
                )}
                {runState.eventHistory.slice(-15).reverse().map((event, idx) => {
                  const getEventIcon = (type: string) => {
                    switch (type) {
                      case 'surge': return '⚡';
                      case 'micro-leak': return '💧';
                      case 'air-canister': return '🫧';
                      case 'structural-brace': return '🔧';
                      default: return '•';
                    }
                  };
                  const getEventColor = (type: string) => {
                    switch (type) {
                      case 'surge': return '#ffdd00';
                      case 'micro-leak': return '#00ddff';
                      default: return '#88ccff';
                    }
                  };
                  return (
                    <div key={idx} style={{
                      fontSize: '12px',
                      marginBottom: '8px',
                      padding: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '3px',
                      borderLeft: `3px solid ${getEventColor(event.type)}`,
                      display: 'flex',
                      gap: '8px'
                    }}>
                      <div style={{ fontSize: '16px' }}>{getEventIcon(event.type)}</div>
                      <div style={{ color: '#88ccff', flex: 1 }}>{event.description}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{
                padding: '15px',
                backgroundColor: '#1a2530',
                border: '2px solid #00ddff',
                borderRadius: '4px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                <div style={{ fontSize: '14px', color: '#00ddff', marginBottom: '10px', fontWeight: 'bold' }}>
                  DIVERS ({runState.players.length})
                </div>
                {runState.players.map((player) => (
                  <div key={player.playerId} style={{
                    padding: '10px',
                    marginBottom: '8px',
                    backgroundColor: (player.playerId === myPlayerId || player.playerId === socket?.id)
                      ? 'rgba(0, 221, 255, 0.15)'
                      : 'rgba(0, 0, 0, 0.3)',
                    border: `1px solid ${getStatusColor(player)}`,
                    borderRadius: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                        {getStatusIcon(player)} {player.playerName}
                        {(player.playerId === myPlayerId || player.playerId === socket?.id) && ' (You)'}
                      </div>
                    </div>
                    {player.active && (
                      <div style={{ fontSize: '11px', color: '#00ff88' }}>
                        Active - {Math.floor((player.bid || bid) * runState.DataMultiplier)} TC
                      </div>
                    )}
                    {player.exfiltrated && (
                      <div style={{ fontSize: '11px', color: '#ffdd00' }}>
                        Exfiltrated @ {player.exfiltrateDepth}: <strong>{player.payout} TC</strong>
                      </div>
                    )}
                    {!player.active && !player.exfiltrated && (
                      <div style={{ fontSize: '11px', color: '#ff4444' }}>
                        Busted @ {player.bustDepth} ({player.bustReason})
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {message && (
                <div style={{
                  padding: '12px',
                  backgroundColor: 'rgba(0, 221, 255, 0.1)',
                  border: '2px solid #00ddff',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#00ddff',
                  textAlign: 'center'
                }}>
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Phase - Show outcome and re-buy option */}
      {clientPhase === 'results' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 60px)',
          padding: '20px',
          fontFamily: 'monospace',
          textAlign: 'center'
        }}>
          {/* Result Display */}
          <div style={{
            fontSize: '80px',
            marginBottom: '20px'
          }}>
            {lastResult?.won ? '💰' : '💀'}
          </div>

          <div style={{
            fontSize: '48px',
            color: lastResult?.won ? '#00ff88' : '#ff4444',
            marginBottom: '10px',
            textShadow: `0 0 30px ${lastResult?.won ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 68, 68, 0.5)'}`
          }}>
            {lastResult?.won ? 'EXFILTRATED!' : 'BUSTED!'}
          </div>

          <div style={{
            fontSize: '24px',
            color: '#88ccff',
            marginBottom: '20px'
          }}>
            Depth Reached: {lastResult?.depth || runState?.depth || 0}
          </div>

          {lastResult?.won && (
            <div style={{
              fontSize: '36px',
              color: '#ffdd00',
              marginBottom: '40px',
              textShadow: '0 0 20px rgba(255, 221, 0, 0.5)'
            }}>
              +{lastResult.payout} TC
            </div>
          )}

          {!lastResult?.won && (
            <div style={{
              fontSize: '20px',
              color: '#666',
              marginBottom: '40px'
            }}>
              Lost: {bid} TC
            </div>
          )}

          {/* Re-buy Button */}
          <button
            onClick={handleNewExpedition}
            style={{
              padding: '20px 50px',
              fontSize: '24px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              backgroundColor: '#00ddff',
              color: '#000',
              border: '3px solid #00ddff',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 0 30px rgba(0, 221, 255, 0.4)',
              transition: 'all 0.2s',
              marginBottom: '20px'
            }}
          >
            FUND NEW EXPEDITION
          </button>

          <button
            onClick={handleBack}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              fontFamily: 'monospace',
              backgroundColor: 'transparent',
              color: '#6699cc',
              border: '2px solid #335577',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Back to Games
          </button>
        </div>
      )}
    </div>
  );
};
