/**
 * Last Breath Shared Run Client
 *
 * Deep-sea sci-fi salvage theme with sliding airlock doors
 * FOMO-driven multiplayer experience:
 * - All players see the SAME descent
 * - Individual decisions (exfiltrate only)
 * - Spectator mode when eliminated (watch others continue!)
 */

import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

// TopNav component (inline for now - could be imported from platform)
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
      <div className="text-white font-bold text-xl">🤿 Last Breath</div>
      <div className="w-24" /> {/* Spacer for centering */}
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

interface SharedRunClientProps {
  socketUrl?: string;
  playerName?: string;
}

export const SharedRunClient: React.FC<SharedRunClientProps> = ({
  socketUrl = 'http://localhost:3001',
  playerName = 'Player'
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [bid, setBid] = useState<number>(100);
  const [autoStartAt, setAutoStartAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [doorOpen, setDoorOpen] = useState<boolean>(false);
  const [eventGlow, setEventGlow] = useState<string>('rgba(0, 221, 255, 0.3)'); // Default cyan glow

  // Connect to socket
  useEffect(() => {
    const newSocket = io(`${socketUrl}/last-breath`);
    setSocket(newSocket);
    setMyPlayerId(newSocket.id || '');

    // Auto-join run on connect
    newSocket.on('connect', () => {
      setMyPlayerId(newSocket.id || '');
      newSocket.emit('join_run', { playerName, bid });
    });

    newSocket.on('run_joined', (data: { runId: string; state: RunState; config: any; autoStartAt?: number }) => {
      setRunState(data.state);
      if (data.autoStartAt) {
        setAutoStartAt(data.autoStartAt);
      }
      setMessage('Joined run! Auto-starting soon...');
    });

    newSocket.on('player_joined_run', (data: { playerName: string; playerCount: number; autoStartAt?: number }) => {
      setMessage(`${data.playerName} joined! (${data.playerCount} players)`);
      if (data.autoStartAt) {
        setAutoStartAt(data.autoStartAt);
      }
    });

    newSocket.on('descent_started', (data: { state: RunState }) => {
      setRunState(data.state);
      setMessage('The descent begins...');
    });

    newSocket.on('state_update', (data: { state: RunState }) => {
      setRunState(data.state);
    });

    newSocket.on('player_exfiltrated', (data: { playerId: string; depth: number; payout: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) {
        setMessage(`${player.playerName} exfiltrated at depth ${data.depth} with ${data.payout} TC!`);
      }
    });

    newSocket.on('player_busted', (data: { playerId: string; reason: string; depth: number; state: RunState }) => {
      setRunState(data.state);
      const player = data.state.players.find(p => p.playerId === data.playerId);
      if (player) {
        setMessage(`${player.playerName} BUSTED at depth ${data.depth} (${data.reason})!`);
      }
    });

    newSocket.on('run_advanced', (data: { depth: number; events: GameEvent[]; state: RunState }) => {
      // Door animation cycle: open -> show corridor -> close (750ms total)
      setDoorOpen(true);

      // Set glow color based on events
      if (data.events.length > 0) {
        const event = data.events[0];
        if (event) {
          if (event.type === 'surge') {
            setEventGlow('rgba(255, 200, 50, 0.5)'); // Warm yellow
          } else if (event.type === 'micro-leak') {
            setEventGlow('rgba(0, 200, 255, 0.5)'); // Cool cyan
          } else if (event.type === 'structural-brace') {
            setEventGlow('rgba(50, 255, 150, 0.4)'); // Soft green
          } else if (event.type === 'air-canister') {
            setEventGlow('rgba(100, 200, 255, 0.4)'); // Light blue
          }
        }
        setMessage(data.events.map(e => e.description).join(', '));
      } else {
        setEventGlow('rgba(0, 221, 255, 0.3)'); // Default cyan
      }

      // Close doors after 500ms (visible corridor for 500ms)
      setTimeout(() => {
        setDoorOpen(false);
        setRunState(data.state);
      }, 500);
    });

    newSocket.on('run_completed', (data: { depth: number; finalState: RunState }) => {
      setRunState(data.finalState);
      setMessage(`Run completed at depth ${data.depth}!`);
    });

    newSocket.on('error', (data: { message: string }) => {
      setMessage(`Error: ${data.message}`);
    });

    return () => {
      newSocket.close();
    };
  }, [socketUrl, playerName, bid]);

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

  const handleStartDescent = () => {
    if (socket) {
      socket.emit('start_descent');
    }
  };

  const handleExfiltrate = () => {
    if (socket) {
      socket.emit('player_decision', { decision: 'exfiltrate' });
      setMessage('Exfiltrating...');
    }
  };

  // Helper functions
  const getMyPlayer = (): Player | undefined => {
    return runState?.players.find(p => p.playerId === myPlayerId);
  };

  const getStatusColor = (player: Player): string => {
    if (player.active) return '#00ff00';
    if (player.exfiltrated) return '#ffff00';
    return '#ff0000';
  };

  const getStatusIcon = (player: Player): string => {
    if (player.active) return '🟢';
    if (player.exfiltrated) return '💰';
    return '💀';
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

  const handleBack = () => {
    window.location.hash = '';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f' }}>
      <TopNav onBack={handleBack} />

      {!runState && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 60px)',
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#00ddff'
        }}>
          Connecting to salvage rig...
        </div>
      )}

      {runState && (
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto',
          padding: '20px',
          fontFamily: 'monospace'
        }}>
          {/* Lobby Phase */}
          {runState.phase === 'lobby' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 'calc(100vh - 100px)',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '48px',
                color: '#00ddff',
                marginBottom: '40px',
                textShadow: '0 0 20px rgba(0, 221, 255, 0.5)'
              }}>
                🤿 SALVAGE RIG INITIALIZING
              </div>
              <div style={{
                fontSize: '24px',
                color: '#88ccff',
                marginBottom: '20px'
              }}>
                {runState.players.length} Diver{runState.players.length !== 1 ? 's' : ''} Ready
              </div>
              {countdown > 0 && (
                <div style={{
                  fontSize: '96px',
                  fontWeight: 'bold',
                  color: countdown <= 3 ? '#ff3344' : '#ffdd00',
                  marginTop: '40px',
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

          {/* Main Game Area - Airlock Door Layout */}
          {runState.phase === 'descending' && (
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
                {/* Spectator Banner */}
                {amSpectator && (
                  <div style={{
                    padding: '15px',
                    backgroundColor: '#ff6600',
                    color: '#000',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    border: '2px solid #ff3344',
                    borderRadius: '4px'
                  }}>
                    {myPlayer.exfiltrated
                      ? `EXFILTRATED: ${myPlayer.payout} TC`
                      : `BUSTED (${myPlayer.bustReason})`}
                  </div>
                )}

                {/* Depth Display */}
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

                {/* O2 & Suit */}
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

                {/* Corruption */}
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
                {/* Data Multiplier - The "Jackpot Number" */}
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
                    {runState.DataMultiplier.toFixed(2)}×
                  </div>
                  <div style={{ fontSize: '16px', color: '#ffaa00', marginTop: '10px' }}>
                    Your Payout: {Math.floor((myPlayer?.bid || bid) * runState.DataMultiplier)} TC
                  </div>
                </div>

                {/* Airlock Door Viewport (16:9 aspect ratio) */}
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
                  {/* Corridor Background (visible when doors open) */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at center, rgba(0, 100, 150, 0.3) 0%, rgba(0, 0, 0, 1) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {/* Placeholder for corridor-bg.png */}
                    <div style={{
                      fontSize: '96px',
                      opacity: 0.3,
                      color: '#006480'
                    }}>
                      🌊
                    </div>
                  </div>

                  {/* Door Left Half */}
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
                    {/* Placeholder for door-left.png */}
                    <div style={{
                      fontSize: '14px',
                      color: '#00ddff',
                      textAlign: 'right',
                      opacity: 0.6,
                      fontFamily: 'monospace'
                    }}>
                      AIRLOCK-L<br/>07-B
                    </div>
                  </div>

                  {/* Door Right Half */}
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
                    {/* Placeholder for door-right.png */}
                    <div style={{
                      fontSize: '14px',
                      color: '#00ddff',
                      textAlign: 'left',
                      opacity: 0.6,
                      fontFamily: 'monospace'
                    }}>
                      AIRLOCK-R<br/>07-B
                    </div>
                  </div>

                  {/* Status Indicator */}
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
                    {doorOpen ? '◉ OPEN' : '◉ SEALED'}
                  </div>
                </div>

                {/* Exfiltrate Button */}
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
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 0 40px rgba(0, 255, 136, 0.8)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 136, 0.6)';
                      }}
                    >
                      💰 EXFILTRATE 💰
                    </button>
                    <div style={{ fontSize: '14px', color: '#6699cc' }}>
                      Auto-advance in {Math.max(0, Math.ceil(((runState.nextAdvanceAt || 0) - Date.now()) / 1000))}s
                    </div>
                  </div>
                )}

                {!myPlayer?.active && (
                  <div style={{
                    fontSize: '18px',
                    color: '#ff6600',
                    textAlign: 'center',
                    padding: '20px'
                  }}>
                    {myPlayer?.exfiltrated ? '✓ EXFILTRATED - Watch others continue!' : '☠ BUSTED - Spectating...'}
                  </div>
                )}
              </div>

              {/* Right Column: Event Log & Players */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}>
                {/* Event Log */}
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
                    // Get icon placeholder based on event type
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
                        case 'air-canister': return '#88ccff';
                        case 'structural-brace': return '#6699cc';
                        default: return '#88ccff';
                      }
                    };

                    return (
                      <div
                        key={idx}
                        style={{
                          fontSize: '12px',
                          marginBottom: '8px',
                          padding: '6px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '3px',
                          borderLeft: `3px solid ${getEventColor(event.type)}`,
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'flex-start'
                        }}
                      >
                        <div style={{ fontSize: '16px' }}>{getEventIcon(event.type)}</div>
                        <div style={{ color: '#88ccff', flex: 1 }}>{event.description}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Players List */}
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
                    <div
                      key={player.playerId}
                      style={{
                        padding: '10px',
                        marginBottom: '8px',
                        backgroundColor: player.playerId === myPlayerId
                          ? 'rgba(0, 221, 255, 0.15)'
                          : 'rgba(0, 0, 0, 0.3)',
                        border: `1px solid ${getStatusColor(player)}`,
                        borderRadius: '4px'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '4px'
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                          {getStatusIcon(player)} {player.playerName}
                          {player.playerId === myPlayerId && ' (You)'}
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

                {/* Message Display */}
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
          )}
        </div>
      )}
    </div>
  );
};
