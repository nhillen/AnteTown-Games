// Main game logic

import {
  CATEGORIES,
  GROUPS,
  getAllCategoryKeys,
  createDeck,
  shuffleDeck,
  getCategoriesInGroup
} from './card.js';
import { Player } from './player.js';
import { scoreFair, updatePrestige, findCategoryToRetire } from './scorer.js';

export class Game {
  constructor(playerNames) {
    this.players = playerNames.map((name, i) => new Player(name, i));
    this.fairNumber = 0;
    this.roundNumber = 0;
    this.deck = [];
    this.activeCategories = []; // Array of category objects
    this.inactiveCategories = []; // Array of category keys not in play
    this.categoryPrestige = {}; // Map of category name to prestige level
    this.gameLog = [];
  }

  log(message) {
    this.gameLog.push(message);
    console.log(message);
  }

  // Setup the first Fair
  setupFirstFair() {
    this.log('\n=== SETTING UP FIRST FAIR ===');

    // Determine number of active categories (numPlayers + 1)
    const numActiveCategories = this.players.length + 1;

    // Randomly select active categories
    const allCategoryKeys = getAllCategoryKeys();
    const shuffledKeys = [...allCategoryKeys].sort(() => Math.random() - 0.5);
    const activeCategoryKeys = shuffledKeys.slice(0, numActiveCategories);
    this.inactiveCategories = shuffledKeys.slice(numActiveCategories);

    this.activeCategories = activeCategoryKeys.map(key => CATEGORIES[key]);

    this.log(`Active Categories (${this.activeCategories.length}):`);
    for (const cat of this.activeCategories) {
      this.categoryPrestige[cat.name] = 0; // Start with 0 prestige
      this.log(`  - ${cat.name} (${cat.group}) [Prestige: 0]`);
    }

    // Create and shuffle deck
    this.deck = shuffleDeck(createDeck(activeCategoryKeys));
    this.log(`Deck created with ${this.deck.length} cards`);

    // Each player gets 3 face-down cards (for Fair 1 Rounds 1, 2, 3)
    this.log('\nInitial face-down cards (for Fair 1):');
    for (const player of this.players) {
      for (let i = 0; i < 3; i++) {
        if (this.deck.length > 0) {
          const card = this.deck.pop();
          // Group cards will have their category selected by the player before flipping
          // Tag as initial cards (Fair 0) for rounds 1, 2, 3
          card.playedFaceDownAtFair = 0;
          card.playedFaceDownAtRound = i + 1;
          player.faceDownCards.push(card);
        }
      }
      this.log(`  ${player.name}: ${player.faceDownCards.length} cards`);
    }

    this.fairNumber = 1;
  }

  // Play a single round
  playRound() {
    this.roundNumber++;
    this.log(`\n--- Round ${this.roundNumber} ---`);

    // Step 1: Flip face-down card for this round
    // Fair 1: Flip initial cards (Fair 0)
    // Fair 2+: Flip cards from previous fair
    const fairToFlipFrom = this.fairNumber === 1 ? 0 : this.fairNumber - 1;
    for (const player of this.players) {
      const cardToFlip = player.faceDownCards.find(
        card => card.playedFaceDownAtFair === fairToFlipFrom &&
               card.playedFaceDownAtRound === this.roundNumber
      );
      if (cardToFlip) {
        // Remove from faceDownCards and add to hand
        const index = player.faceDownCards.indexOf(cardToFlip);
        player.faceDownCards.splice(index, 1);
        player.addToHand(cardToFlip);
        if (fairToFlipFrom === 0) {
          this.log(`${player.name} flips initial face-down card #${this.roundNumber}`);
        } else {
          this.log(`${player.name} flips face-down card from Fair ${fairToFlipFrom} Round ${this.roundNumber}`);
        }
      }
    }

    // Step 2: Each player draws 3 cards (unless Fair 3)
    if (this.fairNumber < 3) {
      for (const player of this.players) {
        for (let i = 0; i < 3; i++) {
          if (this.deck.length > 0) {
            player.addToHand(this.deck.pop());
          }
        }
        this.log(`${player.name} draws 3 cards (hand: ${player.hand.length})`);
      }
    } else {
      this.log(`Fair 3 - no drawing, only playing face-down cards from Fair 2`);
    }

    // Step 3: Each player plays 1 face-up and (in Fairs 1-2) 1 face-down
    // For prototype, we'll do random selection
    for (const player of this.players) {
      if (player.hand.length >= 1) {
        // Play face-up
        const faceUpCard = player.hand[Math.floor(Math.random() * player.hand.length)];
        // Handle group cards
        if (faceUpCard.isGroupCard) {
          const validCategories = this.activeCategories.filter(c => c.group === faceUpCard.category);
          if (validCategories.length > 0) {
            faceUpCard.selectedCategory = validCategories[Math.floor(Math.random() * validCategories.length)].name;
          }
        }
        player.playCardFaceUp(faceUpCard);
        this.log(`${player.name} plays ${faceUpCard.getDisplayName()} (${faceUpCard.value}) face-up`);

        // Play face-down only in Fairs 1 and 2
        if (this.fairNumber < 3 && player.hand.length > 0) {
          const faceDownCard = player.hand[Math.floor(Math.random() * player.hand.length)];
          // Handle group cards
          if (faceDownCard.isGroupCard) {
            const validCategories = this.activeCategories.filter(c => c.group === faceDownCard.category);
            if (validCategories.length > 0) {
              faceDownCard.selectedCategory = validCategories[Math.floor(Math.random() * validCategories.length)].name;
            }
          }
          player.playCardFaceDown(faceDownCard);
          this.log(`${player.name} plays 1 card face-down (for Fair ${this.fairNumber + 1} Round ${this.roundNumber})`);
        }
      }
    }
  }

  // Play a complete Fair (3 rounds)
  playFair() {
    this.log(`\n========================================`);
    this.log(`       FAIR ${this.fairNumber}`);
    this.log(`========================================`);

    this.roundNumber = 0;

    // Play 3 rounds
    for (let i = 0; i < 3; i++) {
      this.playRound();
    }

    // Score the Fair
    this.log('\n=== SCORING FAIR ===');
    const results = scoreFair(this.players, this.activeCategories, this.categoryPrestige);

    // Display category results
    this.log('\nCategory Results:');
    for (const [categoryName, data] of Object.entries(results.categories)) {
      this.log(`\n${categoryName} (Prestige: ${data.prestige}, Total Points: ${data.totalPoints}):`);
      if (data.winners.length > 0) {
        for (const winner of data.winners) {
          this.log(`  ${winner.ribbonType.toUpperCase()}: ${winner.player.name} (${winner.total} pts) - ${winner.vp} VP`);
        }
      } else {
        this.log('  No winners');
      }
    }

    // Display group results
    this.log('\nGroup Winners:');
    for (const [groupName, data] of Object.entries(results.groups)) {
      this.log(`  ${groupName}: ${data.winner.name} (${data.vp} VP)`);
    }

    // Update prestige
    const topCategories = updatePrestige(this.activeCategories, this.categoryPrestige, results);
    this.log('\nPrestige Increased:');
    for (const catName of topCategories) {
      this.log(`  ${catName}: +1 (now ${this.categoryPrestige[catName]})`);
    }

    // Display standings
    this.displayStandings();

    return results;
  }

  // Prepare for next Fair
  prepareNextFair() {
    this.log('\n=== PREPARING NEXT FAIR ===');

    // Check if we need to retire a category (if < 10 players)
    if (this.players.length < 10 && this.inactiveCategories.length > 0) {
      // Score current fair to determine which category to retire
      const results = scoreFair(this.players, this.activeCategories, this.categoryPrestige);
      const categoryToRetire = findCategoryToRetire(this.activeCategories, this.categoryPrestige, results);

      if (categoryToRetire) {
        this.log(`Retiring category: ${categoryToRetire.name}`);

        // Find the key for this category
        const retiredKey = Object.keys(CATEGORIES).find(key => CATEGORIES[key].name === categoryToRetire.name);

        // Remove from active and add to inactive
        this.activeCategories = this.activeCategories.filter(cat => cat.name !== categoryToRetire.name);
        this.inactiveCategories.push(retiredKey);

        // Add a new category
        if (this.inactiveCategories.length > 1) {
          const newCategoryKey = this.inactiveCategories.shift();
          const newCategory = CATEGORIES[newCategoryKey];
          this.activeCategories.push(newCategory);
          this.categoryPrestige[newCategory.name] = 0; // Start with 0 prestige
          this.log(`Adding new category: ${newCategory.name} (${newCategory.group})`);
        }
      }
    }

    // Clear players for next Fair
    for (const player of this.players) {
      player.clearForNextFair();
    }

    // Create new deck (excluding face-down cards)
    const activeCategoryKeys = this.activeCategories.map(cat =>
      Object.keys(CATEGORIES).find(key => CATEGORIES[key].name === cat.name)
    );
    this.deck = shuffleDeck(createDeck(activeCategoryKeys));

    this.log(`New deck created with ${this.deck.length} cards`);
    this.log('\nActive categories for next Fair:');
    for (const cat of this.activeCategories) {
      this.log(`  - ${cat.name} (${cat.group}) [Prestige: ${this.categoryPrestige[cat.name] || 0}]`);
    }

    this.fairNumber++;
  }

  displayStandings() {
    this.log('\n=== CURRENT STANDINGS ===');
    const sortedPlayers = [...this.players].sort((a, b) => b.totalVP - a.totalVP);
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      this.log(`${i + 1}. ${player.name}: ${player.totalVP} VP (${player.ribbons.length} ribbons)`);
    }
  }

  getWinner() {
    const sortedPlayers = [...this.players].sort((a, b) => b.totalVP - a.totalVP);
    return sortedPlayers[0];
  }
}
