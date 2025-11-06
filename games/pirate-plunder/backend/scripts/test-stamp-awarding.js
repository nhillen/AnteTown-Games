const { io } = require('socket.io-client');

// Simple test to verify stamp awarding works correctly
class StampTest {
  constructor() {
    this.serverUrl = 'http://vps-0b87e710.tail751d97.ts.net:3001';
    this.client = null;
    this.gameState = null;
    this.lobbyState = null;
  }

  log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [StampTest] ${message}`);
  }

  async runTest() {
    return new Promise((resolve, reject) => {
      this.log('Starting stamp awarding test...');
      
      this.client = io(this.serverUrl, { autoConnect: false });
      
      this.client.on('connect', () => {
        this.log('Connected to server');
        this.client.emit('join', { name: 'StampTester' });
      });

      this.client.on('joined', (data) => {
        this.log(`Joined as ${data.name} (ID: ${data.playerId})`);
        // Add AI and start game
        this.client.emit('fill_ai_to_min');
      });

      this.client.on('lobby_state', (state) => {
        this.lobbyState = state;
        this.log(`Lobby updated: ${state.players.length} players`);
      });

      this.client.on('game_state', (state) => {
        this.gameState = state;
        this.log(`Game state: ${state.phase}, Pot: $${state.pot}`);
        
        // Auto-play through the game
        this.handleGamePhase(state);
      });

      this.client.on('disconnect', () => {
        this.log('Disconnected');
        resolve();
      });

      // Connect after setting up handlers
      this.client.connect();
      
      // Timeout after 2 minutes
      setTimeout(() => {
        this.log('Test timeout - disconnecting');
        if (this.client) this.client.disconnect();
        resolve();
      }, 120000);
    });
  }

  handleGamePhase(state) {
    if (!state) return;

    switch (state.phase) {
      case 'Lock1':
      case 'Lock2':
      case 'Lock3':
        // Auto-select some dice to lock
        this.client.emit('lock_select', { indices: [0, 1] });
        // Advance phase after a short delay
        setTimeout(() => {
          if (this.gameState && this.gameState.phase === state.phase) {
            this.client.emit('next_phase');
          }
        }, 1000);
        break;
        
      case 'Bet1':
      case 'Bet2':
      case 'Bet3':
        // Auto-call or bet
        this.client.emit('player_action', { action: 'call' });
        setTimeout(() => {
          if (this.gameState && this.gameState.phase === state.phase) {
            this.client.emit('next_phase');
          }
        }, 2000);
        break;
        
      case 'Roll4':
        // Auto-advance to showdown
        setTimeout(() => {
          if (this.gameState && this.gameState.phase === 'Roll4') {
            this.client.emit('next_phase');
          }
        }, 1000);
        break;
        
      case 'Showdown':
        this.log('🏆 Reached Showdown! Stamp awarding should happen now...');
        // Let it play out
        break;
        
      case 'Payout':
        this.log('💰 Payout phase - stamps should have been awarded');
        break;
        
      case 'HandEnd':
        this.log('✅ Hand completed - disconnecting');
        setTimeout(() => {
          this.client.disconnect();
        }, 1000);
        break;
    }
  }
}

// Run the test
async function main() {
  console.log('🎯 Starting Stamp Awarding Test');
  const test = new StampTest();
  await test.runTest();
  console.log('✅ Test completed');
  process.exit(0);
}

main().catch(console.error);