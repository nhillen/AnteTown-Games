// Client-side game logic
const socket = io();

// Game state
let gameState = {
  gameId: null,
  playerName: null,
  playerId: null,
  currentFair: 1,
  currentRound: 1,
  hand: [],
  playedCards: [],
  activeCategories: [],
  categoryPrestige: {},
  selectedFaceUp: null,
  selectedFaceDown: null,
  playerVP: 0,
  playerRibbons: 0,
  deckSize: 0
};

// Category emojis
const CATEGORY_EMOJIS = {
  'Carrots': '🥕',
  'Pumpkins': '🎃',
  'Tomatoes': '🍅',
  'Corn': '🌽',
  'Pies': '🥧',
  'Cakes': '🎂',
  'Cookies': '🍪',
  'Breads': '🍞',
  'Pigs': '🐷',
  'Cows': '🐄',
  'Chickens': '🐔',
  'Goats': '🐐',
  'Produce': '🌾',
  'Baking': '🧁',
  'Livestock': '🐮'
};

// DOM Elements
const screens = {
  lobby: document.getElementById('lobby'),
  game: document.getElementById('game'),
  results: document.getElementById('results'),
  gameOver: document.getElementById('gameOver')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupLobbyListeners();
  setupGameListeners();
  setupSocketListeners();
});

// ===== LOBBY =====
function setupLobbyListeners() {
  document.getElementById('joinBtn').addEventListener('click', joinGame);
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('addAIBtn').addEventListener('click', addAIPlayers);

  // Allow Enter key to join
  document.getElementById('playerName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
  });
  document.getElementById('gameId').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
  });
}

function joinGame() {
  const playerName = document.getElementById('playerName').value.trim();
  const gameId = document.getElementById('gameId').value.trim() || generateGameId();

  if (!playerName) {
    alert('Please enter your name');
    return;
  }

  gameState.playerName = playerName;
  gameState.gameId = gameId;

  socket.emit('joinGame', { gameId, playerName });
}

function addAIPlayers() {
  socket.emit('addAIPlayers', { gameId: gameState.gameId, count: 3 });
}

function startGame() {
  socket.emit('startGame', { gameId: gameState.gameId });
}

function generateGameId() {
  return 'GAME-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ===== GAME LOGIC =====
function setupGameListeners() {
  document.getElementById('submitBtn').addEventListener('click', submitCards);
  document.getElementById('clearBtn').addEventListener('click', clearSelection);
  document.getElementById('newGameBtn').addEventListener('click', () => {
    location.reload();
  });
}

function renderHand() {
  const handEl = document.getElementById('hand');
  handEl.innerHTML = '';

  if (gameState.hand.length === 0) {
    handEl.innerHTML = '<p class="empty-msg">No cards in hand</p>';
    return;
  }

  gameState.hand.forEach((card, index) => {
    const cardEl = createCardElement(card, index);
    cardEl.addEventListener('click', () => selectCard(card, index));
    handEl.appendChild(cardEl);
  });
}

function createCardElement(card, index) {
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.index = index;

  if (gameState.selectedFaceUp?.index === index || gameState.selectedFaceDown?.index === index) {
    cardEl.classList.add('selected');
  }

  const categoryEl = document.createElement('div');
  categoryEl.className = 'card-category';
  const emoji = CATEGORY_EMOJIS[card.category] || '';
  categoryEl.textContent = emoji ? `${emoji} ${card.category}` : card.category;

  const valueEl = document.createElement('div');
  valueEl.className = 'card-value';
  valueEl.textContent = card.value;

  cardEl.appendChild(categoryEl);
  cardEl.appendChild(valueEl);

  if (card.isGroupCard) {
    const badge = document.createElement('div');
    badge.className = 'card-group-badge';
    badge.textContent = 'GROUP';
    cardEl.appendChild(badge);
  }

  return cardEl;
}

function selectCard(card, index) {
  // If card is already selected for face-up, deselect it
  if (gameState.selectedFaceUp?.index === index) {
    gameState.selectedFaceUp = null;
    updateSelectionDisplay();
    renderHand();
    return;
  }

  // If card is already selected for face-down, deselect it
  if (gameState.selectedFaceDown?.index === index) {
    gameState.selectedFaceDown = null;
    updateSelectionDisplay();
    renderHand();
    return;
  }

  // If both slots are full, don't allow selection
  if (gameState.selectedFaceUp && gameState.selectedFaceDown) {
    alert('Both slots are full. Clear a slot first.');
    return;
  }

  // Add to first empty slot
  if (!gameState.selectedFaceUp) {
    gameState.selectedFaceUp = { card, index };
  } else if (!gameState.selectedFaceDown) {
    gameState.selectedFaceDown = { card, index };
  }

  updateSelectionDisplay();
  renderHand();
}

function updateSelectionDisplay() {
  const faceUpSlot = document.getElementById('faceUpSlot');
  const faceDownSlot = document.getElementById('faceDownSlot');
  const faceUpGroup = document.getElementById('faceUpGroup');
  const faceDownGroup = document.getElementById('faceDownGroup');
  const submitBtn = document.getElementById('submitBtn');

  // Update face-up slot
  if (gameState.selectedFaceUp) {
    faceUpSlot.innerHTML = '';
    faceUpSlot.classList.remove('empty');
    const cardEl = createCardElement(gameState.selectedFaceUp.card, -1);
    cardEl.style.cursor = 'default';
    faceUpSlot.appendChild(cardEl);

    // Show group selection if it's a group card
    if (gameState.selectedFaceUp.card.isGroupCard) {
      faceUpGroup.classList.remove('hidden');
      populateGroupCategories('faceUpCategory', gameState.selectedFaceUp.card.category);
    } else {
      faceUpGroup.classList.add('hidden');
    }
  } else {
    faceUpSlot.innerHTML = '<span>Select a card</span>';
    faceUpSlot.classList.add('empty');
    faceUpGroup.classList.add('hidden');
  }

  // Update face-down slot
  if (gameState.selectedFaceDown) {
    faceDownSlot.innerHTML = '';
    faceDownSlot.classList.remove('empty');
    const cardEl = createCardElement(gameState.selectedFaceDown.card, -1);
    cardEl.style.cursor = 'default';
    faceDownSlot.appendChild(cardEl);

    // Show group selection if it's a group card
    if (gameState.selectedFaceDown.card.isGroupCard) {
      faceDownGroup.classList.remove('hidden');
      populateGroupCategories('faceDownCategory', gameState.selectedFaceDown.card.category);
    } else {
      faceDownGroup.classList.add('hidden');
    }
  } else {
    faceDownSlot.innerHTML = '<span>Select a card</span>';
    faceDownSlot.classList.add('empty');
    faceDownGroup.classList.add('hidden');
  }

  // Enable submit button if both cards are selected
  submitBtn.disabled = !(gameState.selectedFaceUp && gameState.selectedFaceDown);
}

function populateGroupCategories(selectId, groupName) {
  const select = document.getElementById(selectId);
  select.innerHTML = '';

  const categoriesInGroup = gameState.activeCategories.filter(cat => cat.group === groupName);
  categoriesInGroup.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.name;
    option.textContent = cat.name;
    select.appendChild(option);
  });
}

function clearSelection() {
  gameState.selectedFaceUp = null;
  gameState.selectedFaceDown = null;
  updateSelectionDisplay();
  renderHand();
}

function submitCards() {
  if (!gameState.selectedFaceUp || !gameState.selectedFaceDown) {
    alert('Please select both cards');
    return;
  }

  const groupSelections = {};

  // Get group selections if applicable
  if (gameState.selectedFaceUp.card.isGroupCard) {
    groupSelections.faceUp = document.getElementById('faceUpCategory').value;
  }
  if (gameState.selectedFaceDown.card.isGroupCard) {
    groupSelections.faceDown = document.getElementById('faceDownCategory').value;
  }

  // Send to server
  socket.emit('playCards', {
    gameId: gameState.gameId,
    faceUpCard: gameState.selectedFaceUp.card,
    faceDownCard: gameState.selectedFaceDown.card,
    groupSelections
  });

  // Hide selection area and show waiting
  document.getElementById('selectionArea').classList.add('hidden');
  document.getElementById('waitingArea').classList.remove('hidden');

  // Clear selections
  clearSelection();
}

function renderCategories() {
  const categoriesEl = document.getElementById('categories');
  categoriesEl.innerHTML = '';

  gameState.activeCategories.forEach(cat => {
    const catEl = document.createElement('div');
    catEl.className = 'category-card';

    const groupClass = 'group-' + cat.group.toLowerCase();
    catEl.classList.add(groupClass);

    const nameEl = document.createElement('div');
    nameEl.className = 'category-name';
    const emoji = CATEGORY_EMOJIS[cat.name] || '';
    nameEl.textContent = emoji ? `${emoji} ${cat.name}` : cat.name;

    const groupEl = document.createElement('div');
    groupEl.className = 'category-group';
    groupEl.textContent = cat.group;

    const prestigeEl = document.createElement('div');
    prestigeEl.className = 'category-prestige';
    const prestige = gameState.categoryPrestige[cat.name] || 0;
    prestigeEl.textContent = `Prestige: ${prestige}`;

    catEl.appendChild(nameEl);
    catEl.appendChild(groupEl);
    catEl.appendChild(prestigeEl);

    categoriesEl.appendChild(catEl);
  });
}

function renderPlayedCards() {
  const playedEl = document.getElementById('playedCards');
  playedEl.innerHTML = '';

  if (gameState.playedCards.length === 0) {
    playedEl.innerHTML = '<p class="empty-msg">No cards played yet</p>';
    return;
  }

  gameState.playedCards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.style.cursor = 'default';

    const categoryEl = document.createElement('div');
    categoryEl.className = 'card-category';
    const emoji = CATEGORY_EMOJIS[card.category] || '';
    categoryEl.textContent = emoji ? `${emoji} ${card.category}` : card.category;

    const valueEl = document.createElement('div');
    valueEl.className = 'card-value';
    valueEl.textContent = card.value;

    cardEl.appendChild(categoryEl);
    cardEl.appendChild(valueEl);

    playedEl.appendChild(cardEl);
  });
}

function updateStandings(standings) {
  const standingsEl = document.getElementById('standings');
  standingsEl.innerHTML = '';

  standings.forEach((standing, index) => {
    const item = document.createElement('div');
    item.className = 'standing-item';

    if (standing.name === gameState.playerName) {
      item.classList.add('current-player');
    }

    const rank = document.createElement('span');
    rank.className = 'standing-rank';
    rank.textContent = `#${index + 1}`;

    const name = document.createElement('span');
    name.className = 'standing-name';
    name.textContent = standing.name;

    const vp = document.createElement('span');
    vp.className = 'standing-vp';
    vp.textContent = `${standing.totalVP} VP`;

    item.appendChild(rank);
    item.appendChild(name);
    item.appendChild(vp);

    standingsEl.appendChild(item);
  });
}

// ===== SOCKET LISTENERS =====
function setupSocketListeners() {
  socket.on('playerJoined', (data) => {
    const playerList = document.getElementById('playerList');
    const playersUl = document.getElementById('players');
    const startBtn = document.getElementById('startBtn');
    const waitingMsg = document.getElementById('waitingMsg');

    playerList.classList.remove('hidden');
    playersUl.innerHTML = '';

    data.players.forEach(player => {
      const li = document.createElement('li');
      li.textContent = player.name;
      if (player.isAI) {
        li.textContent += ' 🤖';
        li.style.opacity = '0.7';
      }
      if (player.name === gameState.playerName) {
        li.style.fontWeight = 'bold';
        li.textContent += ' (You)';
        gameState.playerId = player.id;
      }
      playersUl.appendChild(li);
    });

    if (data.canStart) {
      startBtn.classList.remove('hidden');
      waitingMsg.classList.add('hidden');
    }
  });

  socket.on('playerLeft', (data) => {
    const playersUl = document.getElementById('players');
    const startBtn = document.getElementById('startBtn');
    const waitingMsg = document.getElementById('waitingMsg');

    playersUl.innerHTML = '';
    data.players.forEach(player => {
      const li = document.createElement('li');
      li.textContent = player.name;
      if (player.name === gameState.playerName) {
        li.style.fontWeight = 'bold';
        li.textContent += ' (You)';
      }
      playersUl.appendChild(li);
    });

    if (!data.canStart) {
      startBtn.classList.add('hidden');
      waitingMsg.classList.remove('hidden');
    }
  });

  socket.on('gameStarted', (data) => {
    gameState.activeCategories = data.activeCategories;
    gameState.categoryPrestige = data.categoryPrestige;

    showScreen('game');
    renderCategories();
  });

  socket.on('roundStarted', (data) => {
    gameState.currentFair = data.fair;
    gameState.currentRound = data.round;
    gameState.hand = data.hand;
    gameState.playedCards = data.playedCards;
    gameState.activeCategories = data.activeCategories;
    gameState.categoryPrestige = data.categoryPrestige;
    gameState.deckSize = data.deckSize;

    // Update UI
    document.getElementById('fairNumber').textContent = data.fair;
    document.getElementById('roundNumber').textContent = data.round;
    document.getElementById('deckSize').textContent = data.deckSize;
    document.getElementById('playerNameDisplay').textContent = gameState.playerName;

    renderHand();
    renderCategories();
    renderPlayedCards();

    // Show selection area
    document.getElementById('selectionArea').classList.remove('hidden');
    document.getElementById('waitingArea').classList.add('hidden');
  });

  socket.on('waitingForPlayers', (data) => {
    document.getElementById('waitingCount').textContent = data.submitted;
    document.getElementById('totalPlayers').textContent = data.total;
  });

  socket.on('fairEnded', (data) => {
    gameState.currentFair = data.fair;

    // Update player stats if in standings
    const playerStanding = data.standings.find(s => s.name === gameState.playerName);
    if (playerStanding) {
      gameState.playerVP = playerStanding.totalVP;
      gameState.playerRibbons = playerStanding.ribbons;
      document.getElementById('playerVP').textContent = gameState.playerVP;
      document.getElementById('playerRibbons').textContent = gameState.playerRibbons;
    }

    showFairResults(data);
    updateStandings(data.standings);
  });

  socket.on('nextFairReady', (data) => {
    gameState.activeCategories = data.activeCategories;
    gameState.categoryPrestige = data.categoryPrestige;

    showScreen('game');
    renderCategories();
  });

  socket.on('gameEnded', (data) => {
    showGameOver(data);
  });

  socket.on('error', (data) => {
    alert('Error: ' + data.message);
  });
}

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
}

function showFairResults(data) {
  showScreen('results');

  document.getElementById('resultsTitle').textContent = `⚔️ Faire ${data.fair} Results`;

  // Category results
  const categoryResults = document.getElementById('categoryResults');
  categoryResults.innerHTML = '';
  for (const [categoryName, categoryData] of Object.entries(data.results.categories)) {
    const div = document.createElement('div');
    div.className = 'result-item';

    let html = `<strong>${categoryName}</strong> (Prestige: ${categoryData.prestige})<br>`;
    if (categoryData.winners.length > 0) {
      categoryData.winners.forEach(winner => {
        html += `${winner.ribbonType.toUpperCase()}: ${winner.player.name} (${winner.total} pts) - ${winner.vp} VP<br>`;
      });
    } else {
      html += 'No winners<br>';
    }

    div.innerHTML = html;
    categoryResults.appendChild(div);
  }

  // Group results
  const groupResults = document.getElementById('groupResults');
  groupResults.innerHTML = '';
  for (const [groupName, groupData] of Object.entries(data.results.groups)) {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `<strong>${groupName}</strong>: ${groupData.winner.name} (${groupData.vp} VP)`;
    groupResults.appendChild(div);
  }

  // Prestige updates
  const prestigeUpdates = document.getElementById('prestigeUpdates');
  prestigeUpdates.innerHTML = '';
  data.results.prestigeUpdates.forEach(catName => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.textContent = `${catName}: +1 Prestige`;
    prestigeUpdates.appendChild(div);
  });

  // Standings
  const standingsResults = document.getElementById('standingsResults');
  standingsResults.innerHTML = '';
  data.standings.forEach((standing, index) => {
    const item = document.createElement('div');
    item.className = 'standing-item';
    if (standing.name === gameState.playerName) {
      item.classList.add('current-player');
    }

    const rank = document.createElement('span');
    rank.className = 'standing-rank';
    rank.textContent = `#${index + 1}`;

    const name = document.createElement('span');
    name.className = 'standing-name';
    name.textContent = standing.name;

    const vp = document.createElement('span');
    vp.className = 'standing-vp';
    vp.textContent = `${standing.totalVP} VP`;

    item.appendChild(rank);
    item.appendChild(name);
    item.appendChild(vp);

    standingsResults.appendChild(item);
  });
}

function showGameOver(data) {
  showScreen('gameOver');

  document.getElementById('winnerName').textContent = data.winner.name;
  document.getElementById('winnerVP').textContent = data.winner.totalVP;

  const finalStandings = document.getElementById('finalStandings');
  finalStandings.innerHTML = '';

  data.standings.forEach((standing, index) => {
    const item = document.createElement('div');
    item.className = 'standing-item';
    if (standing.name === gameState.playerName) {
      item.classList.add('current-player');
    }

    const rank = document.createElement('span');
    rank.className = 'standing-rank';
    rank.textContent = `#${index + 1}`;

    const name = document.createElement('span');
    name.className = 'standing-name';
    name.textContent = standing.name;

    const vp = document.createElement('span');
    vp.className = 'standing-vp';
    vp.textContent = `${standing.totalVP} VP (${standing.ribbons.length} ribbons)`;

    item.appendChild(rank);
    item.appendChild(name);
    item.appendChild(vp);

    finalStandings.appendChild(item);
  });
}
