# AI Configuration TODO

## AI Behavior Constants to Make Configurable

### AI Profile Variance
**Location:** `server.ts:855-856`
- Currently: ±10% variance to prevent robotic behavior
- **Suggested config:** `ai.behavior.variance_percent` (default: 10)

### AI Fallback Values
**Location:** `server.ts:828-833`
- Currently hardcoded fallback profile:
  - `riskTolerance: 0.5`
  - `bluffFrequency: 0.1` 
  - `foldThreshold: 3`
  - `raiseMultiplier: 1.0`
  - `mistakeChance: 0.1`
- **Suggested config:** `ai.fallback_profile` section

### AI Decision Thresholds
**Location:** Various lines in `server.ts`
- Risk tolerance checks: `profile.riskTolerance > 0.7`
- Bankroll limits: `amountToCall > seat.bankroll * 0.2`
- Call decisions: `amountToCall < seat.bankroll * 0.3`
- **Suggested config:** `ai.decision_thresholds.risk_threshold`, `ai.decision_thresholds.bankroll_limit_percent`

### Hand Strength Evaluation (AI-Specific)
**Location:** `server.ts:2163-2190`
- Ship strength: "Very strong" = +6, "Good" = +4
- Phase multipliers: Early ×0.8, Late ×1.1  
- Cargo values: Good = +1, Some = +0.5
- **Suggested config:** `ai.hand_evaluation.*` section

## Proposed AI Config Structure
```typescript
ai: {
  behavior: {
    variance_percent: number;
    decision_thresholds: {
      risk_threshold: number;
      bankroll_limit_percent: number;
    };
  };
  fallback_profile: AIProfile;
  hand_evaluation: {
    role_strength_values: {...};
    phase_multipliers: {...};
    cargo_values: {...};
  };
}
```

## Implementation Priority
1. **Variance and thresholds** - Most impact on AI difficulty
2. **Fallback profile** - Ensures consistent AI when profiles missing
3. **Hand evaluation** - Advanced tuning for AI competitiveness

*Created: 2025-09-03*
*Status: Future enhancement*