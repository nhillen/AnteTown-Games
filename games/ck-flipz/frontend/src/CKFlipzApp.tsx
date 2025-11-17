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
import { io, Socket } from 'socket.io-client';
import CoinFlipClient from './CoinFlipClient';

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

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || window.location.origin;

export default function CKFlipzApp({
  initialTableId,
  initialBuyIn,
  userId,
  username,
  onLeaveTable,
  onCurrencyChange
}: {
  initialTableId?: string | null;
  initialBuyIn?: number;
  userId?: string;
  username?: string;
  onLeaveTable?: () => void;
  onCurrencyChange?: () => void | Promise<void>;
} = {}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(initialTableId || null);
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

  // Connect to socket (only after we have user credentials)
  useEffect(() => {
    if (!userId || !username) {
      console.log('[CK Flipz] Waiting for user credentials before connecting...');
      return;
    }

    console.log('[CK Flipz] Connecting to backend:', BACKEND_URL, 'with user:', username);
    const newSocket = io(BACKEND_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: {
        userId: userId,
        username: username
      }
    });

    newSocket.on('connect', () => {
      console.log('[CK Flipz] Connected to server, socket ID:', newSocket.id);
      setMyId(newSocket.id || '');
      setConnectionStatus('connected');

      // If initialTableId provided, auto-join that table
      if (initialTableId) {
        console.log('[CK Flipz] Auto-joining table:', initialTableId);
        newSocket.emit('join_table', { tableId: initialTableId });
      } else {
        // Otherwise request table stats for selection
        console.log('[CK Flipz] Requesting table stats...');
        newSocket.emit('request_table_stats');
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('[CK Flipz] Connection error:', error);
      setConnectionStatus('error');
    });

    newSocket.on('disconnect', () => {
      console.log('[CK Flipz] Disconnected from server');
      setConnectionStatus('connecting');
    });

    // Table discovery
    newSocket.on('table_stats', (stats: Record<string, any>) => {
      console.log('[CK Flipz] Received table_stats:', stats);

      const ckFlipzTables = Object.entries(stats)
        .filter(([tableId]) => tableId.startsWith('ck-flipz-'))
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

      console.log('[CK Flipz] Filtered CK Flipz tables:', ckFlipzTables);
      setTables(ckFlipzTables);

      // Don't auto-join - wait for user to select
      // Auto-join was causing disconnect issues
    });

    // Game state updates
    newSocket.on('game_state', (state: CoinFlipGameState) => {
      console.log('[CK Flipz] Game state update:', state);
      setGameState(state);

      // Check if we're seated
      const seated = state.seats.some(s => s?.playerId === newSocket.id);
      const wasSeated = isSeated;
      setIsSeated(seated);

      // Refresh currency when we sit down (seated changed from false to true)
      if (seated && !wasSeated && onCurrencyChange) {
        console.log('[CK Flipz] Seated - will refresh currency in 500ms');
        // Delay refresh to avoid component lifecycle issues
        setTimeout(() => {
          console.log('[CK Flipz] Refreshing currency balance now');
          Promise.resolve(onCurrencyChange()).catch(err =>
            console.error('[CK Flipz] Error refreshing currency:', err)
          );
        }, 500);
      }

      // Auto-sit if we joined via initialTableId and haven't sat yet
      if (initialTableId && !seated && !hasAttemptedAutoSit) {
        const emptySeatIndex = state.seats.findIndex(s => !s || !s.playerId);
        if (emptySeatIndex !== -1) {
          // Use provided buy-in or calculate default (5x ante, min 100 TC)
          const buyIn = initialBuyIn || Math.max(state.ante * 5, 100);
          console.log('[CK Flipz] Auto-sitting at seat', emptySeatIndex, 'with buy-in:', buyIn, 'TC');
          setHasAttemptedAutoSit(true);
          newSocket.emit('sit_down', {
            seatIndex: emptySeatIndex,
            buyInAmount: buyIn  // TC amount directly, no conversion needed
          });
        }
      }
    });

    // Joined table
    newSocket.on('table_joined', (data: { tableId: string }) => {
      console.log('[CK Flipz] Joined table:', data.tableId);
      setSelectedTable(data.tableId);
      // Game state will come via separate game_state event
    });

    // Stood up - return to lobby
    newSocket.on('stood_up', (data: { tableId: string }) => {
      console.log('[CK Flipz] Stood up from table:', data.tableId);
      setSelectedTable(null);
      setGameState(null);
      setIsSeated(false);

      // Refresh currency when we stand up (cashout happens)
      if (onCurrencyChange) {
        console.log('[CK Flipz] Stood up - refreshing currency balance');
        onCurrencyChange();
      }

      // Notify parent component to return to lobby
      if (onLeaveTable) {
        onLeaveTable();
      }
    });

    // Error handling
    newSocket.on('error', (error: any) => {
      console.error('[CK Flipz] Server error:', error);
    });

    // Catch-all for any errors
    newSocket.on('exception', (error: any) => {
      console.error('[CK Flipz] Server exception:', error);
    });

    setSocket(newSocket);

    return () => {
      console.log('[CK Flipz] Cleaning up socket connection');
      newSocket.close();
    };
  }, [userId, username]);

  // Handle player actions
  const handlePlayerAction = (action: string, amount?: number) => {
    if (!socket || !selectedTable) return;

    console.log('[CK Flipz] Player action:', action, amount);
    socket.emit('player_action', {
      tableId: selectedTable,
      action,
      amount
    });
  };

  // Handle sit down
  const handleSitDown = (seatIndex: number, buyInAmount: number) => {
    if (!socket || !selectedTable) return;

    console.log('[CK Flipz] Sitting down at seat:', seatIndex, 'with buy-in:', buyInAmount);
    socket.emit('sit_down', {
      tableId: selectedTable,
      seatIndex,
      buyInAmount: buyInAmount  // TC amount directly, no conversion needed
    });
  };

  // Handle stand up
  const handleStandUp = () => {
    if (!socket || !selectedTable) return;

    console.log('[CK Flipz] Standing up');
    socket.emit('stand_up', { tableId: selectedTable });
  };

  // Handle table selection
  const handleSelectTable = (tableId: string) => {
    if (!socket) return;

    console.log('[CK Flipz] Selecting table:', tableId);
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

  // Game screen
  return (
    <CoinFlipClient
      game={gameState}
      meId={myId}
      onPlayerAction={handlePlayerAction}
      onSitDown={handleSitDown}
      onStandUp={handleStandUp}
      isSeated={isSeated}
    />
  );
}
