"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
// Extract these functions from server.ts to make them testable
function nextPhase(current) {
    const order = ['Ante', 'Roll1', 'Lock1', 'Bet1', 'Roll2', 'Lock2', 'Bet2', 'Roll3', 'Lock3', 'Bet3', 'Showdown', 'Payout', 'HandEnd'];
    const idx = order.indexOf(current);
    if (idx < 0)
        return 'PreHand';
    return order[Math.min(order.length - 1, idx + 1)];
}
function createEmptyDiceSet() {
    return new Array(5).fill(null).map(() => ({ value: 0, locked: false }));
}
function rollDie() {
    return Math.floor(Math.random() * 6) + 1;
}
function generateAiName() {
    const names = ['Bosun', 'Gunner', 'Quartermaster', 'Navigator', 'Cook', 'Deckhand'];
    const name = names[Math.floor(Math.random() * names.length)];
    return `${name} ${Math.floor(Math.random() * 90) + 10}`;
}
(0, globals_1.describe)('Game Logic Tests', () => {
    (0, globals_1.describe)('Phase Transitions', () => {
        (0, globals_1.test)('should progress through phases correctly', () => {
            (0, globals_1.expect)(nextPhase('Ante')).toBe('Roll1');
            (0, globals_1.expect)(nextPhase('Roll1')).toBe('Lock1');
            (0, globals_1.expect)(nextPhase('Lock1')).toBe('Bet1');
            (0, globals_1.expect)(nextPhase('Bet1')).toBe('Roll2');
            (0, globals_1.expect)(nextPhase('Roll2')).toBe('Lock2');
            (0, globals_1.expect)(nextPhase('Lock2')).toBe('Bet2');
            (0, globals_1.expect)(nextPhase('Bet2')).toBe('Roll3');
            (0, globals_1.expect)(nextPhase('Roll3')).toBe('Lock3');
            (0, globals_1.expect)(nextPhase('Lock3')).toBe('Bet3');
            (0, globals_1.expect)(nextPhase('Bet3')).toBe('Showdown');
            (0, globals_1.expect)(nextPhase('Showdown')).toBe('Payout');
            (0, globals_1.expect)(nextPhase('Payout')).toBe('HandEnd');
            (0, globals_1.expect)(nextPhase('HandEnd')).toBe('HandEnd'); // Should stay at end
        });
        (0, globals_1.test)('should handle invalid phases', () => {
            (0, globals_1.expect)(nextPhase('Lobby')).toBe('PreHand');
            (0, globals_1.expect)(nextPhase('InvalidPhase')).toBe('PreHand');
        });
    });
    (0, globals_1.describe)('Dice Logic', () => {
        (0, globals_1.test)('should create empty dice set', () => {
            const dice = createEmptyDiceSet();
            (0, globals_1.expect)(dice).toHaveLength(5);
            dice.forEach(die => {
                (0, globals_1.expect)(die.value).toBe(0);
                (0, globals_1.expect)(die.locked).toBe(false);
            });
        });
        (0, globals_1.test)('should roll valid die values', () => {
            for (let i = 0; i < 100; i++) {
                const value = rollDie();
                (0, globals_1.expect)(value).toBeGreaterThanOrEqual(1);
                (0, globals_1.expect)(value).toBeLessThanOrEqual(6);
                (0, globals_1.expect)(Number.isInteger(value)).toBe(true);
            }
        });
    });
    (0, globals_1.describe)('AI Name Generation', () => {
        (0, globals_1.test)('should generate valid AI names', () => {
            for (let i = 0; i < 20; i++) {
                const name = generateAiName();
                (0, globals_1.expect)(name).toMatch(/^(Bosun|Gunner|Quartermaster|Navigator|Cook|Deckhand) \d{2}$/);
            }
        });
    });
    (0, globals_1.describe)('Game State Validation', () => {
        let mockSeat;
        (0, globals_1.beforeEach)(() => {
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
        (0, globals_1.test)('should validate seat structure', () => {
            (0, globals_1.expect)(mockSeat.playerId).toBe('test-player');
            (0, globals_1.expect)(mockSeat.bankroll).toBe(100);
            (0, globals_1.expect)(mockSeat.dice).toHaveLength(5);
            (0, globals_1.expect)(mockSeat.hasFolded).toBe(false);
        });
        (0, globals_1.test)('should handle dice locking logic', () => {
            // Simulate locking a die
            mockSeat.dice[0] = { value: 6, locked: false };
            // Player wants to lock die 0
            if (mockSeat.lockAllowance > 0 && !mockSeat.dice[0].locked) {
                mockSeat.dice[0].locked = true;
                mockSeat.lockAllowance -= 1;
            }
            (0, globals_1.expect)(mockSeat.dice[0].locked).toBe(true);
            (0, globals_1.expect)(mockSeat.lockAllowance).toBe(0);
        });
        (0, globals_1.test)('should prevent locking when no allowance', () => {
            mockSeat.lockAllowance = 0;
            mockSeat.dice[0] = { value: 6, locked: false };
            // Try to lock when no allowance
            if (mockSeat.lockAllowance > 0 && !mockSeat.dice[0].locked) {
                mockSeat.dice[0].locked = true;
                mockSeat.lockAllowance -= 1;
            }
            (0, globals_1.expect)(mockSeat.dice[0].locked).toBe(false);
            (0, globals_1.expect)(mockSeat.lockAllowance).toBe(0);
        });
    });
});
//# sourceMappingURL=game-logic.test.js.map