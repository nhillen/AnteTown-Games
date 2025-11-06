const { io } = require('socket.io-client');

// Quick test to check lobby state debugging
class LobbyDebugTest {
  constructor() {
    this.serverUrl = 'http://vps-0b87e710.tail751d97.ts.net:3001';
    this.client = null;
  }

  log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [LobbyTest] ${message}`);
  }

  async runTest() {
    return new Promise((resolve, reject) => {
      this.log('Starting lobby debug test...');
      
      this.client = io(this.serverUrl, { autoConnect: false });
      
      this.client.on('connect', () => {
        this.log('Connected to server');
        this.client.emit('join', { name: 'LobbyTester', bankroll: 5000 });
      });

      this.client.on('joined', (data) => {
        this.log(`Joined as ${data.player?.name} with bankroll ${data.player?.bankroll}`);
        // Sit down with smaller amount that should work
        setTimeout(() => {
          this.log('Attempting to sit down with $25 buy-in...');
          this.client.emit('sit_down', { seatIndex: 0, buyInAmount: 25 });
        }, 1000);
      });

      this.client.on('lobby_state', (state) => {
        this.log(`Lobby state received with ${state.players.length} players`);
        state.players.forEach(p => {
          this.log(`  - ${p.name}: ${p.bankroll} bankroll, ID: ${p.id}`);
        });
      });

      this.client.on('table_state', (state) => {
        this.log('Table state updated');
        // Stand up after sitting
        setTimeout(() => {
          this.log('Standing up...');
          this.client.emit('stand_up');
        }, 2000);
      });

      this.client.on('disconnect', () => {
        this.log('Disconnected');
        resolve();
      });

      // Connect and run test for 10 seconds
      this.client.connect();
      
      setTimeout(() => {
        this.log('Test timeout - disconnecting');
        if (this.client) this.client.disconnect();
        resolve();
      }, 10000);
    });
  }
}

// Run the test
async function main() {
  console.log('🎯 Starting Lobby Debug Test');
  const test = new LobbyDebugTest();
  await test.runTest();
  console.log('✅ Test completed');
  process.exit(0);
}

main().catch(console.error);