/**
 * Last Breath Shared Run Client
 *
 * FOMO-driven multiplayer experience:
 * - All players see the SAME descent
 * - Individual decisions (advance/exfiltrate)
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
  awaitingDecisions: string[];
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
  const [ante, setAnte] = useState<number>(100);

  // Connect to socket
  useEffect(() => {
    const newSocket = io(`${socketUrl}/last-breath`);
    setSocket(newSocket);
    setMyPlayerId(newSocket.id || '');

    // Auto-join run on connect
    newSocket.on('connect', () => {
      setMyPlayerId(newSocket.id || '');
      newSocket.emit('join_run', { playerName });
    });

    newSocket.on('run_joined', (data: { runId: string; state: RunState; config: any }) => {
      setRunState(data.state);
      setAnte(data.config.ante);
      setMessage('Joined run! Waiting for other players...');
    });

    newSocket.on('player_joined_run', (data: { playerName: string; playerCount: number }) => {
      setMessage(`${data.playerName} joined! (${data.playerCount} players)`);
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
      setRunState(data.state);
      if (data.events.length > 0) {
        setMessage(data.events.map(e => e.description).join(', '));
      }
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
  }, [socketUrl, playerName]);

  const handleStartDescent = () => {
    if (socket) {
      socket.emit('start_descent');
    }
  };

  const handleDecision = (decision: 'advance' | 'exfiltrate') => {
    if (socket) {
      socket.emit('player_decision', { decision });
      setMessage(decision === 'advance' ? 'Advancing to next room...' : 'Exfiltrating...');
    }
  };

  // Helper functions
  const getMyPlayer = (): Player | undefined => {
    return runState?.players.find(p => p.playerId === myPlayerId);
  };

  const isMyTurn = (): boolean => {
    return runState?.awaitingDecisions.includes(myPlayerId) || false;
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
    <div style={{ minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      <TopNav onBack={handleBack} />
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'monospace',
        color: '#00ff00'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
          🤿 LAST BREATH 🤿
        </h1>

      {!runState && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '20px' }}>Connecting...</div>
        </div>
      )}

      {runState && (
        <>
          {/* Lobby Phase */}
          {runState.phase === 'lobby' && (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              backgroundColor: '#000',
              border: '2px solid #00ff00',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '20px' }}>
                WAITING IN LOBBY
              </div>
              <div style={{ fontSize: '16px', marginBottom: '30px' }}>
                {runState.players.length} player{runState.players.length !== 1 ? 's' : ''} ready
              </div>
              <button
                onClick={handleStartDescent}
                style={{
                  padding: '15px 40px',
                  fontSize: '20px',
                  backgroundColor: '#00ff00',
                  color: '#000',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontWeight: 'bold'
                }}
              >
                START DESCENT
              </button>
            </div>
          )}

          {/* Main Game Area - Split View */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
            {/* Left: Game Stats */}
            <div>
              {/* Spectator Banner */}
              {amSpectator && (
                <div style={{
                  padding: '15px',
                  backgroundColor: '#ff6600',
                  color: '#000',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '18px',
                  marginBottom: '20px',
                  border: '3px solid #ff0000'
                }}>
                  {myPlayer.exfiltrated
                    ? `SPECTATING - You exfiltrated with ${myPlayer.payout} TC!`
                    : `SPECTATING - You busted (${myPlayer.bustReason})!`}
                  <br />
                  <span style={{ fontSize: '14px' }}>Watch others potentially go further... 👀</span>
                </div>
              )}

              {/* Stats Display */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '15px',
                marginBottom: '20px',
                padding: '20px',
                backgroundColor: '#000',
                border: '2px solid #00ff00'
              }}>
                <div>
                  <div style={{ fontSize: '14px', marginBottom: '5px' }}>DEPTH</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{runState.depth}</div>
                </div>

                <div>
                  <div style={{ fontSize: '14px', marginBottom: '5px' }}>DATA MULTIPLIER</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffff00' }}>
                    {runState.DataMultiplier.toFixed(2)}x
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '14px', marginBottom: '5px' }}>OXYGEN</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: getO2Color(runState.O2) }}>
                    {runState.O2.toFixed(0)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '14px', marginBottom: '5px' }}>SUIT INTEGRITY</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: getSuitColor(runState.Suit) }}>
                    {(runState.Suit * 100).toFixed(0)}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '14px', marginBottom: '5px' }}>CORRUPTION</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff6600' }}>
                    {runState.Corruption}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '14px', marginBottom: '5px' }}>CURRENT PAYOUT</div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ffff00' }}>
                    {Math.floor(ante * runState.DataMultiplier)} TC
                  </div>
                </div>
              </div>

              {/* Message Display */}
              {message && (
                <div style={{
                  padding: '15px',
                  marginBottom: '20px',
                  backgroundColor: '#000',
                  border: '2px solid #00ff00',
                  textAlign: 'center'
                }}>
                  {message}
                </div>
              )}

              {/* Decision Buttons */}
              {runState.phase === 'descending' && myPlayer?.active && isMyTurn() && (
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  justifyContent: 'center',
                  marginBottom: '20px'
                }}>
                  <button
                    onClick={() => handleDecision('advance')}
                    style={{
                      padding: '20px 40px',
                      fontSize: '20px',
                      backgroundColor: '#ffff00',
                      color: '#000',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      flex: 1
                    }}
                  >
                    ADVANCE
                  </button>

                  <button
                    onClick={() => handleDecision('exfiltrate')}
                    style={{
                      padding: '20px 40px',
                      fontSize: '20px',
                      backgroundColor: '#00ff00',
                      color: '#000',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      flex: 1
                    }}
                  >
                    EXFILTRATE
                  </button>
                </div>
              )}

              {/* Waiting for others */}
              {runState.phase === 'descending' && myPlayer?.active && !isMyTurn() && (
                <div style={{
                  padding: '20px',
                  backgroundColor: '#000',
                  border: '2px solid #ffff00',
                  textAlign: 'center',
                  fontSize: '18px',
                  marginBottom: '20px'
                }}>
                  Waiting for other players to decide...
                </div>
              )}

              {/* Event Log */}
              {runState.eventHistory.length > 0 && (
                <div style={{
                  padding: '15px',
                  backgroundColor: '#000',
                  border: '2px solid #00ff00',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  <div style={{ fontSize: '14px', marginBottom: '10px', fontWeight: 'bold' }}>
                    EVENT LOG
                  </div>
                  {runState.eventHistory.slice(-10).reverse().map((event, idx) => (
                    <div key={idx} style={{ fontSize: '12px', marginBottom: '5px', opacity: 0.8 }}>
                      → {event.description}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Player List (FOMO!) */}
            <div>
              <div style={{
                padding: '20px',
                backgroundColor: '#000',
                border: '2px solid #00ff00',
                maxHeight: '80vh',
                overflowY: 'auto'
              }}>
                <div style={{ fontSize: '18px', marginBottom: '15px', fontWeight: 'bold' }}>
                  PLAYERS ({runState.players.length})
                </div>

                {runState.players.map((player) => (
                  <div
                    key={player.playerId}
                    style={{
                      padding: '12px',
                      marginBottom: '10px',
                      backgroundColor: player.playerId === myPlayerId ? '#003300' : '#1a1a1a',
                      border: `2px solid ${getStatusColor(player)}`,
                      borderRadius: '4px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px'
                    }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {getStatusIcon(player)} {player.playerName}
                        {player.playerId === myPlayerId && ' (You)'}
                      </div>
                    </div>

                    {player.active && (
                      <div style={{ fontSize: '12px', color: '#00ff00' }}>
                        Active - Deciding...
                      </div>
                    )}

                    {player.exfiltrated && (
                      <div style={{ fontSize: '12px', color: '#ffff00' }}>
                        Exfiltrated at depth {player.exfiltrateDepth}
                        <br />
                        <strong style={{ color: '#fff' }}>{player.payout} TC</strong>
                      </div>
                    )}

                    {!player.active && !player.exfiltrated && (
                      <div style={{ fontSize: '12px', color: '#ff0000' }}>
                        Busted at depth {player.bustDepth}
                        <br />
                        ({player.bustReason})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
};
