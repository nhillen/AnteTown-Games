/**
 * CKFlipzApp - Socket-connected wrapper for CK Flipz game
 *
 * Handles:
 * - Socket.IO connection
 * - Table selection and joining
 * - Game state management
 * - Passing props to CoinFlipClient component
 */

import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import CoinFlipClient from './CoinFlipClient';
import CardFlipClient from './CardFlipClient';

type CoinFlipGameState = {
  phase: 'Lobby' | 'Ante' | 'CallSide' | 'Flip' | 'Payout' | 'HandEnd';
  seats: any[];
  pot: number;
  currentBet: number;
  ante: number;
  currentTurnPlayerId?: string;
  turnEndsAtMs?: number;
  calledSide?: 'heads' | 'tails';
  callerPlayerId?: string;
  flipResult?: 'heads' | 'tails';
  gameType?: string; // 'flipz' for coin, 'card-flip' for cards
};

type Table = {
  tableId: string;
  displayName: string;
  variant: 'coin-flip' | 'card-flip';
  ante: number;
  maxSeats: number;
  currentPlayers: number;
  description: string;
  emoji: string;
};

export default function CKFlipzApp({
  socket,
  initialTableId,
  initialBuyIn,
  userId,
  username,
  onLeaveTable
}: {
  socket: Socket | null;
  initialTableId?: string | null;
  initialBuyIn?: number;
  userId?: string;
  username?: string;
  onLeaveTable?: () => void;
} = {} as any) {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(initialTableId || null);
  const [currentVariant, setCurrentVariant] = useState<'coin-flip' | 'card-flip'>('coin-flip');
  const [gameState, setGameState] = useState<CoinFlipGameState | null>(null);
  const [myId, setMyId] = useState<string>('');
  const [isSeated, setIsSeated] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [hasAttemptedAutoSit, setHasAttemptedAutoSit] = useState(false);

  // Require authentication
  if (!userId || !username) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <div className="text-xl text-white mb-2">Authentication Required</div>
          <div className="text-gray-400 mb-4">You must be logged in to play CK Flipz</div>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // Use platform-provided socket
  useEffect(() => {
    if (!socket) {
      return;
    }

    if (!userId || !username) {
      return;
    }

    // Set my socket ID
    setMyId(socket.id || '');
    setConnectionStatus('connected');

    // Join table on mount
    if (initialTableId) {
      socket.emit('join_table', { tableId: initialTableId });
    } else {
      // Otherwise request table stats for selection
      socket.emit('request_table_stats');
    }

    // Note: Socket lifecycle (connect/disconnect) is managed by AuthProvider
    // We only handle game-specific events here

    // Table discovery - ONLY if we don't have an initialTableId (i.e., showing table browser)
    if (!initialTableId) {
      socket.on('table_stats', (stats: Record<string, any>) => {
        const ckFlipzTables = Object.entries(stats)
          .filter(([tableId]) => tableId.startsWith('flipz-'))
          .map(([tableId, data]: [string, any]) => ({
            tableId,
            displayName: data.displayName || tableId,
            variant: data.config?.variant || 'coin-flip',
            ante: data.config?.ante || 100,
            maxSeats: data.config?.maxSeats || 2,
            currentPlayers: data.playerCount || 0,
            description: data.config?.description || 'Coin flip game',
            emoji: data.config?.variant === 'card-flip' ? '🃏' : '🪙'
          }));

        if (ckFlipzTables.length === 0) {
          console.warn('[CK Flipz] No tables found in table_stats');
        }
        setTables(ckFlipzTables);

        // Don't auto-join - wait for user to select
        // Auto-join was causing disconnect issues
      });
    }

    // Game state updates
    socket.on('game_state', (state: CoinFlipGameState) => {
      setGameState(state);

      // Update variant from game state if available
      if (state.gameType) {
        const variant = state.gameType === 'card-flip' ? 'card-flip' : 'coin-flip';
        setCurrentVariant(variant);
      }

      // Check if we're seated
      const seated = state.seats.some(s => s?.playerId === socket.id);
      setIsSeated(seated);

      // DISABLED: Refresh on sit causes disconnect issues
      // Balance will be refreshed when standing up instead

      // Auto-sit if we joined via initialTableId and haven't sat yet
      if (initialTableId && !seated && !hasAttemptedAutoSit) {
        const emptySeatIndex = state.seats.findIndex(s => !s || !s.playerId);
        if (emptySeatIndex !== -1) {
          // Use provided buy-in or calculate default (5x ante, min 100 TC)
          const buyIn = initialBuyIn || Math.max(state.ante * 5, 100);
          setHasAttemptedAutoSit(true);
          socket.emit('sit_down', {
            seatIndex: emptySeatIndex,
            buyInAmount: buyIn  // TC amount directly, no conversion needed
          });
        }
      }
    });

    // Joined table
    socket.on('table_joined', (data: { tableId: string }) => {
      setSelectedTable(data.tableId);
      // Game state will come via separate game_state event
    });

    // Balance updates are handled by AuthProvider
    // No need to listen here - the platform socket already handles it

    // Stood up - return to lobby
    socket.on('stood_up', () => {
      setSelectedTable(null);
      setGameState(null);
      setIsSeated(false);

      // Balance will be updated via balance_updated event from platform

      // Notify parent component to return to lobby
      if (onLeaveTable) {
        onLeaveTable();
      }
    });

    // Error handling
    socket.on('error', (error: any) => {
      console.error('[CK Flipz] Server error:', error);
    });

    // Catch-all for any errors
    socket.on('exception', (error: any) => {
      console.error('[CK Flipz] Server exception:', error);
    });

    return () => {
      console.log('[CK Flipz] Cleaning up game event listeners - socket:', socket?.id, 'tableId:', initialTableId, 'buyIn:', initialBuyIn);
      // Remove only game-specific listeners, don't close the socket
      if (socket) {
        // Only remove table_stats listener if we added it (no initialTableId)
        if (!initialTableId) {
          socket.off('table_stats');
        }
        socket.off('game_state');
        socket.off('table_joined');
        socket.off('stood_up');
        socket.off('error');
        socket.off('exception');
      }
    };
  }, [socket, initialTableId, initialBuyIn]);

  // Handle player actions
  const handlePlayerAction = (action: string, amount?: number) => {
    if (!socket || !selectedTable) return;

    socket.emit('player_action', {
      tableId: selectedTable,
      action,
      amount
    });
  };

  // Handle sit down
  const handleSitDown = (seatIndex: number, buyInAmount: number) => {
    if (!socket || !selectedTable) return;

    socket.emit('sit_down', {
      tableId: selectedTable,
      seatIndex,
      buyInAmount: buyInAmount  // TC amount directly, no conversion needed
    });
  };

  // Handle stand up
  const handleStandUp = () => {
    if (!socket || !selectedTable) return;

    socket.emit('stand_up', { tableId: selectedTable });
  };

  // Handle table selection
  const handleSelectTable = (tableId: string) => {
    if (!socket) return;

    const table = tables.find(t => t.tableId === tableId);
    if (table) {
      setCurrentVariant(table.variant);
    }
    setSelectedTable(tableId);
    socket.emit('join_table', { tableId });
  };

  // Loading state
  if (connectionStatus === 'connecting') {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-4xl mb-4">🪙</div>
          <div className="text-xl text-white">Connecting to CK Flipz...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (connectionStatus === 'error') {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-xl text-red-400">Connection Error</div>
          <div className="text-gray-400 mt-2">Please refresh the page</div>
        </div>
      </div>
    );
  }

  // Waiting for game state (after joining table)
  if (selectedTable && !gameState) {
    console.log('[CK Flipz] Waiting for game state for table:', selectedTable);
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-4xl mb-4">🪙</div>
          <div className="text-xl text-white">Joining table...</div>
          <div className="text-gray-400 mt-2">Waiting for game state</div>
        </div>
      </div>
    );
  }

  // Table selection screen (no table selected yet)
  if (!selectedTable) {
    console.log('[CK Flipz] Rendering table selection screen. Tables:', tables.length);

    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="max-w-2xl w-full">
          <h1 className="text-4xl font-bold text-white text-center mb-8">
            🪙 CK Flipz
          </h1>

          <div className="text-center text-sm text-gray-500 mb-4">
            Socket: {connectionStatus} | Tables: {tables.length}
          </div>

          {tables.length === 0 ? (
            <div className="text-center text-gray-400">
              <div className="text-xl mb-2">Looking for tables...</div>
              <div className="text-sm">Waiting for table discovery to complete</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center text-gray-300 mb-4 text-lg">Select a table to join:</div>
              {tables.map((table) => (
                <button
                  key={table.tableId}
                  onClick={() => handleSelectTable(table.tableId)}
                  className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 hover:border-emerald-500 transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{table.emoji}</div>
                      <div>
                        <div className="text-white font-bold">{table.displayName}</div>
                        <div className="text-sm text-gray-400">{table.description}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-yellow-400 font-bold">
                        {table.ante} TC ante
                      </div>
                      <div className="text-sm text-gray-400">
                        {table.currentPlayers} / {table.maxSeats} players
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Game screen - render appropriate client based on variant
  const GameClient = currentVariant === 'card-flip' ? CardFlipClient : CoinFlipClient;

  return (
    <GameClient
      game={gameState as any}
      meId={myId}
      onPlayerAction={handlePlayerAction}
      onSitDown={handleSitDown}
      onStandUp={handleStandUp}
      isSeated={isSeated}
    />
  );
}
