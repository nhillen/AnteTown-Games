# Complete Config Port Plan: server.ts → PiratePlunderTable.ts

## Overview
Port all 27 config settings from old server.ts (7568 lines) to new GameBase-refactored PiratePlunderTable.ts (2027 lines).

**Status**: Infrastructure complete ✅, Logic porting in progress 🚧

## Phase 1: Infrastructure ✅ COMPLETE
- [x] Create all config interfaces (TableSettings, BettingConfig, PayoutsConfig, HouseConfig, ChestConfig, BustFeeConfig, AdvancedConfig, TimingConfig, DisplayConfig, RulesDisplayConfig)
- [x] Add createDefaultPiratePlunderConfig() factory
- [x] Add mergeConfig() helper
- [x] Update constructor to store this.fullConfig
- [x] Support fullConfig in PiratePlunderTableConfig interface

## Phase 2: Core Helper Methods 🚧 IN PROGRESS

### A. Chest Drip System (from server.ts:215-262)
**Config Used**: `this.fullConfig.chest.drip_percent`
```typescript
private processDripFromWager(wagerAmount: number): { mainPot: number; chestDrip: number } {
  const exactDrip = wagerAmount * this.fullConfig.chest.drip_percent;
  const accumulatedDrip = (this.gameState.dripAccumulator || 0) + exactDrip;
  const integerDrip = Math.floor(accumulatedDrip);
  this.gameState.dripAccumulator = accumulatedDrip - integerDrip;
  const mainPotAmount = wagerAmount - integerDrip;
  this.gameState.cargoChest = (this.gameState.cargoChest || 0) + integerDrip;
  return { mainPot: mainPotAmount, chestDrip: integerDrip };
}
```

### B. House Rake Calculation (from server.ts:5783-5824)
**Config Used**: `this.fullConfig.house.rake_percent`, `this.fullConfig.house.rake_cap`
```typescript
private calculateRake(pot: number): number {
  if (!this.fullConfig.house.rake_enabled) return 0;
  const calculatedRake = Math.floor(pot * this.fullConfig.house.rake_percent);
  return Math.min(calculatedRake, this.fullConfig.house.rake_cap);
}
```

### C. Role Assignment with Requirements (from server.ts:5854-5890)
**Config Used**: `this.fullConfig.payouts.role_requirements`
```typescript
private assignRolesWithRequirements(results: ShowdownResult[]): void {
  const roleReqs = this.fullConfig.payouts.role_requirements;
  const maxSixes = Math.max(...results.map(r => r.handResult.sixCount));
  const maxFives = Math.max(...results.map(r => r.handResult.fiveCount));
  const maxFours = Math.max(...results.map(r => r.handResult.fourCount));

  // Ship = Most 6s (unique) AND meets minimum
  const shipCandidates = results.filter(r =>
    r.handResult.sixCount === maxSixes && maxSixes >= roleReqs.ship
  );
  const shipWinner = shipCandidates.length === 1 ? shipCandidates[0] : null;
  if (shipWinner) shipWinner.roles.push('Ship');

  // Captain = Most 5s (unique, not Ship) AND meets minimum
  const captainCandidates = results.filter(r =>
    r.handResult.fiveCount === maxFives && maxFives >= roleReqs.captain && r !== shipWinner
  );
  const captainWinner = captainCandidates.length === 1 ? captainCandidates[0] : null;
  if (captainWinner) captainWinner.roles.push('Captain');

  // Crew = Most 4s (unique, not Ship/Captain) AND meets minimum
  const crewCandidates = results.filter(r =>
    r.handResult.fourCount === maxFours && maxFours >= roleReqs.crew && r !== shipWinner && r !== captainWinner
  );
  const crewWinner = crewCandidates.length === 1 ? crewCandidates[0] : null;
  if (crewWinner) crewWinner.roles.push('Crew');
}
```

### D. Payout Calculation (from server.ts:5982-6050)
**Config Used**: `this.fullConfig.payouts.role_payouts`, `this.fullConfig.chest.unfilled_role_to_chest`
```typescript
private calculatePayouts(totalPot: number, results: ShowdownResult[]): void {
  const shipWinner = results.find(r => r.roles.includes('Ship'));
  const captainWinner = results.find(r => r.roles.includes('Captain'));
  const crewWinner = results.find(r => r.roles.includes('Crew'));

  let shipPayout = Math.floor(totalPot * this.fullConfig.payouts.role_payouts.ship);
  let captainPayout = Math.floor(totalPot * this.fullConfig.payouts.role_payouts.captain);
  let crewPayout = Math.floor(totalPot * this.fullConfig.payouts.role_payouts.crew);

  // Handle vacant roles with chest funnel
  if (!crewWinner) {
    const toChest = Math.floor(crewPayout * this.fullConfig.chest.unfilled_role_to_chest);
    this.gameState.cargoChest = (this.gameState.cargoChest || 0) + toChest;
    const remainder = crewPayout - toChest;
    // Remainder goes to carryover
    crewPayout = 0;
  }

  if (!captainWinner) {
    const toChest = Math.floor(captainPayout * this.fullConfig.chest.unfilled_role_to_chest);
    this.gameState.cargoChest = (this.gameState.cargoChest || 0) + toChest;
    const remainder = captainPayout - toChest;
    if (shipWinner) {
      shipPayout += remainder;
    }
    captainPayout = 0;
  }

  if (!shipWinner) {
    const toChest = Math.floor(shipPayout * this.fullConfig.chest.unfilled_role_to_chest);
    this.gameState.cargoChest = (this.gameState.cargoChest || 0) + toChest;
    shipPayout = 0;
  }

  // Award payouts
  if (shipWinner) shipWinner.payout += shipPayout;
  if (captainWinner) captainPayout += captainPayout;
  if (crewWinner) crewWinner.payout += crewPayout;
}
```

### E. Chest Award Calculation (from server.ts:5798-5823, 5915)
**Config Used**: `this.fullConfig.chest.low_rank_triggers`
```typescript
private calculateChestAward(chestAmount: number, lowDiceAnalysis: any): { award: number; carry: number } {
  const triggers = this.fullConfig.chest.low_rank_triggers;
  let percentage = 0;

  if (lowDiceAnalysis.type === 'yahtzee') percentage = triggers.yahtzee;
  else if (lowDiceAnalysis.type === 'quads') percentage = triggers.quads;
  else if (lowDiceAnalysis.type === 'trips') percentage = triggers.trips;

  const award = Math.floor(chestAmount * percentage);
  const carry = chestAmount - award;
  return { award, carry };
}
```

## Phase 3: Timing Configuration 🚧 NEXT

### A. Phase Timers (from server.ts throughout)
**Config Used**: `this.fullConfig.timing.phase_timers.*`
- Lock phase: Use `lock_phase_seconds` instead of hardcoded 30
- Betting phase: Use `betting_phase_seconds`
- Turn timeout: Use `turn_timeout_seconds`

**Current Code**: PiratePlunderTable.ts:551 sets hardcoded `phaseEndsAtMs = Date.now() + 30000`
**Fix**: Replace with `Date.now() + (this.fullConfig.timing.phase_timers.lock_phase_seconds * 1000)`

### B. Game Delays (from server.ts throughout)
**Config Used**: `this.fullConfig.timing.delays.*`
- Auto-start: `auto_start_seconds`
- Payout display: `payout_display_seconds`
- Hand end: `hand_end_seconds`
- Countdown: `countdown_seconds`

## Phase 4: Betting Systems 🚧 NEXT

### A. Betting Streets (from server.ts:5534-5574)
**Config Used**: `this.fullConfig.betting.streets.*`
- When `streets.enabled === true`:
  - S1 minimum bet
  - S2 minimum bet
  - S3 minimum bet with multiplier
- Table minimum calculation includes all street costs

### B. Edge Tiers (from server.ts:5654-5730)
**Config Used**: `this.fullConfig.betting.edge_tiers.*`
- Multiplies bets based on player position relative to leader
- behind: 0.50x
- co: 0.75x
- leader: 1.00x
- dominant: 1.25x (when ahead by dominant_threshold)

### C. Betting Rounding (from server.ts:apply throughout)
**Config Used**: `this.fullConfig.betting.rounding`
- Round all bets to nearest configured amount

### D. Progressive Ante (from server.ts:ante collection)
**Config Used**: `this.fullConfig.betting.ante.*`
- mode: 'per_player' | 'button' | 'every_nth' | 'none'
- progressive: true/false
- street_multiplier: multiplier per street

## Phase 5: Bust Fee System 🚧 NEXT

**Config Used**: `this.fullConfig.bust_fee.*`
**From**: server.ts:5551-5574

```typescript
private calculateBustFee(): number {
  if (!this.fullConfig.bust_fee.enabled) return 0;

  let amount = 0;
  switch (this.fullConfig.bust_fee.basis) {
    case 'S1':
      amount = this.fullConfig.betting.streets.S1 * 100;
      break;
    case 'S2':
      amount = this.fullConfig.betting.streets.S2 * 100;
      break;
    case 'S3':
      amount = this.fullConfig.betting.streets.S3 * 100;
      break;
    case 'fixed':
      amount = this.fullConfig.bust_fee.fixed_amount * 100;
      break;
  }

  return amount;
}

private applyBustFee(playerId: string): void {
  const fee = this.calculateBustFee();
  if (fee === 0) return;

  const seat = this.getSeat(playerId);
  if (!seat) return;

  const actualFee = Math.min(fee, seat.tableStack);
  seat.tableStack -= actualFee;

  if (this.fullConfig.bust_fee.to === 'chest') {
    this.gameState.cargoChest += actualFee;
  }
  // else 'burn' - just remove from game
}
```

## Phase 6: Advanced Features 🚧 NEXT

### A. Tie Resolution (from server.ts:tie handling)
**Config Used**: `this.fullConfig.advanced.ties`
- 'split_share' - Split payout among tied players
- 'reroll_one_die' - Reroll to break tie
- 'earliest_leader_priority' - First to achieve wins

### B. Role Declaration (from server.ts:if enabled)
**Config Used**: `this.fullConfig.advanced.declare_role`
- Players must declare which role they're going for before showdown

### C. Reveal Sequence (from server.ts:showdown)
**Config Used**: `this.fullConfig.advanced.reveal_sequence`
- Order to reveal dice: [1, 2, 3] or custom

## Phase 7: Current Usage Audit

### Places Already Using Config (Need Updates):
1. **Ante Collection** - PiratePlunderTable.ts:482
   - Currently: Uses `this.config.ante`
   - Update to: Use `this.fullConfig.betting.ante.amount` and handle ante modes

2. **Phase Timer** - PiratePlunderTable.ts:551
   - Currently: Hardcoded `30000` (30 seconds)
   - Update to: Use `this.fullConfig.timing.phase_timers.lock_phase_seconds * 1000`

3. **Min Buy-In** - PiratePlunderTable.ts:1419-1420
   - Currently: Uses `this.config.minBuyIn`
   - Update to: Calculate from `fullConfig.table.tableMinimumMultiplier * ante`

4. **Max Seats** - Constructor
   - Currently: Uses `config.maxSeats`
   - Already merged into `this.fullConfig.table.maxSeats` ✅

### Methods That Need Config Integration:
- `startHand()` - Add chest drip, progressive ante
- `enterPhase()` - Use timing config for phase timers
- `handlePlayerAction()` - Add edge tiers, betting streets, rounding
- `calculateShowdown()` - Add role requirements, payouts, vacant role handling
- Add NEW method `processShowdown()` with full config support

## Phase 8: Testing & Validation
- [ ] TypeScript compilation
- [ ] Test with default config
- [ ] Test with custom config overrides
- [ ] Verify backwards compatibility (ante/rake simple fields still work)
- [ ] Create GameManifest JSON for backoffice
- [ ] Build backoffice UI

## Config Usage Matrix

| Feature | Config Path | Current Status | Lines to Port |
|---------|------------|----------------|---------------|
| Chest Drip | `chest.drip_percent` | ❌ Not implemented | 215-262 |
| Role Requirements | `payouts.role_requirements` | ❌ Not implemented | 5854-5890 |
| Role Payouts | `payouts.role_payouts` | ❌ Not implemented | 5982-6050 |
| Unfilled Roles | `chest.unfilled_role_to_chest` | ❌ Not implemented | 5990-6025 |
| House Rake | `house.rake_percent`, `house.rake_cap` | ❌ Not implemented | 5783-5824 |
| Chest Triggers | `chest.low_rank_triggers` | ❌ Not implemented | 5798-5823 |
| Trigger Tiebreak | `chest.trigger_tiebreak` | ❌ Not implemented | 5908-5929 |
| Lock Timer | `timing.phase_timers.lock_phase_seconds` | ⚠️ Hardcoded | 551 |
| Betting Streets | `betting.streets` | ❌ Not implemented | 5534-5574 |
| Edge Tiers | `betting.edge_tiers` | ❌ Not implemented | 5654-5730 |
| Betting Rounding | `betting.rounding` | ❌ Not implemented | Throughout |
| Bust Fee | `bust_fee` | ❌ Not implemented | 5551-5574 |
| Progressive Ante | `betting.ante.progressive` | ❌ Not implemented | Ante collection |
| Ante Modes | `betting.ante.mode` | ⚠️ Partial (only fixed) | Constructor |
| Table Minimum | `table.tableMinimumMultiplier` | ❌ Not implemented | 5519-5533 |
| AI Fill | `table.targetTotalPlayers` | ✅ Implemented | Constructor |
| Max Seats | `table.maxSeats` | ✅ Implemented | Constructor |
| Timing Delays | `timing.delays.*` | ❌ Not implemented | Throughout |

**Total**: 17/27 features need porting

## Next Steps (Ordered by Priority)
1. ✅ Add helper methods for chest drip, rake, role assignment, payouts
2. 🚧 Update `startHand()` to use chest drip
3. 🚧 Update `enterPhase()` to use timing config
4. 🚧 Add `calculateShowdownWithConfig()` method
5. 🚧 Update ante collection for progressive and modes
6. 🚧 Add bust fee system
7. 🚧 Add betting streets support
8. 🚧 Add edge tiers support
9. Create GameManifest JSON
10. Build backoffice UI
