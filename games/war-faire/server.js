// Web server for State Fair game
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Game } from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Game state
const games = new Map(); // gameId -> game instance
const players = new Map(); // socketId -> { gameId, playerName, playerId }

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create or join a game
  socket.on('joinGame', ({ gameId, playerName }) => {
    console.log(`${playerName} joining game ${gameId}`);

    let game = games.get(gameId);

    if (!game) {
      // Create new game
      game = {
        id: gameId,
        players: [],
        gameInstance: null,
        state: 'waiting', // waiting, playing, finished
        currentRound: 0,
        currentFair: 0,
        pendingActions: new Map() // playerId -> pending action
      };
      games.set(gameId, game);
    }

    // Check if game is full (max 10 players)
    if (game.players.length >= 10) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    // Check if game already started
    if (game.state === 'playing' || game.state === 'finished') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    // Add player to game
    const playerId = game.players.length;
    game.players.push({
      id: playerId,
      name: playerName,
      socketId: socket.id,
      isAI: false
    });

    players.set(socket.id, { gameId, playerName, playerId });

    // Join socket room
    socket.join(gameId);

    // Notify all players in the game
    io.to(gameId).emit('playerJoined', {
      players: game.players,
      canStart: game.players.length >= 4
    });

    console.log(`Game ${gameId} now has ${game.players.length} players`);
  });

  // Add AI players
  socket.on('addAIPlayers', ({ gameId, count }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.state !== 'waiting') {
      socket.emit('error', { message: 'Cannot add AI to started game' });
      return;
    }

    const aiNames = ['AI-Alpha', 'AI-Beta', 'AI-Gamma', 'AI-Delta', 'AI-Epsilon', 'AI-Zeta'];
    const playersToAdd = Math.min(count, 10 - game.players.length, aiNames.length);

    for (let i = 0; i < playersToAdd; i++) {
      const playerId = game.players.length;
      const aiName = aiNames[i] || `AI-${playerId}`;
      game.players.push({
        id: playerId,
        name: aiName,
        socketId: `AI-${gameId}-${playerId}`,
        isAI: true
      });
    }

    // Notify all players
    io.to(gameId).emit('playerJoined', {
      players: game.players,
      canStart: game.players.length >= 4
    });

    console.log(`Added ${playersToAdd} AI players to game ${gameId}`);
  });

  // Start the game
  socket.on('startGame', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.players.length < 4) {
      socket.emit('error', { message: 'Need at least 4 players to start' });
      return;
    }

    // Initialize game instance
    const playerNames = game.players.map(p => p.name);
    game.gameInstance = new Game(playerNames);
    game.state = 'playing';
    game.currentFair = 1;
    game.currentRound = 0;

    // Setup first Fair
    game.gameInstance.setupFirstFair();

    // Notify all players
    io.to(gameId).emit('gameStarted', {
      activeCategories: game.gameInstance.activeCategories,
      categoryPrestige: game.gameInstance.categoryPrestige
    });

    // Start first round
    startRound(gameId, game);
  });

  // Player card selection
  socket.on('playCards', ({ gameId, faceUpCard, faceDownCard, groupSelections }) => {
    const game = games.get(gameId);
    const playerInfo = players.get(socket.id);

    if (!game || !playerInfo) {
      socket.emit('error', { message: 'Invalid game or player' });
      return;
    }

    // Store the player's action
    game.pendingActions.set(playerInfo.playerId, {
      faceUpCard,
      faceDownCard,
      groupSelections
    });

    // Check if all players have submitted their actions
    if (game.pendingActions.size === game.players.length) {
      processRound(gameId, game);
    } else {
      // Notify waiting for other players
      io.to(gameId).emit('waitingForPlayers', {
        submitted: game.pendingActions.size,
        total: game.players.length
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const playerInfo = players.get(socket.id);

    if (playerInfo) {
      const game = games.get(playerInfo.gameId);
      if (game && game.state === 'waiting') {
        // Remove player from waiting game
        game.players = game.players.filter(p => p.socketId !== socket.id);
        io.to(playerInfo.gameId).emit('playerLeft', {
          players: game.players,
          canStart: game.players.length >= 4
        });

        // Delete empty games
        if (game.players.length === 0) {
          games.delete(playerInfo.gameId);
        }
      }
      players.delete(socket.id);
    }
  });
});

function startRound(gameId, game) {
  const gameInstance = game.gameInstance;
  game.currentRound++;
  game.pendingActions.clear();

  console.log(`Starting Fair ${game.currentFair}, Round ${game.currentRound}`);

  // Flip face-down cards
  for (const player of gameInstance.players) {
    if (player.faceDownCards.length > 0) {
      player.flipFaceDownCards();
    }
  }

  // Each player draws 3 cards
  for (const player of gameInstance.players) {
    for (let i = 0; i < 3; i++) {
      if (gameInstance.deck.length > 0) {
        player.addToHand(gameInstance.deck.pop());
      }
    }
  }

  // Send game state to each player
  for (const playerData of game.players) {
    const player = gameInstance.players[playerData.id];
    const socket = io.sockets.sockets.get(playerData.socketId);

    if (socket) {
      socket.emit('roundStarted', {
        fair: game.currentFair,
        round: game.currentRound,
        hand: player.hand.map(card => ({
          category: card.category,
          value: card.value,
          isGroupCard: card.isGroupCard
        })),
        playedCards: player.playedCards.map(card => ({
          category: card.getEffectiveCategory(),
          value: card.value
        })),
        activeCategories: gameInstance.activeCategories,
        categoryPrestige: gameInstance.categoryPrestige,
        deckSize: gameInstance.deck.length
      });
    }
  }

  // Auto-play for AI players after a short delay
  setTimeout(() => {
    playAITurns(gameId, game);
  }, 1000);
}

function playAITurns(gameId, game) {
  const gameInstance = game.gameInstance;

  for (const playerData of game.players) {
    if (playerData.isAI && !game.pendingActions.has(playerData.id)) {
      const player = gameInstance.players[playerData.id];

      if (player.hand.length >= 2) {
        // Simple AI: pick random cards
        const faceUpCard = player.hand[Math.floor(Math.random() * player.hand.length)];
        const remainingCards = player.hand.filter(c => c !== faceUpCard);
        const faceDownCard = remainingCards[Math.floor(Math.random() * remainingCards.length)];

        const groupSelections = {};

        // If group card, pick random category in group
        if (faceUpCard.isGroupCard) {
          const validCategories = game.gameInstance.activeCategories.filter(
            cat => cat.group === faceUpCard.category
          );
          if (validCategories.length > 0) {
            groupSelections.faceUp = validCategories[Math.floor(Math.random() * validCategories.length)].name;
          }
        }

        if (faceDownCard && faceDownCard.isGroupCard) {
          const validCategories = game.gameInstance.activeCategories.filter(
            cat => cat.group === faceDownCard.category
          );
          if (validCategories.length > 0) {
            groupSelections.faceDown = validCategories[Math.floor(Math.random() * validCategories.length)].name;
          }
        }

        // Store AI action
        game.pendingActions.set(playerData.id, {
          faceUpCard: {
            category: faceUpCard.category,
            value: faceUpCard.value,
            isGroupCard: faceUpCard.isGroupCard
          },
          faceDownCard: faceDownCard ? {
            category: faceDownCard.category,
            value: faceDownCard.value,
            isGroupCard: faceDownCard.isGroupCard
          } : null,
          groupSelections
        });

        console.log(`AI ${playerData.name} played cards`);
      }
    }
  }

  // Notify about waiting status
  io.to(gameId).emit('waitingForPlayers', {
    submitted: game.pendingActions.size,
    total: game.players.length
  });

  // Check if all players (including AI) have played
  if (game.pendingActions.size === game.players.length) {
    processRound(gameId, game);
  }
}

function processRound(gameId, game) {
  const gameInstance = game.gameInstance;

  // Process each player's submitted actions
  for (const [playerId, action] of game.pendingActions) {
    const player = gameInstance.players[playerId];

    // Find the cards in player's hand
    const faceUpCard = player.hand.find(c =>
      c.category === action.faceUpCard.category &&
      c.value === action.faceUpCard.value &&
      c.isGroupCard === action.faceUpCard.isGroupCard
    );

    const faceDownCard = player.hand.find(c =>
      c.category === action.faceDownCard.category &&
      c.value === action.faceDownCard.value &&
      c.isGroupCard === action.faceDownCard.isGroupCard &&
      c !== faceUpCard // Don't select the same card twice
    );

    if (faceUpCard && faceDownCard) {
      // Apply group selections if any
      if (faceUpCard.isGroupCard && action.groupSelections?.faceUp) {
        faceUpCard.selectedCategory = action.groupSelections.faceUp;
      }
      if (faceDownCard.isGroupCard && action.groupSelections?.faceDown) {
        faceDownCard.selectedCategory = action.groupSelections.faceDown;
      }

      player.playCardFaceUp(faceUpCard);
      player.playCardFaceDown(faceDownCard);
    }
  }

  game.pendingActions.clear();

  // Check if round is complete (3 rounds per Fair)
  if (game.currentRound >= 3) {
    endFair(gameId, game);
  } else {
    // Start next round
    startRound(gameId, game);
  }
}

function endFair(gameId, game) {
  const gameInstance = game.gameInstance;

  console.log(`Ending Fair ${game.currentFair}`);

  // Import scoring functions
  import('./scorer.js').then(({ scoreFair, updatePrestige }) => {
    const results = scoreFair(
      gameInstance.players,
      gameInstance.activeCategories,
      gameInstance.categoryPrestige
    );

    // Update prestige
    const topCategories = updatePrestige(
      gameInstance.activeCategories,
      gameInstance.categoryPrestige,
      results
    );

    // Send results to all players
    io.to(gameId).emit('fairEnded', {
      fair: game.currentFair,
      results: {
        categories: results.categories,
        groups: results.groups,
        prestigeUpdates: topCategories
      },
      standings: gameInstance.players.map(p => ({
        name: p.name,
        totalVP: p.totalVP,
        ribbons: p.ribbons.length
      })).sort((a, b) => b.totalVP - a.totalVP)
    });

    // Check if game should continue
    // For now, let's play 3 Fairs total
    if (game.currentFair >= 3) {
      endGame(gameId, game);
    } else {
      // Prepare next Fair
      gameInstance.prepareNextFair();
      game.currentFair++;
      game.currentRound = 0;

      // Notify players and start next Fair
      setTimeout(() => {
        io.to(gameId).emit('nextFairReady', {
          fair: game.currentFair,
          activeCategories: gameInstance.activeCategories,
          categoryPrestige: gameInstance.categoryPrestige
        });
        startRound(gameId, game);
      }, 5000); // 5 second delay between Fairs
    }
  });
}

function endGame(gameId, game) {
  const gameInstance = game.gameInstance;
  game.state = 'finished';

  const winner = gameInstance.getWinner();
  const finalStandings = gameInstance.players.map(p => ({
    name: p.name,
    totalVP: p.totalVP,
    ribbons: p.ribbons
  })).sort((a, b) => b.totalVP - a.totalVP);

  io.to(gameId).emit('gameEnded', {
    winner: {
      name: winner.name,
      totalVP: winner.totalVP,
      ribbons: winner.ribbons
    },
    standings: finalStandings
  });

  console.log(`Game ${gameId} ended. Winner: ${winner.name} with ${winner.totalVP} VP`);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`⚔️ War Faire server running on http://localhost:${PORT}`);
});
