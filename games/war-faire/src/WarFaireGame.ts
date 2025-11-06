import { GameBase, GameState, Seat, Player, WinnerResult, GameMetadata } from '@pirate/game-sdk';
import { Game } from '../game.js';
import { scoreFair, updatePrestige } from '../scorer.js';

export class WarFaireGame extends GameBase {
  gameType = 'warfaire';
  private warfaireInstance: Game | null = null;
  private pendingActions: Map<string, any> = new Map();
  private currentFair: number = 0;
  private currentRound: number = 0;
  private aiTurnTimer: NodeJS.Timeout | null = null;
  private groupSelectionTimer: NodeJS.Timeout | null = null;
  private gameEndTimer: NodeJS.Timeout | null = null;
  private roundSummaryTimer: NodeJS.Timeout | null = null;
  private isProcessingRound: boolean = false;
  private seatToPlayerIndex: Map<number, number> = new Map(); // Maps seat index to player index

  constructor(tableConfig: any) {
    super(tableConfig);
    this.tableConfig.maxSeats = 10; // WarFaire supports up to 10 players
    this.initializeGameState('Lobby'); // Initialize with lobby state
  }

  /**
   * Get game metadata for platform integration
   */
  getMetadata(): GameMetadata {
    return {
      emoji: '🎪',
      botNamePrefix: 'WarBot',
      defaultBuyIn: 0 // WarFaire doesn't use betting
    };
  }

  /**
   * Override sitPlayer to remove bankroll requirement for WarFaire
   * WarFaire doesn't use betting, so players can join with 0 bankroll
   */
  public sitPlayer(player: Player, seatIndex?: number, buyInAmount?: number): { success: boolean; error?: string; seatIndex?: number } {
    if (!this.gameState) {
      return { success: false, error: 'Game not initialized' };
    }

    // WarFaire doesn't require bankroll - players can join with 0
    const requiredBuyIn = 0;

    // Find empty seat
    let targetSeat = seatIndex;
    if (targetSeat === undefined) {
      targetSeat = this.gameState.seats.findIndex(s => s === null);
      if (targetSeat === -1) {
        return { success: false, error: 'No empty seats' };
      }
    }

    // Check if seat is empty
    if (this.gameState.seats[targetSeat] !== null) {
      return { success: false, error: 'Seat already taken' };
    }

    // Create seat
    const seat: Seat = {
      playerId: player.id,
      name: player.name,
      isAI: player.isAI,
      tableStack: requiredBuyIn,
      hasFolded: false,
      currentBet: 0,
      hasActed: false,
      totalContribution: 0,
      ...(player.cosmetics && { cosmetics: player.cosmetics }),
    };

    this.gameState.seats[targetSeat] = seat;

    // No bankroll deduction for WarFaire
    player.tableStack = requiredBuyIn;

    return { success: true, seatIndex: targetSeat };
  }

  startHand(): void {
    if (!this.gameState) return;

    console.log('🎪 Starting WarFaire game...');

    try {
      // Get player names from seated players (not connectedPlayers!)
      const seatedPlayers = this.gameState.seats.filter(s => s !== null);
      if (seatedPlayers.length < 2) {
        console.log('🎪 Not enough seated players to start');
        return;
      }

      const playerNames = seatedPlayers.map(s => s.name);
      console.log('🎪 Creating game instance with players:', playerNames);

      // Initialize WarFaire game instance
      this.warfaireInstance = new Game(playerNames);
      this.currentFair = 1;
      this.currentRound = 0;

      // Create mapping from seat index to player index
      this.seatToPlayerIndex.clear();
      let playerIndex = 0;
      this.gameState.seats.forEach((seat, seatIndex) => {
        if (seat !== null) {
          this.seatToPlayerIndex.set(seatIndex, playerIndex);
          // CRITICAL: Copy isAI flag from seat to player object
          const player = this.warfaireInstance!.players[playerIndex];
          if (player) {
            player.isAI = seat.isAI || false;
            console.log(`🎪 [SETUP] Player ${player.name} at index ${playerIndex}: isAI = ${player.isAI}`);
          }
          playerIndex++;
        }
      });
      console.log('🎪 Seat to player index mapping:', Array.from(this.seatToPlayerIndex.entries()));

      console.log('🎪 Setting up first fair...');
      // Setup first Fair
      this.warfaireInstance.setupFirstFair();
      console.log('🎪 First fair setup complete');

      // Debug log initial face-down cards
      for (const player of this.warfaireInstance.players) {
        console.log(`🎪 [SETUP] ${player.name} initial state:`, {
          faceDownCards: player.faceDownCards.length,
          hand: player.hand.length,
          playedCards: player.playedCards.length
        });
      }

    // Initialize WarFaire-specific fields on seats
    this.gameState.seats.forEach((seat, index) => {
      if (seat) {
        seat.hand = [];
        seat.playedCards = [];
        seat.ribbons = [];
        seat.totalVP = 0;
        seat.hasActed = false; // Reset hasActed for new game
      }
    });

      // Update game state with WarFaire-specific data
      this.gameState.phase = 'Waiting';
      (this.gameState as any).activeCategories = this.warfaireInstance.activeCategories;
      (this.gameState as any).categoryPrestige = this.warfaireInstance.categoryPrestige;
      (this.gameState as any).currentFair = this.currentFair;

      // Sync initial state (just the 3 initial face-down cards)
      this.syncWarFaireStateToSeats();

      // Broadcast the initial state (3 face-down cards, empty hand)
      console.log('🎪 [BROADCAST] Broadcasting initial state (3 face-down cards)...');
      this.broadcastGameState();

      // Start first round immediately - it will flip 1 face-down to hand, then draw 3
      console.log('🎪 Starting first round...');
      this.startRound();
    } catch (error) {
      console.error('🎪 ERROR starting WarFaire game:', error);
      this.gameState.phase = 'Lobby';
      this.broadcastGameState();
      throw error;
    }
  }

  private startRound(): void {
    if (!this.warfaireInstance || !this.gameState) return;

    try {
      // CRITICAL: Clear any existing timer at the START to prevent double-flipping
      if (this.groupSelectionTimer) {
        console.log(`🎪 [FIX] Clearing stale group selection timer at round start`);
        clearTimeout(this.groupSelectionTimer);
        this.groupSelectionTimer = null;
      }

      this.currentRound++;
      this.pendingActions.clear();

      console.log(`🎪 ========================================`);
      console.log(`🎪 START ROUND: Fair ${this.currentFair}, Round ${this.currentRound}`);
      console.log(`🎪 ========================================`);

      // Debug: Log all player states at start of round
      for (const player of this.warfaireInstance.players) {
        console.log(`🎪 [START] ${player.name}: hand=${player.hand.length}, faceDown=${player.faceDownCards.length}, played=${player.playedCards.length}`);
      }

    // Update all players with current fair/round for metadata tracking
    for (const player of this.warfaireInstance.players) {
      player.currentFair = this.currentFair;
      player.currentRound = this.currentRound;
    }

    // Check if any face-down cards to flip are group cards needing category selection
    const fairToFlipFrom = this.currentFair === 1 ? 0 : this.currentFair - 1;
    const cardsToFlip: Array<{ player: any; card: any }> = [];

    for (const player of this.warfaireInstance.players) {
      const cardToFlip = player.faceDownCards.find(
        (card: any) => card.playedFaceDownAtFair === fairToFlipFrom &&
                      card.playedFaceDownAtRound === this.currentRound
      );
      if (cardToFlip) {
        cardsToFlip.push({ player, card: cardToFlip });
      }
    }

    // Check if any are group cards
    const hasGroupCards = cardsToFlip.some(({ card }) => card.isGroupCard);

    if (hasGroupCards) {
      console.log(`🎪 ========== GROUP CARD SELECTION LOGIC ==========`);
      console.log(`🎪 Found ${cardsToFlip.length} cards to flip:`, cardsToFlip.map(({ player, card }) => ({
        player: player.name,
        isAI: player.isAI,
        category: card.category,
        value: card.value,
        isGroupCard: card.isGroupCard,
        selectedCategory: card.selectedCategory || 'NONE'
      })));

      // Auto-select for AI players BEFORE entering selection phase
      const aiGroupCards = cardsToFlip.filter(({ player, card }) => player.isAI && card.isGroupCard);
      console.log(`🎪 [AI] Auto-selecting for ${aiGroupCards.length} AI group cards...`);

      for (const { player, card } of cardsToFlip) {
        if (player.isAI && card.isGroupCard) {
          const validCategories = this.warfaireInstance.activeCategories.filter(
            (c: any) => c.group === card.category
          );
          console.log(`🎪 [AI] ${player.name} has ${card.category} group card. Valid categories:`, validCategories.map((c: any) => c.name));

          if (validCategories.length > 0) {
            card.selectedCategory = validCategories[
              Math.floor(Math.random() * validCategories.length)
            ].name;
            console.log(`🎪 [AI] ${player.name} auto-selected "${card.selectedCategory}" for ${card.category} group card`);
          } else {
            console.log(`🎪 [AI ERROR] ${player.name} has ${card.category} but no valid categories found!`);
          }
        }
      }
      console.log(`🎪 [AI] Auto-selection complete`);

      // Log allcards and their selection status
      console.log(`🎪 [CHECK] Card statuses:`, cardsToFlip.map(({ player, card }) => ({
        player: player.name,
        isAI: player.isAI,
        category: card.category,
        isGroup: card.isGroupCard,
        selected: card.selectedCategory || 'none'
      })));

      // Check if all selections are complete (all group cards have selectedCategory)
      // AI selections are already done above, so just check if all group cards have a selection
      const allSelected = cardsToFlip.every(({ card }) =>
        !card.isGroupCard || card.selectedCategory
      );

      console.log(`🎪 [CHECK] Selection status:`, {
        allSelected,
        totalCards: cardsToFlip.length,
        groupCards: cardsToFlip.filter(({ card }) => card.isGroupCard).length,
        aiGroupCards: cardsToFlip.filter(({ player, card }) => player.isAI && card.isGroupCard).length,
        humanGroupCards: cardsToFlip.filter(({ player, card }) => !player.isAI && card.isGroupCard).length,
        selectedGroupCards: cardsToFlip.filter(({ card }) => card.isGroupCard && card.selectedCategory).length,
        unselectedGroupCards: cardsToFlip.filter(({ card }) => card.isGroupCard && !card.selectedCategory).map(({ player, card }) => ({
          player: player.name,
          isAI: player.isAI,
          category: card.category
        }))
      });

      if (allSelected) {
        console.log(`🎪 ✅ ALL SELECTIONS COMPLETE - Proceeding immediately with flip (no GroupSelection phase)`);
        // Clear any existing timer to prevent double-flipping
        if (this.groupSelectionTimer) {
          console.log(`🎪 [FIX] Clearing existing group selection timer to prevent double flip`);
          clearTimeout(this.groupSelectionTimer);
          this.groupSelectionTimer = null;
        }
        // All selections made, proceed with flipping immediately without entering GroupSelection phase
        this.flipCardsAndContinue(cardsToFlip, this.currentFair, this.currentRound);
        return;
      }

      // Not all selections complete, enter group card selection phase and wait for humans
      console.log(`🎪 ⏳ NOT all selections complete - Entering GroupSelection phase`);
      this.gameState.phase = `Fair${this.currentFair}Round${this.currentRound}GroupSelection`;
      (this.gameState as any).cardsToFlip = cardsToFlip.map(({ player, card }) => {
        // Find the seat for this player to get the socket ID
        const playerIndex = this.warfaireInstance!.players.indexOf(player);
        let seatPlayerId = null;
        for (const [seatIdx, pIdx] of this.seatToPlayerIndex.entries()) {
          if (pIdx === playerIndex) {
            const seat = this.gameState!.seats[seatIdx];
            seatPlayerId = seat?.playerId;
            break;
          }
        }
        console.log(`🎪 [MAPPING] Player ${player.name} (array index ${playerIndex}) → seat playerId: ${seatPlayerId}`);

        return {
          playerId: seatPlayerId, // Use SEAT's playerId (socket ID), not player.id (array index)
          card: {
            category: card.category,
            value: card.value,
            isGroupCard: card.isGroupCard,
            selectedCategory: card.selectedCategory
          }
        };
      });
      this.syncWarFaireStateToSeats();
      this.broadcastGameState();

      // We'll wait for human players to submit their selections via handlePlayerAction
      const pendingHumans = cardsToFlip.filter(({ player, card }) =>
        !player.isAI && card.isGroupCard && !card.selectedCategory
      );
      console.log(`🎪 Waiting for ${pendingHumans.length} human player(s) to select categories for group cards`);
      if (pendingHumans.length > 0) {
        console.log(`🎪 Pending humans:`, pendingHumans.map(({ player, card }) => ({
          player: player.name,
          playerId: typeof player.id === 'string' ? player.id.slice(0, 8) : player.id,
          category: card.category,
          value: card.value
        })));
      }

      // Set a timer to auto-select for any remaining human players
      // Shorter timeout if no humans need to select (just showing AI selections)
      const timeoutMs = pendingHumans.length > 0 ? 15000 : 3000; // 3 sec for AI-only, 15 sec with humans
      console.log(`🎪 Setting group selection timeout: ${timeoutMs}ms (${pendingHumans.length} humans pending)`);

      if (this.groupSelectionTimer) {
        clearTimeout(this.groupSelectionTimer);
      }

      // Store timeout start time and duration for countdown timer
      (this.gameState as any).groupSelectionTimeoutStart = Date.now();
      (this.gameState as any).groupSelectionTimeoutDuration = timeoutMs;

      // Capture current fair/round for timer validation
      const timerFair = this.currentFair;
      const timerRound = this.currentRound;

      this.groupSelectionTimer = setTimeout(() => {
        console.log(`🎪 ========================================`);
        console.log(`🎪 [TIMEOUT] Group selection timer fired for Fair ${timerFair} Round ${timerRound}!`);
        console.log(`🎪 ========================================`);
        try {
          console.log(`🎪 [TIMEOUT] Auto-selecting for remaining players...`);
          // Auto-select for any remaining group cards that don't have a selection
          for (const { player, card } of cardsToFlip) {
            if (card.isGroupCard && !card.selectedCategory) {
              const validCategories = this.warfaireInstance!.activeCategories.filter(
                (c: any) => c.group === card.category
              );
              if (validCategories.length > 0) {
                card.selectedCategory = validCategories[
                  Math.floor(Math.random() * validCategories.length)
                ].name;
                console.log(`🎪 [TIMEOUT] Auto-selected ${card.selectedCategory} for ${player.name}'s group card`);
              }
            }
          }
          // Proceed with flipping (with fair/round validation)
          console.log(`🎪 [TIMEOUT] About to call flipCardsAndContinue with ${cardsToFlip.length} cards...`);
          this.flipCardsAndContinue(cardsToFlip, timerFair, timerRound);
          console.log(`🎪 [TIMEOUT] flipCardsAndContinue returned successfully`);
        } catch (error) {
          console.error(`🎪 [ERROR] !!!!! Group selection timeout callback FAILED !!!!!`);
          console.error(`🎪 [ERROR] Error:`, error);
          console.error(`🎪 [ERROR] Stack:`, error instanceof Error ? error.stack : 'No stack trace');
          console.error(`🎪 [ERROR] This is why the game got stuck!`);
          // Force transition to avoid being stuck
          try {
            console.log(`🎪 [ERROR] Attempting retry...`);
            this.flipCardsAndContinue(cardsToFlip, timerFair, timerRound);
          } catch (retryError) {
            console.error(`🎪 [ERROR] Retry also failed. Forcing manual phase transition:`, retryError);
            this.gameState!.phase = `Fair${this.currentFair}Round${this.currentRound}`;
            this.syncWarFaireStateToSeats();
            console.log(`🎪 [ERROR] Broadcasting forced state...`);
            this.broadcastGameState();
            console.log(`🎪 [ERROR] Forced state broadcast complete`);
          }
        }
      }, timeoutMs);

      return;
    }

    // No group cards, proceed with flipping
    // Clear any existing timer to prevent double-flipping
    if (this.groupSelectionTimer) {
      console.log(`🎪 [FIX] Clearing existing group selection timer (no group cards path)`);
      clearTimeout(this.groupSelectionTimer);
      this.groupSelectionTimer = null;
    }
    this.flipCardsAndContinue(cardsToFlip, this.currentFair, this.currentRound);
    } catch (error) {
      console.error(`🎪 ERROR in startRound (Fair ${this.currentFair}, Round ${this.currentRound}):`, error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  private flipCardsAndContinue(cardsToFlip: Array<{ player: any; card: any }>, expectedFair?: number, expectedRound?: number): void {
    console.log(`🎪 [FLIP] flipCardsAndContinue called for ${cardsToFlip.length} cards at ${Date.now()}`);
    console.log(`🎪 [FLIP] Expected Fair=${expectedFair || 'any'}, Round=${expectedRound || 'any'} | Current Fair=${this.currentFair}, Round=${this.currentRound}`);

    // CRITICAL: Reject flips from stale timers
    if (expectedFair !== undefined && expectedFair !== this.currentFair) {
      console.error(`🎪 [FLIP ERROR] Stale flip from Fair ${expectedFair} rejected (current Fair ${this.currentFair}) - IGNORING`);
      return;
    }
    if (expectedRound !== undefined && expectedRound !== this.currentRound) {
      console.error(`🎪 [FLIP ERROR] Stale flip from Round ${expectedRound} rejected (current Round ${this.currentRound}) - IGNORING`);
      return;
    }

    // CRITICAL: Prevent double-flipping by checking if already flipped this round
    if ((this as any).lastFlipTime && Date.now() - (this as any).lastFlipTime < 1000) {
      console.error(`🎪 [FLIP ERROR] Attempted double-flip! Last flip was ${Date.now() - (this as any).lastFlipTime}ms ago - IGNORING`);
      return;
    }
    (this as any).lastFlipTime = Date.now();

    if (!this.warfaireInstance || !this.gameState) {
      console.error(`🎪 [FLIP ERROR] Missing warfaireInstance or gameState`);
      return;
    }

    try {
      const fairToFlipFrom = this.currentFair === 1 ? 0 : this.currentFair - 1;

      console.log(`🎪 [FLIP] Starting to flip ${cardsToFlip.length} cards (Fair ${fairToFlipFrom} → Fair ${this.currentFair})...`);

    // Flip face-down cards → they become face-up played cards (NOT added to hand!)
    for (const { player, card } of cardsToFlip) {
      console.log(`🎪 [FLIP] ${player.name} BEFORE flip: hand=${player.hand.length}, faceDown=${player.faceDownCards.length}, played=${player.playedCards.length}`);
      console.log(`🎪 [FLIP] ${player.name} face-down cards BEFORE removal:`, player.faceDownCards.map((c: any) => `${c.category}${c.value}(F${c.playedFaceDownAtFair}R${c.playedFaceDownAtRound})`).join(', '));

      const index = player.faceDownCards.indexOf(card);
      console.log(`🎪 [FLIP] ${player.name}: removing card at index ${index} from faceDownCards (${player.faceDownCards.length} total)`);
      console.log(`🎪 [FLIP] ${player.name}: card to remove: ${card.category} ${card.value} (Fair ${card.playedFaceDownAtFair} Round ${card.playedFaceDownAtRound})`);

      player.faceDownCards.splice(index, 1);
      console.log(`🎪 [FLIP] ${player.name} face-down cards AFTER removal:`, player.faceDownCards.map((c: any) => `${c.category}${c.value}(F${c.playedFaceDownAtFair}R${c.playedFaceDownAtRound})`).join(', '));
      console.log(`🎪 [FLIP] ${player.name}: playing ${card.category} ${card.value} face-up to board`);

      // CRITICAL: playCardFaceUp() expects card to be in hand, but it's not!
      // Manually add to playedCards with metadata instead
      card.playedAtFair = player.currentFair;
      card.playedAtRound = player.currentRound;
      player.playedCards.push(card);

      console.log(`🎪 [FLIP] ${player.name} AFTER flip: hand=${player.hand.length}, faceDown=${player.faceDownCards.length}, played=${player.playedCards.length}`);
      if (fairToFlipFrom === 0) {
        console.log(`🎪 ${player.name} flips initial face-down card #${this.currentRound} to board: ${card.category} ${card.value}`);
      } else {
        console.log(`🎪 ${player.name} flips face-down card from Fair ${fairToFlipFrom} Round ${this.currentRound} to board: ${card.category} ${card.value}`);
      }
    }

    console.log(`🎪 [FLIP] All cards flipped`);

    // Deal cards to each player to fill hand to 3
    const targetHandSize = 3;
    console.log(`🎪 Drawing cards to fill hands to ${targetHandSize}...`);
    for (const player of this.warfaireInstance.players) {
      const cardsBefore = player.hand.length;
      const cardsToDraw = Math.max(0, targetHandSize - player.hand.length);
      console.log(`🎪 [DRAW] ${player.name} BEFORE draw: hand=${player.hand.length}, faceDown=${player.faceDownCards.length}, played=${player.playedCards.length} (will draw ${cardsToDraw})`);
      for (let i = 0; i < cardsToDraw; i++) {
        if (this.warfaireInstance.deck.length > 0) {
          player.addToHand(this.warfaireInstance.deck.pop());
        }
      }
      console.log(`🎪 [DRAW] ${player.name} AFTER draw: hand=${player.hand.length}, faceDown=${player.faceDownCards.length}, played=${player.playedCards.length} (drew ${player.hand.length - cardsBefore} cards)`);
    }

    // Update game state phase
    this.gameState.phase = `Fair${this.currentFair}Round${this.currentRound}`;
    console.log(`🎪 [FLIP] Phase updated to: ${this.gameState.phase}`);

    // Reset hasActed flags for new round
    console.log(`🎪 [FLIP] Resetting hasActed flags for all seats`);
    this.gameState.seats.forEach(s => { if (s) s.hasActed = false; });

    // Sync state to platform seats
    this.syncWarFaireStateToSeats();
    console.log(`🎪 [FLIP] State synced to seats`);

    // Broadcast state
    console.log(`🎪 [FLIP] ========== BROADCASTING GAME STATE ==========`);
    console.log(`🎪 [FLIP] Phase: ${this.gameState.phase}`);
    console.log(`🎪 [FLIP] Players in game: ${this.gameState.seats.filter(s => s).length}`);
    try {
      this.broadcastGameState();
      console.log(`🎪 [FLIP] ========== BROADCAST COMPLETE ==========`);
    } catch (broadcastError) {
      console.error(`🎪 [FLIP ERROR] !!!!! BROADCAST FAILED !!!!!`, broadcastError);
      throw broadcastError;
    }

    // Check if this is an all-AI game - if so, schedule AI turns to keep the game moving
    const hasHumanPlayers = this.warfaireInstance.players.some((p: any) => !p.isAI);
    if (!hasHumanPlayers) {
      console.log(`🎪 [FLIP] All-AI game detected - scheduling AI turns`);
      if (this.aiTurnTimer) {
        clearTimeout(this.aiTurnTimer);
      }
      this.aiTurnTimer = setTimeout(() => this.handleAITurns(), 500);
    } else {
      console.log(`🎪 [FLIP] Round ready - waiting for players to act (AI will play after human acts)`);
    }

    console.log(`🎪 [FLIP] flipCardsAndContinue completed successfully. New phase: ${this.gameState.phase}`);
    } catch (error) {
      console.error(`🎪 [FLIP ERROR] Error in flipCardsAndContinue:`, error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Force phase transition to prevent being stuck
      if (this.gameState) {
        this.gameState.phase = `Fair${this.currentFair}Round${this.currentRound}`;
        this.syncWarFaireStateToSeats();
        this.broadcastGameState();
      }
      throw error;
    }
  }

  private syncWarFaireStateToSeats(): void {
    if (!this.warfaireInstance || !this.gameState) return;

    console.log(`🎪 [SYNC] Syncing state - Fair ${this.currentFair}, Round ${this.currentRound}`);
    console.log(`🎪 [SYNC] Phase: ${this.gameState.phase}`);

    // Iterate over seats and use the mapping to find the correct player
    this.gameState.seats.forEach((seat, seatIndex) => {
      if (seat) {
        const playerIndex = this.seatToPlayerIndex.get(seatIndex);
        if (playerIndex === undefined) {
          console.error(`🎪 [SYNC ERROR] No player index found for seat ${seatIndex}`);
          return;
        }
        const wfPlayer = this.warfaireInstance!.players[playerIndex];
        if (!wfPlayer) {
          console.error(`🎪 [SYNC ERROR] No player found at player index ${playerIndex} for seat ${seatIndex}`);
          return;
        }

        // Detailed logging of face-down cards with their tags
        console.log(`🎪 [SYNC] Player ${wfPlayer.name} face-down cards (${wfPlayer.faceDownCards?.length || 0}):`);
        if (wfPlayer.faceDownCards && wfPlayer.faceDownCards.length > 0) {
          wfPlayer.faceDownCards.forEach((card: any, idx: number) => {
            console.log(`🎪 [SYNC]   [${idx}] ${card.category} ${card.value} - Fair ${card.playedFaceDownAtFair || '?'}, Round ${card.playedFaceDownAtRound || '?'}`);
          });
        }

        // Debug log player state
        console.log(`🎪 [SYNC] Player ${wfPlayer.name}:`, {
          handCount: wfPlayer.hand.length,
          playedCardsCount: wfPlayer.playedCards.length,
          faceUpCardsCount: wfPlayer.faceUpCards?.length || 0,
          faceDownCardsCount: wfPlayer.faceDownCards?.length || 0,
          totalCardsOnBoard: (wfPlayer.faceUpCards?.length || 0) + (wfPlayer.faceDownCards?.length || 0)
        });

        seat.hand = wfPlayer.hand.map((c: any) => ({
          category: c.category,
          value: c.value,
          isGroupCard: c.isGroupCard,
          selectedCategory: c.selectedCategory,
          getEffectiveCategory: c.isGroupCard && c.selectedCategory
            ? () => c.selectedCategory
            : () => c.category
        }));
        // Also add getEffectiveCategory to playedCards so group cards work on the board
        seat.playedCards = wfPlayer.playedCards.map((c: any) => ({
          ...c,
          getEffectiveCategory: c.isGroupCard && c.selectedCategory
            ? () => c.selectedCategory
            : () => c.category
        }));
        seat.ribbons = wfPlayer.ribbons;
        seat.totalVP = wfPlayer.totalVP;

        // Add face-up and face-down cards separately
        (seat as any).faceUpCards = wfPlayer.faceUpCards || [];
        (seat as any).faceDownCards = wfPlayer.faceDownCards || [];
        (seat as any).nextFairFaceDownCards = wfPlayer.nextFairFaceDownCards || [];

        // Add current round's face-up card (last card in playedCards if any this round)
        const recentCards = wfPlayer.playedCards.slice(-1);
        (seat as any).currentFaceUpCard = recentCards.length > 0 ? recentCards[0] : null;
      }
    });

    // Update game-wide state
    (this.gameState as any).activeCategories = this.warfaireInstance.activeCategories;
    (this.gameState as any).categoryPrestige = this.warfaireInstance.categoryPrestige;
    (this.gameState as any).currentFair = this.currentFair;
    (this.gameState as any).currentRound = this.currentRound;
  }

  handlePlayerAction(playerId: string, action: string, data?: any): void {
    if (!this.gameState) return;

    switch(action) {
      case 'start_hand':
        if (this.gameState.phase === 'Lobby' && this.canStartHand()) {
          this.startHand();
        }
        break;
      case 'play_cards':
        if (!this.warfaireInstance) return;
        this.handlePlayCards(playerId, data);
        break;
      case 'select_flip_category':
        // Handle group card category selection for face-down cards about to flip
        if (this.gameState.phase.includes('GroupSelection') && data?.category) {
          const fairToFlipFrom = this.currentFair === 1 ? 0 : this.currentFair - 1;

          // Find player by seat (playerId is socket ID, need to map to player index)
          const seatIndex = this.gameState.seats.findIndex(s => s?.playerId === playerId);
          if (seatIndex === -1) {
            console.error(`🎪 [ERROR] select_flip_category: No seat found for playerId ${playerId}`);
            break;
          }
          const playerIndex = this.seatToPlayerIndex.get(seatIndex);
          if (playerIndex === undefined) {
            console.error(`🎪 [ERROR] select_flip_category: No player index for seat ${seatIndex}`);
            break;
          }
          const player = this.warfaireInstance?.players[playerIndex];

          if (player) {
            const cardToFlip = player.faceDownCards.find(
              (card: any) => card.playedFaceDownAtFair === fairToFlipFrom &&
                            card.playedFaceDownAtRound === this.currentRound &&
                            card.isGroupCard
            );
            if (cardToFlip) {
              cardToFlip.selectedCategory = data.category;
              console.log(`🎪 ${player.name} selected category ${data.category} for flip card`);

              // Check if all players have selected
              if (!this.warfaireInstance) return;
              const cardsToFlip: Array<{ player: any; card: any }> = [];
              for (const p of this.warfaireInstance.players) {
                const card = p.faceDownCards.find(
                  (c: any) => c.playedFaceDownAtFair === fairToFlipFrom &&
                             c.playedFaceDownAtRound === this.currentRound
                );
                if (card) {
                  cardsToFlip.push({ player: p, card });
                }
              }

              // Update cardsToFlip in game state and broadcast
              (this.gameState as any).cardsToFlip = cardsToFlip.map(({ player: p, card }) => {
                // Map player to seat to get socket ID
                const pIndex = this.warfaireInstance!.players.indexOf(p);
                let seatPlayerId = null;
                for (const [sIdx, pIdx] of this.seatToPlayerIndex.entries()) {
                  if (pIdx === pIndex) {
                    seatPlayerId = this.gameState!.seats[sIdx]?.playerId;
                    break;
                  }
                }
                return {
                  playerId: seatPlayerId, // Use socket ID, not array index
                  card: {
                    category: card.category,
                    value: card.value,
                    isGroupCard: card.isGroupCard,
                    selectedCategory: card.selectedCategory
                  }
                };
              });
              this.syncWarFaireStateToSeats();
              this.broadcastGameState();

              const allSelected = cardsToFlip.every(({ card }) =>
                !card.isGroupCard || card.selectedCategory
              );

              if (allSelected) {
                // Clear the timer since we're proceeding
                if (this.groupSelectionTimer) {
                  clearTimeout(this.groupSelectionTimer);
                  this.groupSelectionTimer = null;
                }
                // All selections made, proceed with flipping (use current fair/round for validation)
                this.flipCardsAndContinue(cardsToFlip, this.currentFair, this.currentRound);
              }
            }
          }
        }
        break;
      case 'continue_from_summary':
        if (this.gameState.phase.startsWith('RoundSummary')) {
          // Clear auto-continue timer since user manually continued
          if (this.roundSummaryTimer) {
            clearTimeout(this.roundSummaryTimer);
            this.roundSummaryTimer = null;
          }
          this.continueFromRoundSummary();
        } else if (this.gameState.phase.startsWith('FairSummary')) {
          // Check if game is complete (3 Fairs) or start next Fair
          if (this.currentFair >= 3) {
            this.endGame();
          } else if (this.warfaireInstance) {
            console.log(`🎪 Continuing to Fair ${this.currentFair + 1}...`);
            this.warfaireInstance.prepareNextFair();
            this.currentFair++;
            this.currentRound = 0;
            this.startRound();
          }
        }
        break;
      case 'return_to_lobby':
        if (this.gameState.phase === 'GameEnd') {
          // Clear the auto-return timer since user manually returned
          if (this.gameEndTimer) {
            clearTimeout(this.gameEndTimer);
            this.gameEndTimer = null;
          }
          this.returnToLobby();
        }
        break;
    }
  }

  private handlePlayCards(playerId: string, data: any): void {
    try {
      const { faceUpCard, faceDownCard, groupSelections } = data;

      console.log(`🎪 Received play_cards from ${playerId}:`, { faceUpCard, faceDownCard, fair: this.currentFair });

    // Store pending action
    // In Fair 3, faceDownCard will be null/undefined
    this.pendingActions.set(playerId, {
      faceUpCard,
      faceDownCard: this.currentFair < 3 ? faceDownCard : null,
      groupSelections
    });

    // Mark player as having acted
    const seat = this.gameState!.seats.find(s => s?.playerId === playerId);
    if (seat) {
      seat.hasActed = true;
    }

    // Broadcast updated state so player sees "waiting for others"
    this.broadcastGameState();

      // Clear any pending AI timer and trigger AI turns immediately
      if (this.aiTurnTimer) {
        clearTimeout(this.aiTurnTimer);
        this.aiTurnTimer = null;
      }
      setTimeout(() => this.handleAITurns(), 500);
    } catch (error) {
      console.error('🎪 ERROR in handlePlayCards:', error);
      console.error('🎪 Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      // Broadcast current state to show error to client
      this.broadcastGameState();
    }
  }

  private handleAITurns(): void {
    try {
      if (!this.warfaireInstance || !this.gameState) return;

      // Don't process if we're already in a summary phase
      if (this.gameState.phase.includes('Summary')) {
        console.log(`🎪 [AI] Skipping - already in summary phase: ${this.gameState.phase}`);
        return;
      }

      // Clear the timer reference since we're executing now
      this.aiTurnTimer = null;

      console.log(`🎪 [AI] ======== HANDLING AI TURNS ========`);
      console.log(`🎪 [AI] Current state - Fair ${this.currentFair}, Round ${this.currentRound}`);
      console.log(`🎪 [AI] Phase: ${this.gameState.phase}`);
      console.log(`🎪 [AI] Starting AI turns handler at ${Date.now()}`);
      let aiActionsCount = 0;

    // Auto-play for AI players using existing WarFaire AI logic
    this.gameState.seats.forEach((seat, seatIndex) => {
      console.log(`🎪 [AI] Checking seat ${seatIndex}:`, {
        hasSeat: !!seat,
        isAI: seat?.isAI,
        hasFolded: seat?.hasFolded,
        playerId: seat?.playerId,
        name: seat?.name
      });

      if (seat && seat.isAI && !seat.hasFolded && !seat.hasActed) {
        const playerIndex = this.seatToPlayerIndex.get(seatIndex);
        if (playerIndex === undefined) {
          console.error(`🎪 [AI ERROR] No player index found for seat ${seatIndex}`);
          return;
        }
        const player = this.warfaireInstance!.players[playerIndex];
        if (!player) {
          console.error(`🎪 [AI ERROR] No player found at player index ${playerIndex} for seat ${seatIndex}`);
          return;
        }
        console.log(`🎪 [AI] AI player ${seat.name} at seat ${seatIndex} (player index ${playerIndex}) has ${player.hand.length} cards`);

        const minCards = this.currentFair < 3 ? 2 : 1; // Fair 3 only needs 1 card
        if (player.hand.length >= minCards) {
          console.log(`🎪 [AI] AI player ${seat.name} is playing cards...`);

          // Random AI selection (same as game.js)
          const faceUpCard = player.hand[Math.floor(Math.random() * player.hand.length)];
          const faceUpIndex = player.hand.indexOf(faceUpCard);

          // Handle group cards for face-up
          if (faceUpCard.isGroupCard) {
            const validCategories = this.warfaireInstance!.activeCategories.filter(
              (c: any) => c.group === faceUpCard.category
            );
            if (validCategories.length > 0) {
              faceUpCard.selectedCategory = validCategories[
                Math.floor(Math.random() * validCategories.length)
              ].name;
            }
          }

          player.playCardFaceUp(faceUpCard);
          console.log(`🎪 [AI] AI ${seat.name} played face-up: ${faceUpCard.category} (${faceUpCard.value})`);
          console.log(`🎪 [AI] ${seat.name} after face-up play:`, {
            handRemaining: player.hand.length,
            faceDownCards: player.faceDownCards.length,
            playedCards: player.playedCards.length
          });

          // Play face-down only in Fairs 1 and 2
          if (this.currentFair < 3 && player.hand.length > 0) {
            console.log(`🎪 [AI] ${seat.name} BEFORE playCardFaceDown: faceDown=${player.faceDownCards.length} cards`);
            player.faceDownCards.forEach((c: any, idx: number) => {
              console.log(`🎪 [AI]   [${idx}] ${c.category}${c.value} (F${c.playedFaceDownAtFair}R${c.playedFaceDownAtRound})`);
            });

            const faceDownCard = player.hand[Math.floor(Math.random() * player.hand.length)];

            // Handle group cards for face-down
            if (faceDownCard.isGroupCard) {
              const validCategories = this.warfaireInstance!.activeCategories.filter(
                (c: any) => c.group === faceDownCard.category
              );
              if (validCategories.length > 0) {
                faceDownCard.selectedCategory = validCategories[
                  Math.floor(Math.random() * validCategories.length)
                ].name;
              }
            }

            console.log(`🎪 [AI] AI ${seat.name} playing face-down: ${faceDownCard.category} ${faceDownCard.value} (will be tagged F${player.currentFair}R${player.currentRound})`);
            player.playCardFaceDown(faceDownCard);

            console.log(`🎪 [AI] AI ${seat.name} AFTER playCardFaceDown: faceDown=${player.faceDownCards.length} cards`);
            player.faceDownCards.forEach((c: any, idx: number) => {
              console.log(`🎪 [AI]   [${idx}] ${c.category}${c.value} (F${c.playedFaceDownAtFair}R${c.playedFaceDownAtRound})`);
            });
            console.log(`🎪 [AI] ${seat.name} final state:`, {
              handRemaining: player.hand.length,
              faceDownCards: player.faceDownCards.length,
              playedCards: player.playedCards.length
            });
          }

          seat.hasActed = true;
          aiActionsCount++;
          console.log(`🎪 [AI] AI ${seat.name} has acted (total AI actions: ${aiActionsCount})`);
        } else {
          console.log(`🎪 [AI] AI player ${seat.name} doesn't have enough cards (${player.hand.length} < ${minCards})`);
        }
      }
    });

    console.log(`🎪 [AI] AI turns complete. ${aiActionsCount} AI players acted.`);

    // Check if round should be processed
    const allActed = this.gameState.seats.every(s => !s || s.hasFolded || s.hasActed);
    console.log('🎪 [AI] Checking if all players acted:', {
      allActed,
      total: this.gameState.seats.filter(s => s).length,
      acted: this.gameState.seats.filter(s => s && s.hasActed).length,
      seatStates: this.gameState.seats.map((s, idx) => s ? {
        idx,
        name: s.name,
        isAI: s.isAI,
        hasActed: s.hasActed
      } : null).filter(Boolean)
    });

      if (allActed) {
        console.log('🎪 [AI] All players acted! Processing round...');
        this.processRound();
      } else {
        console.log('🎪 [AI] NOT all players acted yet. Waiting...');
        // CRITICAL: Broadcast state so frontend sees AI actions
        this.syncWarFaireStateToSeats();
        this.broadcastGameState();
      }
    } catch (error) {
      console.error('🎪 [AI] ERROR in handleAITurns:', error);
      console.error('🎪 [AI] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      // Broadcast current state and return to prevent crash
      this.broadcastGameState();
    }
  }

  private processRound(): void {
    try {
      if (!this.warfaireInstance || !this.gameState) return;

      // Prevent re-entry
      if (this.isProcessingRound) {
        console.log(`🎪 [GUARD] Already processing round, skipping`);
        return;
      }

      this.isProcessingRound = true;
      console.log(`🎪 Processing round - Fair ${this.currentFair}, Round ${this.currentRound}`);

    // Apply all pending actions from human players
    for (const [playerId, action] of this.pendingActions) {
      const seatIndex = this.gameState.seats.findIndex(s => s?.playerId === playerId);
      if (seatIndex === -1) continue;

      const playerIndex = this.seatToPlayerIndex.get(seatIndex);
      if (playerIndex === undefined) {
        console.error(`🎪 [PROCESS ERROR] No player index found for seat ${seatIndex}`);
        continue;
      }
      const player = this.warfaireInstance.players[playerIndex];
      if (!player) {
        console.error(`🎪 [PROCESS ERROR] No player found at player index ${playerIndex} for seat ${seatIndex}`);
        continue;
      }

      // Find and play cards
      const faceUpCard = player.hand.find((c: any) =>
        c.category === action.faceUpCard.category &&
        c.value === action.faceUpCard.value
      );

      // In Fair 3, there's no face-down card
      const faceDownCard = action.faceDownCard ? player.hand.find((c: any) =>
        c.category === action.faceDownCard.category &&
        c.value === action.faceDownCard.value &&
        c !== faceUpCard
      ) : null;

      if (faceUpCard) {
        // Apply group selections
        if (faceUpCard.isGroupCard && action.groupSelections?.faceUp) {
          faceUpCard.selectedCategory = action.groupSelections.faceUp;
        }

        player.playCardFaceUp(faceUpCard);

        // Only play face-down in Fairs 1 and 2
        if (faceDownCard) {
          console.log(`🎪 [PROCESS] ${player.name} BEFORE playCardFaceDown: faceDown=${player.faceDownCards.length} cards`);
          player.faceDownCards.forEach((c: any, idx: number) => {
            console.log(`🎪 [PROCESS]   [${idx}] ${c.category}${c.value} (F${c.playedFaceDownAtFair}R${c.playedFaceDownAtRound})`);
          });

          if (faceDownCard.isGroupCard && action.groupSelections?.faceDown) {
            faceDownCard.selectedCategory = action.groupSelections.faceDown;
          }

          console.log(`🎪 [PROCESS] ${player.name} playing face-down: ${faceDownCard.category} ${faceDownCard.value} (will be tagged F${player.currentFair}R${player.currentRound})`);
          player.playCardFaceDown(faceDownCard);

          console.log(`🎪 [PROCESS] ${player.name} AFTER playCardFaceDown: faceDown=${player.faceDownCards.length} cards`);
          player.faceDownCards.forEach((c: any, idx: number) => {
            console.log(`🎪 [PROCESS]   [${idx}] ${c.category}${c.value} (F${c.playedFaceDownAtFair}R${c.playedFaceDownAtRound})`);
          });
        }
      }
    }

    this.pendingActions.clear();

    // Sync state to show face-up cards
    this.syncWarFaireStateToSeats();

    // Store round summary data for display
    const roundPlays: any[] = [];
    this.gameState.seats.forEach((seat, seatIndex) => {
      if (seat && this.warfaireInstance) {
        const playerIndex = this.seatToPlayerIndex.get(seatIndex);
        if (playerIndex === undefined) {
          console.log(`🎪 [WARN] No player index found for seat ${seatIndex} (${seat.name})`);
          return;
        }
        const player = this.warfaireInstance.players[playerIndex];
        if (!player) {
          console.log(`🎪 [WARN] No player found at player index ${playerIndex} for seat ${seatIndex} (${seat.name})`);
          return;
        }

        const faceUpCard = player.faceUpCards && player.faceUpCards.length > 0
          ? player.faceUpCards[player.faceUpCards.length - 1]
          : null;

        const faceDownCard = player.faceDownCards && player.faceDownCards.length > 0
          ? player.faceDownCards[player.faceDownCards.length - 1]
          : null;

        roundPlays.push({
          playerName: seat.name,
          playerId: seat.playerId,
          isAI: seat.isAI,
          faceUpCard: faceUpCard ? {
            category: faceUpCard.getEffectiveCategory ? faceUpCard.getEffectiveCategory() : faceUpCard.category,
            value: faceUpCard.value
          } : null,
          faceDownCard: faceDownCard ? {
            category: faceDownCard.getEffectiveCategory ? faceDownCard.getEffectiveCategory() : faceDownCard.category,
            value: faceDownCard.value
          } : null
        });
      }
    });

    (this.gameState as any).roundPlays = roundPlays;
    (this.gameState as any).completedRound = this.currentRound;

    // Reset hasActed flags
    console.log(`🎪 Resetting hasActed flags for all seats`);
    this.gameState.seats.forEach(s => { if (s) s.hasActed = false; });

      // Transition to RoundSummary phase
      this.gameState.phase = `RoundSummary${this.currentFair}_${this.currentRound}`;
      console.log(`🎪 Entering RoundSummary phase`);
      console.log(`🎪 [BROADCAST] About to broadcast RoundSummary state...`);

      this.isProcessingRound = false;
      this.broadcastGameState();
      console.log(`🎪 [BROADCAST] RoundSummary broadcast complete`);

      // DISABLED: Auto-progression was causing disconnect issues
      // if (this.roundSummaryTimer) {
      //   clearTimeout(this.roundSummaryTimer);
      // }
      // this.roundSummaryTimer = setTimeout(() => {
      //   console.log(`🎪 [AUTO] Auto-continuing from round summary...`);
      //   this.continueFromRoundSummary();
      // }, 3000);
    } catch (error) {
      console.error('🎪 ERROR in processRound:', error);
      console.error('🎪 Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      this.isProcessingRound = false;
      // Try to recover by broadcasting current state
      if (this.gameState) {
        this.broadcastGameState();
      }
    }
  }

  private continueFromRoundSummary(): void {
    if (!this.gameState) return;

    // Check if Fair is complete (3 rounds)
    if (this.currentRound >= 3) {
      console.log(`🎪 Fair ${this.currentFair} complete, ending fair...`);
      this.endFair();
    } else {
      console.log(`🎪 Starting next round...`);
      this.startRound();
    }
  }

  private endFair(): void {
    if (!this.warfaireInstance || !this.gameState) return;

    console.log(`🎪 Ending Fair ${this.currentFair}...`);

    // Score the fair
    const results = scoreFair(
      this.warfaireInstance.players,
      this.warfaireInstance.activeCategories,
      this.warfaireInstance.categoryPrestige
    );

    // Update prestige
    updatePrestige(
      this.warfaireInstance.activeCategories,
      this.warfaireInstance.categoryPrestige,
      results
    );

    // Sync final state
    this.syncWarFaireStateToSeats();

    // Store Fair results in game state for display
    (this.gameState as any).fairResults = results;
    (this.gameState as any).lastCompletedFair = this.currentFair;

    // Transition to Fair Summary phase
    this.gameState.phase = `FairSummary${this.currentFair}`;
    console.log(`🎪 Entering FairSummary${this.currentFair} phase`);

    this.broadcastGameState();
  }

  private endGame(): void {
    if (!this.gameState) return;

    console.log(`🎪 Ending game after 3 Fairs...`);

    const winners = this.evaluateWinners();

    // Store winners for display
    (this.gameState as any).gameWinners = winners;

    // Transition to GameEnd phase
    this.gameState.phase = 'GameEnd';
    console.log(`🎪 Entering GameEnd phase`);

    this.broadcastGameState();

    // Set a 15-second timer to auto-return to lobby
    if (this.gameEndTimer) {
      clearTimeout(this.gameEndTimer);
    }
    this.gameEndTimer = setTimeout(() => {
      console.log(`🎪 Auto-returning to lobby after game end`);
      this.returnToLobby();
    }, 15000); // 15 seconds
  }

  private returnToLobby(): void {
    if (!this.gameState) return;

    // Clear any pending timers
    if (this.gameEndTimer) {
      clearTimeout(this.gameEndTimer);
      this.gameEndTimer = null;
    }
    if (this.groupSelectionTimer) {
      clearTimeout(this.groupSelectionTimer);
      this.groupSelectionTimer = null;
    }
    if (this.aiTurnTimer) {
      clearTimeout(this.aiTurnTimer);
      this.aiTurnTimer = null;
    }
    if (this.roundSummaryTimer) {
      clearTimeout(this.roundSummaryTimer);
      this.roundSummaryTimer = null;
    }

    console.log(`🎪 Returning to lobby...`);

    const winners = (this.gameState as any).gameWinners || this.evaluateWinners();

    // Distribute winnings to table stacks
    this.payoutWinners(winners);

    // Broadcast winner announcement
    if (winners.length > 0) {
      this.broadcast('player_action', {
        playerName: winners[0].name,
        action: 'won',
        details: `${winners[0].payout / 10} VP`,
        isAI: false,
      });
    }

    // Use GameBase's endHand to clean up and return to Lobby
    this.endHand();
    this.broadcastGameState();
  }

  evaluateWinners(): WinnerResult[] {
    if (!this.warfaireInstance) return [];

    const winner = this.warfaireInstance.getWinner();
    const playerIndex = this.warfaireInstance.players.indexOf(winner);

    // Find the seat index for this player
    let winningSeatIndex = -1;
    for (const [seatIdx, playerIdx] of this.seatToPlayerIndex.entries()) {
      if (playerIdx === playerIndex) {
        winningSeatIndex = seatIdx;
        break;
      }
    }

    if (winningSeatIndex === -1) {
      console.error(`🎪 [WINNER ERROR] Could not find seat for player index ${playerIndex}`);
      return [];
    }

    const winningSeat = this.gameState!.seats[winningSeatIndex];
    if (!winningSeat) {
      console.error(`🎪 [WINNER ERROR] No seat found at index ${winningSeatIndex}`);
      return [];
    }

    // Award VP as pennies (1 VP = 10 cents = 10 pennies)
    return [{
      playerId: winningSeat.playerId,
      name: winningSeat.name,
      payout: winner.totalVP * 10
    }];
  }

  getValidActions(playerId: string): string[] {
    const phase = this.gameState?.phase || '';

    if (phase === 'Lobby') {
      return this.canStartHand() ? ['start_hand'] : [];
    }

    if (phase.startsWith('Fair') && phase.includes('Round')) {
      return ['play_cards', 'select_category'];
    }

    return [];
  }
}
