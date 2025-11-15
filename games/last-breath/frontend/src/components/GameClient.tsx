/**
 * Last Breath Game Client Component
 *
 * React component for the Last Breath game UI
 */

import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { RunState, GameEvent, LastBreathConfig } from '@pirate/game-last-breath';

interface GameClientProps {
  socketUrl?: string;
}

export const GameClient: React.FC<GameClientProps> = ({ socketUrl = 'http://localhost:3001' }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [config, setConfig] = useState<LastBreathConfig | null>(null);
  const [nextHazard, setNextHazard] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Connect to socket
  useEffect(() => {
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    // Set up event listeners
    newSocket.on('run_started', (data: { runId: string; seed: number; state: RunState; config: LastBreathConfig }) => {
      setRunState(data.state);
      setConfig(data.config);
      setMessage(`Run started! Seed: ${data.seed}`);
      setIsProcessing(false);
    });

    newSocket.on('advance_success', (data: { state: RunState; events: GameEvent[]; nextHazard: number }) => {
      setRunState(data.state);
      setNextHazard(data.nextHazard);
      setMessage(data.events.length > 0 ? data.events.map(e => e.description).join(', ') : 'Room cleared!');
      setIsProcessing(false);
    });

    newSocket.on('run_failed', (data: { state: RunState; reason: string; events: GameEvent[] }) => {
      setRunState(data.state);
      setMessage(`RUN FAILED: ${data.reason.toUpperCase()}`);
      setIsProcessing(false);
    });

    newSocket.on('exfiltrate_success', (data: { payout: number; multiplier: number; state: RunState }) => {
      setRunState(data.state);
      setMessage(`EXFILTRATED! Payout: ${data.payout} TC (${data.multiplier.toFixed(2)}x)`);
      setIsProcessing(false);
    });

    newSocket.on('error', (data: { message: string }) => {
      setMessage(`Error: ${data.message}`);
      setIsProcessing(false);
    });

    return () => {
      newSocket.close();
    };
  }, [socketUrl]);

  const handleStartRun = () => {
    if (socket) {
      setIsProcessing(true);
      setMessage('Starting run...');
      socket.emit('start_run');
    }
  };

  const handleAdvance = () => {
    if (socket && runState) {
      setIsProcessing(true);
      setMessage('Advancing...');
      socket.emit('advance', { runId: runState.runId });
    }
  };

  const handleExfiltrate = () => {
    if (socket && runState) {
      setIsProcessing(true);
      setMessage('Exfiltrating...');
      socket.emit('exfiltrate', { runId: runState.runId });
    }
  };

  // Helper functions
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

  const getCorruptionColor = (corruption: number): string => {
    if (corruption < 3) return '#00ff00';
    if (corruption < 6) return '#ffff00';
    return '#ff0000';
  };

  const getHazardColor = (hazard: number): string => {
    if (hazard < 0.15) return '#00ff00';
    if (hazard < 0.30) return '#ffff00';
    return '#ff0000';
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'monospace',
      backgroundColor: '#1a1a1a',
      color: '#00ff00',
      minHeight: '100vh'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        💨 THE LAST BREATH 💨
      </h1>

      {!runState && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleStartRun}
            disabled={isProcessing}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              backgroundColor: '#00ff00',
              color: '#000',
              border: 'none',
              cursor: isProcessing ? 'wait' : 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold'
            }}
          >
            {isProcessing ? 'STARTING...' : 'START RUN'}
          </button>
        </div>
      )}

      {runState && (
        <>
          {/* Stats Display */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '15px',
            marginBottom: '30px',
            padding: '20px',
            backgroundColor: '#000',
            border: '2px solid #00ff00'
          }}>
            <div>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>DEPTH</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{runState.depth}</div>
            </div>

            <div>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>DATA MULTIPLIER</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffff00' }}>
                {runState.DataMultiplier.toFixed(2)}x
              </div>
            </div>

            <div>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>OXYGEN</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: getO2Color(runState.O2) }}>
                {runState.O2.toFixed(0)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>SUIT INTEGRITY</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: getSuitColor(runState.Suit) }}>
                {(runState.Suit * 100).toFixed(0)}%
              </div>
            </div>

            <div>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>CORRUPTION</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: getCorruptionColor(runState.Corruption) }}>
                {runState.Corruption}
              </div>
            </div>

            {runState.active && (
              <div>
                <div style={{ fontSize: '14px', marginBottom: '5px' }}>NEXT HAZARD</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: getHazardColor(nextHazard) }}>
                  {(nextHazard * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          {/* Current Payout Display */}
          {config && (
            <div style={{
              textAlign: 'center',
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#000',
              border: '2px solid #ffff00'
            }}>
              <div style={{ fontSize: '14px', marginBottom: '5px' }}>CURRENT PAYOUT</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffff00' }}>
                {Math.floor(config.ante * runState.DataMultiplier)} TC
              </div>
            </div>
          )}

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

          {/* Action Buttons */}
          {runState.active && (
            <div style={{
              display: 'flex',
              gap: '15px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handleAdvance}
                disabled={isProcessing}
                style={{
                  padding: '15px 30px',
                  fontSize: '18px',
                  backgroundColor: '#ffff00',
                  color: '#000',
                  border: 'none',
                  cursor: isProcessing ? 'wait' : 'pointer',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  flex: 1
                }}
              >
                {isProcessing ? 'ADVANCING...' : 'ADVANCE'}
              </button>

              <button
                onClick={handleExfiltrate}
                disabled={isProcessing}
                style={{
                  padding: '15px 30px',
                  fontSize: '18px',
                  backgroundColor: '#00ff00',
                  color: '#000',
                  border: 'none',
                  cursor: isProcessing ? 'wait' : 'pointer',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  flex: 1
                }}
              >
                {isProcessing ? 'EXFILTRATING...' : 'EXFILTRATE'}
              </button>
            </div>
          )}

          {/* New Run Button (when run is over) */}
          {!runState.active && (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                onClick={handleStartRun}
                disabled={isProcessing}
                style={{
                  padding: '15px 30px',
                  fontSize: '18px',
                  backgroundColor: '#00ff00',
                  color: '#000',
                  border: 'none',
                  cursor: isProcessing ? 'wait' : 'pointer',
                  fontFamily: 'monospace',
                  fontWeight: 'bold'
                }}
              >
                NEW RUN
              </button>
            </div>
          )}

          {/* Event History */}
          {runState.eventHistory.length > 0 && (
            <div style={{
              marginTop: '30px',
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
        </>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '40px',
        textAlign: 'center',
        fontSize: '12px',
        opacity: 0.6
      }}>
        Every room takes your breath away. Literally.
      </div>
    </div>
  );
};
