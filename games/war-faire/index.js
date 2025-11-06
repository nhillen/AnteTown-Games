// Game runner - runs a test game

import { Game } from './game.js';

function runTestGame(numFairs = 2) {
  console.log('🎪 WELCOME TO STATE FAIR 🎪');
  console.log('===========================\n');

  // Create a game with 4 players
  const playerNames = ['Alice', 'Bob', 'Carol', 'Dave'];
  const game = new Game(playerNames);

  console.log(`Players: ${playerNames.join(', ')}\n`);

  // Setup first Fair
  game.setupFirstFair();

  // Play multiple Fairs
  for (let i = 0; i < numFairs; i++) {
    game.playFair();

    // Prepare next Fair if not the last one
    if (i < numFairs - 1) {
      game.prepareNextFair();
    }
  }

  // Final results
  console.log('\n========================================');
  console.log('         FINAL RESULTS');
  console.log('========================================\n');

  game.displayStandings();

  const winner = game.getWinner();
  console.log(`\n🏆 WINNER: ${winner.name} with ${winner.totalVP} Victory Points! 🏆\n`);

  // Display ribbon breakdown for winner
  console.log(`${winner.name}'s Ribbons:`);
  const ribbonsByCategory = {};
  for (const ribbon of winner.ribbons) {
    if (!ribbonsByCategory[ribbon.category]) {
      ribbonsByCategory[ribbon.category] = [];
    }
    ribbonsByCategory[ribbon.category].push(ribbon);
  }

  for (const [category, ribbons] of Object.entries(ribbonsByCategory)) {
    const ribbonStr = ribbons.map(r => `${r.type} (${r.vp}VP)`).join(', ');
    console.log(`  ${category}: ${ribbonStr}`);
  }

  return game;
}

// Run the game
if (import.meta.url === `file://${process.argv[1]}`) {
  const numFairs = process.argv[2] ? parseInt(process.argv[2]) : 2;
  runTestGame(numFairs);
}

export { runTestGame };
