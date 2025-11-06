const { io } = require('socket.io-client');

async function testUIFlow() {
  console.log('🎲 Testing UI Flow Integration\n');
  
  const client = io('http://localhost:3001');
  
  return new Promise((resolve) => {
    let testResults = {
      connection: false,
      join: false,
      lobby: false,
      gameStart: false,
      locking: false,
      betting: false
    };
    
    client.on('connect', () => {
      console.log('✓ Connected to server');
      testResults.connection = true;
      
      // Test joining
      client.emit('join', { name: 'UITestPlayer' });
    });
    
    client.on('joined', (payload) => {
      console.log(`✓ Joined as ${payload.player.name}`);
      testResults.join = true;
      
      // Add AI players
      client.emit('fill_ai_to_min', { min: 4 });
    });
    
    client.on('lobby_state', (state) => {
      if (state.players.length >= 4 && !testResults.lobby) {
        console.log(`✓ Lobby has ${state.players.length} players`);
        testResults.lobby = true;
      }
    });
    
    client.on('game_state', (state) => {
      console.log(`  Game phase: ${state.phase}`);
      
      // Test different phases
      if (state.phase === 'PreHand' && !testResults.gameStart) {
        console.log('✓ Game countdown started');
        testResults.gameStart = true;
      }
      
      if (state.phase.includes('Lock') && !testResults.locking) {
        const mySeat = state.seats.find(s => s.playerId === client.id);
        if (mySeat && mySeat.lockAllowance > 0) {
          console.log('✓ Locking phase active, testing lock');
          client.emit('lock_select', { index: 0 });
          testResults.locking = true;
        }
      }
      
      if (state.phase.includes('Bet') && !testResults.betting) {
        console.log('✓ Betting phase active, testing bet');
        client.emit('player_action', { action: 'bet', amount: 5 });
        testResults.betting = true;
        
        // Complete test after betting
        setTimeout(() => {
          client.disconnect();
          
          console.log('\n📊 UI Integration Test Results:');
          console.log('================================');
          Object.entries(testResults).forEach(([key, value]) => {
            console.log(`${value ? '✅' : '❌'} ${key.charAt(0).toUpperCase() + key.slice(1)}`);
          });
          
          const allPassed = Object.values(testResults).every(v => v);
          if (allPassed) {
            console.log('\n✨ All UI integration tests passed!');
            resolve(0);
          } else {
            console.log('\n❌ Some tests failed');
            resolve(1);
          }
        }, 1000);
      }
    });
    
    client.on('connect_error', (error) => {
      console.log('❌ Connection failed:', error.message);
      console.log('Make sure backend is running on http://localhost:3001');
      resolve(1);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('\n⏰ Test timeout');
      client.disconnect();
      resolve(1);
    }, 30000);
  });
}

if (require.main === module) {
  testUIFlow().then(code => process.exit(code));
}