# Multi-Table Integration Guide

## Overview

HouseRules v0.2.11+ supports multi-table poker with a pluggable rules engine. This guide shows how to integrate the multi-table lobby system into your server.

## Installation

```bash
npm install @pirate/game-houserules@0.2.11
```

## Architecture

```
HouseRulesLobby
  ├── TableRegistry (manages all active tables)
  ├── TableManager (server-side table routing)
  └── PokerLobby.tsx (client-side table browser)

Server Side:
  - Multiple HouseRules game instances
  - Each instance = one table with specific variant/rules
  - Players route to specific table via tableId
```

## Server Integration

### 1. Initialize Table Registry

```typescript
import { TableRegistry, TableManager, DEFAULT_TABLES } from '@pirate/game-houserules';

// Create registry with default tables (or provide custom configs)
const tableRegistry = new TableRegistry(DEFAULT_TABLES);
const tableManager = new TableManager(tableRegistry);

console.log(`🎰 Initialized ${tableRegistry.getTableCount()} poker tables`);
```

### 2. Handle Table List Requests

```typescript
// Socket.io event handler
socket.on('poker:get_tables', () => {
  const tables = tableManager.getActiveTables();
  socket.emit('poker:tables_list', tables);
});
```

### 3. Handle Join Table Requests

```typescript
socket.on('poker:join_table', ({ tableId, buyInAmount }) => {
  const player = getPlayerFromSocket(socket);

  const result = tableManager.routePlayerToTable(
    player,
    tableId,
    undefined, // seatIndex (auto-select)
    buyInAmount
  );

  if (result.success) {
    // Subscribe socket to table-specific room
    socket.join(`table:${tableId}`);

    // Broadcast updated game state
    const table = tableManager.getTable(tableId);
    io.to(`table:${tableId}`).emit('game_state', table?.gameState);
  } else {
    socket.emit('error', { message: result.error });
  }
});
```

### 4. Handle Player Actions

```typescript
socket.on('player_action', ({ action, data }) => {
  const playerId = getPlayerIdFromSocket(socket);
  const tableId = tableManager.getPlayerTableId(playerId);

  if (!tableId) {
    socket.emit('error', { message: 'Not seated at any table' });
    return;
  }

  const table = tableManager.getTable(tableId);

  if (table) {
    table.handlePlayerAction(playerId, action, data);
    io.to(`table:${tableId}`).emit('game_state', table.gameState);
  }
});
```

### 5. Handle Leave Table

```typescript
socket.on('poker:leave_table', () => {
  const playerId = getPlayerIdFromSocket(socket);
  const tableId = tableManager.getPlayerTableId(playerId);

  if (tableId) {
    tableManager.removePlayerFromTable(playerId);
    socket.leave(`table:${tableId}`);

    // Return to lobby
    const tables = tableManager.getActiveTables();
    socket.emit('poker:tables_list', tables);
  }
});
```

## Client Integration

### 1. Show Lobby

```tsx
import { PokerLobby } from '@pirate/game-houserules';

function HouseRulesLobby() {
  const [tables, setTables] = useState([]);
  const [playerBankroll, setPlayerBankroll] = useState(0);

  useEffect(() => {
    socket.emit('poker:get_tables');

    socket.on('poker:tables_list', (tableList) => {
      setTables(tableList);
    });

    return () => socket.off('poker:tables_list');
  }, []);

  const handleSelectTable = (tableId: string, buyInAmount: number) => {
    socket.emit('poker:join_table', { tableId, buyInAmount });
  };

  return (
    <PokerLobby
      tables={tables}
      onSelectTable={handleSelectTable}
      playerBankroll={playerBankroll}
    />
  );
}
```

### 2. Show Game Table

```tsx
import { PokerClient } from '@pirate/game-houserules';

function HouseRulesTable({ tableId }) {
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    socket.on('game_state', (state) => {
      setGameState(state);
    });

    return () => socket.off('game_state');
  }, []);

  const handlePlayerAction = (action: string, data?: any) => {
    socket.emit('player_action', { action, data });
  };

  const handleLeaveTable = () => {
    socket.emit('poker:leave_table');
  };

  if (!gameState) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={handleLeaveTable}>Leave Table</button>
      <PokerClient
        gameState={gameState}
        meId={myPlayerId}
        onPlayerAction={handlePlayerAction}
      />
    </div>
  );
}
```

## Adding Custom Tables

```typescript
import { PokerTableConfig } from '@pirate/game-houserules';

const customTable: PokerTableConfig = {
  tableId: 'squidz-game-1',
  displayName: 'Squidz Game',
  variant: 'squidz-game',
  rules: {
    // Custom variant-specific rules
  },
  minBuyIn: 2000,     // $20
  maxBuyIn: 10000,    // $100
  smallBlind: 50,     // $0.50
  bigBlind: 100,      // $1.00
  maxSeats: 9,
  emoji: '🦑',
  description: 'Squidz Game variant with special rules',
  currentPlayers: 0,
  isActive: true
};

// Add to registry
tableRegistry.addTable(customTable);
```

## Rules Engine

Each table can use a different poker variant by implementing a `PokerRulesEngine`:

```typescript
import { PokerRulesEngine, RulesEngineRegistry } from '@pirate/game-houserules';

const SQUIDZ_RULES: PokerRulesEngine = {
  variant: 'squidz-game',
  modifiers: {
    // ... variant config
  },
  hooks: {
    evaluateHand: (holeCards, communityCards) => {
      // Custom hand evaluation logic
    },
    getHoleCardCount: (phase) => {
      // Custom hole card count
    },
    // ... other hooks
  }
};

// Register the variant
RulesEngineRegistry.register('squidz-game', SQUIDZ_RULES);
```

## Benefits

1. **Multiple Tables**: Players can browse and join different tables
2. **Multiple Variants**: Each table can run a different poker variant
3. **Extensible**: Easy to add new variants via rules engine
4. **Future-Proof**: Architecture supports roguelike mode and relics

## Next Steps

1. Implement your custom poker variant rules
2. Create table configurations for your variant
3. Register the rules engine
4. Add tables to the registry
5. Test with multiple concurrent tables
