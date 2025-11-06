const { io } = require('socket.io-client');

// Automated Socket.io client for testing game flows
class GameFlowTester {
  constructor() {
    this.clients = [];
    this.serverUrl = 'http://vps-0b87e710.tail751d97.ts.net:3001';
    this.gameState = null;
    this.lobbyState = null;
    this.testResults = [];
  }

  log(message, clientId = null) {
    const timestamp = new Date().toISOString();
    const prefix = clientId ? `[Client ${clientId}]` : '[Tester]';
    const logMessage = `${timestamp} ${prefix} ${message}`;
    console.log(logMessage);
    this.testResults.push(logMessage);
  }

  async createClient(name, index) {
    return new Promise((resolve, reject) => {
      const client = io(this.serverUrl, { autoConnect: false });
      client.clientIndex = index;
      client.clientName = name;

      client.on('connect', () => {
        this.log(`Connected as ${name}`, index);
        client.emit('join', { name });
      });

      client.on('joined', (payload) => {
        this.log(`Joined lobby as ${payload.player.name} (ID: ${payload.player.id})`, index);
        resolve(client);
      });

      client.on('lobby_state', (state) => {
        this.lobbyState = state;
        this.log(`Lobby updated: ${state.players.length} players`, index);
      });

      client.on('game_state', (state) => {
        this.gameState = state;
        this.log(`Game state: ${state.phase}, Pot: $${state.pot}`, index);
      });

      client.on('connect_error', (error) => {
        this.log(`Connection error: ${error.message}`, index);
        reject(error);
      });

      client.on('disconnect', () => {
        this.log(`Disconnected`, index);
      });

      setTimeout(() => {
        client.connect();
      }, index * 100); // Stagger connections
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runGameFlowTest() {
    console.log('🎲 Starting Pirate Plunder Game Flow Test\\n');
    
    try {
      // 1. Create test clients
      this.log('Creating test clients...');
      const client1 = await this.createClient('TestPlayer1', 1);
      const client2 = await this.createClient('TestPlayer2', 2);
      this.clients.push(client1, client2);

      await this.sleep(1000);

      // 2. Add AI players
      this.log('Adding AI players to reach minimum...');
      client1.emit('fill_ai_to_min', { min: 4 });
      await this.sleep(2000);

      // 3. Wait for countdown and auto-start
      this.log('Waiting for game countdown...');
      await this.sleep(6000);

      // 4. Test dice locking during Lock phases
      await this.testDiceLocking(client1, client2);

      // 5. Test betting actions
      await this.testBettingActions(client1, client2);

      // 6. Advance through phases manually for testing
      await this.testPhaseAdvancement(client1);

      // 7. Generate test report
      this.generateReport();

    } catch (error) {
      this.log(`Test failed: ${error.message}`);
    } finally {
      // Cleanup
      this.clients.forEach(client => client.disconnect());
      process.exit(0);
    }
  }

  async testDiceLocking(client1, client2) {
    this.log('Testing dice locking mechanics...');
    
    // Wait for a lock phase
    while (!this.gameState || !this.gameState.phase.includes('Lock')) {
      await this.sleep(500);
    }
    
    this.log(`Lock phase detected: ${this.gameState.phase}`);
    
    // Try to lock dice
    client1.emit('lock_select', { index: 0 });
    client1.emit('lock_select', { index: 1 });
    client2.emit('lock_select', { index: 2 });
    
    await this.sleep(1000);
    this.log('Dice locking commands sent');
  }

  async testBettingActions(client1, client2) {
    this.log('Testing betting actions...');
    
    // Wait for a betting phase
    while (!this.gameState || !this.gameState.phase.includes('Bet')) {
      await this.sleep(500);
    }
    
    this.log(`Betting phase detected: ${this.gameState.phase}`);
    
    // Test different betting actions
    client1.emit('player_action', { action: 'bet', amount: 5 });
    await this.sleep(500);
    client2.emit('player_action', { action: 'call' });
    
    await this.sleep(1000);
    this.log('Betting actions sent');
  }

  async testPhaseAdvancement(client) {
    this.log('Testing manual phase advancement...');
    
    const initialPhase = this.gameState?.phase;
    client.emit('next_phase');
    
    await this.sleep(1000);
    
    if (this.gameState?.phase !== initialPhase) {
      this.log(`Phase advanced from ${initialPhase} to ${this.gameState.phase}`);
    } else {
      this.log('Phase did not advance (may be expected behavior)');
    }
  }

  generateReport() {
    console.log('\\n📊 Test Report:');
    console.log('================');
    
    if (this.lobbyState) {
      console.log(`Final lobby state: ${this.lobbyState.players.length} players`);
      this.lobbyState.players.forEach(p => {
        console.log(`  - ${p.name} (${p.isAI ? 'AI' : 'Human'}): $${p.bankroll}`);
      });
    }
    
    if (this.gameState) {
      console.log(`Final game state: ${this.gameState.phase}`);
      console.log(`Pot: $${this.gameState.pot}, Current bet: $${this.gameState.currentBet}`);
      
      if (this.gameState.seats) {
        console.log('Seats:');
        this.gameState.seats.forEach(seat => {
          const diceStr = seat.dice.map(d => `${d.value}${d.locked ? '*' : ''}`).join(' ');
          console.log(`  - ${seat.name}: [${diceStr}] $${seat.bankroll} ${seat.hasFolded ? '(folded)' : ''}`);
        });
      }
    }
    
    console.log(`\\nTotal log entries: ${this.testResults.length}`);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  const tester = new GameFlowTester();
  
  // Check if server is running
  const testSocket = io('http://vps-0b87e710.tail751d97.ts.net:3001', { autoConnect: false, timeout: 2000 });
  testSocket.on('connect', () => {
    testSocket.disconnect();
    tester.runGameFlowTest();
  });
  
  testSocket.on('connect_error', () => {
    console.log('❌ Server not running on http://vps-0b87e710.tail751d97.ts.net:3001');
    console.log('Please start the backend server first: npm run dev --workspace @pirate/game-pirate-plunder-backend');
    process.exit(1);
  });
  
  testSocket.connect();
}
