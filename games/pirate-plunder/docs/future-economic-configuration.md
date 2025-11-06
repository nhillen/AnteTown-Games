# Economic Configuration TODO

⚠️ **Note**: This document uses the internal cent-based system (100 cents = $1). Production database stores values in dollars for user display, but backend calculations use cents for precision.

## Economic Values to Make Configurable

### Default Bankrolls
**Location:** Various lines in `server.ts`
- AI bankroll: 10000 cents (100 gold)
- Player bankroll: 10000 cents (100 gold) 
- Starting seat bankroll: 100 cents (1 gold)
- New AI seat: 5000 cents (50 gold)
- **Impact:** Stakes levels (micro vs high-roller), teaching vs competitive tables

### Betting Limits and Defaults
**Location:** `server.ts:1856, 2606, 2654`
- Min bet: 100 cents (1 gold)
- Default bet: 500 cents (5 gold)
- Pot fallback: 1% of pot (min 100 cents)
- Max rake: 1000 cents (10 gold)
- **Impact:** Different stakes levels, table limits

### Percentage-Based Economic Values  
**Location:** `server.ts:3113, 2597-2606`
- Max chest bonus multiplier: 1.5x
- Pot percentage fallbacks: 1% 
- **Impact:** Risk/reward balance, chest value relative to pot

## Where to Implement This

### Option 1: Separate Economic Config
Create `economic-config.json` alongside `table-config.json`
- **Pros:** Clean separation, can be managed by different roles
- **Cons:** More config files to manage

### Option 2: Extend Table Config
Add `economics` section to existing table config
- **Pros:** Single config file, consistent with current system
- **Cons:** Makes config larger and more complex

### Option 3: Database Configuration  
Store in database with admin UI
- **Pros:** Per-table economics, runtime changes
- **Cons:** More complex, requires admin interface

## Proposed Structure
```typescript
economics: {
  bankrolls: {
    default_player: number;    // 10000 (100 gold)
    default_ai: number;        // 10000 (100 gold)  
    starting_seat: number;     // 100 (1 gold)
    new_ai_seat: number;       // 5000 (50 gold)
  };
  betting: {
    min_bet_amount: number;    // 100 (1 gold)
    default_bet_amount: number; // 500 (5 gold)
    pot_fallback_percent: number; // 0.01 (1%)
    max_rake_amount: number;   // 1000 (10 gold)
  };
  balance: {
    max_ev_bonus_multiplier: number; // 1.5
  };
}
```

## Implementation Notes
- All values in cents (backend currency)
- Should validate reasonable ranges (e.g., min_bet > 0)
- May need per-stakes-level presets (micro/low/mid/high)
- Consider tournament vs cash game variations

*Created: 2025-09-03*
*Status: Future enhancement - requires discussion on config location*