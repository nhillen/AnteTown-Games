import { describe, test, expect, beforeEach } from '@jest/globals';

// We'll extract game logic functions from server.ts for testing
// For now, let's create some basic tests for the game state logic

type GamePhase =
  | 'Lobby'
  | 'PreHand'
  | 'Ante'
  | 'Roll1'
  | 'Lock1'
  | 'Bet1'
  | 'Roll2'
  | 'Lock2'
  | 'Bet2'
  | 'Roll3'
  | 'Lock3'
  | 'Bet3'
  | 'Showdown'
  | 'Payout'
  | 'HandEnd';

type Die = { value: number; locked: boolean };
type Player = {
  id: string;
  name: string;
  isAI: boolean;
  bankroll: number;
};
type Seat = {
  playerId: string;
  name: string;
  isAI: boolean;
  bankroll: number;
  dice: Die[];
  hasFolded: boolean;
  lockAllowance: number;
};

// Extract these functions from server.ts to make them testable
function nextPhase(current: GamePhase): GamePhase {
  const order: GamePhase[] = ['Ante', 'Roll1', 'Lock1', 'Bet1', 'Roll2', 'Lock2', 'Bet2', 'Roll3', 'Lock3', 'Bet3', 'Showdown', 'Payout', 'HandEnd'];
  const idx = order.indexOf(current);
  if (idx < 0) return 'PreHand';
  return order[Math.min(order.length - 1, idx + 1)] as GamePhase;
}

function createEmptyDiceSet(): Die[] {
  return new Array(5).fill(null).map(() => ({ value: 0, locked: false }));
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function generateAiName(): string {
  const names = ['Bosun', 'Gunner', 'Quartermaster', 'Navigator', 'Cook', 'Deckhand'];
  const name = names[Math.floor(Math.random() * names.length)];
  return `${name} ${Math.floor(Math.random() * 90) + 10}`;
}

describe('Game Logic Tests', () => {
  describe('Phase Transitions', () => {
    test('should progress through phases correctly', () => {
      expect(nextPhase('Ante')).toBe('Roll1');
      expect(nextPhase('Roll1')).toBe('Lock1');
      expect(nextPhase('Lock1')).toBe('Bet1');
      expect(nextPhase('Bet1')).toBe('Roll2');
      expect(nextPhase('Roll2')).toBe('Lock2');
      expect(nextPhase('Lock2')).toBe('Bet2');
      expect(nextPhase('Bet2')).toBe('Roll3');
      expect(nextPhase('Roll3')).toBe('Lock3');
      expect(nextPhase('Lock3')).toBe('Bet3');
      expect(nextPhase('Bet3')).toBe('Showdown');
      expect(nextPhase('Showdown')).toBe('Payout');
      expect(nextPhase('Payout')).toBe('HandEnd');
      expect(nextPhase('HandEnd')).toBe('HandEnd'); // Should stay at end
    });

    test('should handle invalid phases', () => {
      expect(nextPhase('Lobby')).toBe('PreHand');
      expect(nextPhase('InvalidPhase' as GamePhase)).toBe('PreHand');
    });
  });

  describe('Dice Logic', () => {
    test('should create empty dice set', () => {
      const dice = createEmptyDiceSet();
      expect(dice).toHaveLength(5);
      dice.forEach(die => {
        expect(die.value).toBe(0);
        expect(die.locked).toBe(false);
      });
    });

    test('should roll valid die values', () => {
      for (let i = 0; i < 100; i++) {
        const value = rollDie();
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });

  describe('AI Name Generation', () => {
    test('should generate valid AI names', () => {
      for (let i = 0; i < 20; i++) {
        const name = generateAiName();
        expect(name).toMatch(/^(Bosun|Gunner|Quartermaster|Navigator|Cook|Deckhand) \d{2}$/);
      }
    });
  });

  describe('Game State Validation', () => {
    let mockSeat: Seat;

    beforeEach(() => {
      mockSeat = {
        playerId: 'test-player',
        name: 'Test Player',
        isAI: false,
        bankroll: 100,
        dice: createEmptyDiceSet(),
        hasFolded: false,
        lockAllowance: 1,
      };
    });

    test('should validate seat structure', () => {
      expect(mockSeat.playerId).toBe('test-player');
      expect(mockSeat.bankroll).toBe(100);
      expect(mockSeat.dice).toHaveLength(5);
      expect(mockSeat.hasFolded).toBe(false);
    });

    test('should handle dice locking logic', () => {
      // Simulate locking a die
      mockSeat.dice[0] = { value: 6, locked: false };
      
      // Player wants to lock die 0
      if (mockSeat.lockAllowance > 0 && !mockSeat.dice[0].locked) {
        mockSeat.dice[0].locked = true;
        mockSeat.lockAllowance -= 1;
      }

      expect(mockSeat.dice[0].locked).toBe(true);
      expect(mockSeat.lockAllowance).toBe(0);
    });

    test('should prevent locking when no allowance', () => {
      mockSeat.lockAllowance = 0;
      mockSeat.dice[0] = { value: 6, locked: false };
      
      // Try to lock when no allowance
      if (mockSeat.lockAllowance > 0 && !mockSeat.dice[0].locked) {
        mockSeat.dice[0].locked = true;
        mockSeat.lockAllowance -= 1;
      }

      expect(mockSeat.dice[0].locked).toBe(false);
      expect(mockSeat.lockAllowance).toBe(0);
    });
  });
});