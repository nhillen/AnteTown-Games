# Game Design Document: House Rules

**Version:** 1.0
**Last Updated:** 2025-11-04
**Status:** Core Implementation In Progress

## 1. High-Level Summary

**Title:** House Rules
**Genre:** Competitive multiplayer poker roguelike
**Format:** Single-table, 6–8 players, self-contained elimination run
**Session Length:** ~25–30 minutes
**Objective:** Outlast or outscore opponents by combining poker skill with temporary, hidden powers that bend the rules of the table.
**Unique Hook:** After each round, players secretly draft "Relics" — game-altering powers that change how poker is played. Every table becomes its own world, its own house rules.

## 2. Core Design Pillars

1. **Poker, Evolved** – The foundation remains Texas Hold'em. Every decision still matters.
2. **Roguelike Runs** – Each session is a standalone run with escalating chaos and asymmetry.
3. **Hidden Powers** – Players draft Relics that are face-down until revealed through use.
4. **Dynamic Law** – Every table evolves different "house rules" as the run progresses.
5. **Short, Complete Loops** – Each run is a full arc: setup → escalation → showdown → reset.

## 3. Match Flow

```
[Seat & Buy-in]
     ↓
[Round 1: 10–15 hands]
     ↓
[Rogue Break 1 → Relic Draft (Common)]
     ↓
[Round 2: 10–15 hands]
     ↓
[Rogue Break 2 → Relic Draft (Rare)]
     ↓
[Round 3: High Blinds + Epic Relics]
     ↓
[Final Orbit → Sudden Death Reveal]
     ↓
[Results & Telemetry Summary]
```

## 4. Core Systems

### 4.1 Table Setup

| Parameter | Default |
|-----------|---------|
| Players | 6–8 |
| Starting Stack | 10,000 chips |
| Blind Structure | +25% every orbit |
| Buy-in | Fixed (prototype uses test chips only) |
| Victory | Last player standing or highest stack after 4 orbits |
| Disconnect | Converts to "Ghost Player" (fold-biased AI) |
| Early Leave | Treated as forfeit, optionally cash out with 60% of current stack ("Escape Buyout") |

### 4.2 The Relic System (Rule-Bending Powers)

**Concept:**
Relics are in-run powers that alter the laws of poker. Some twist probabilities, others manipulate information, and some rewrite the table itself.

**Acquisition:**
- Earned during Rogue Breaks (every 10–15 hands or blind increase).
- Each player drafts one of two relics drawn from rarity-weighted pools.
- Once chosen, relics are face-down until first use.

**Visibility:**
- Hidden to opponents until triggered.
- Once revealed, they remain visible and trackable.
- Final round auto-reveals all remaining relics for drama.

**Activation Types:**
- **Passive** – always on once drafted.
- **Triggered** – single use or cooldown.
- **Conditional** – activate under certain situations (e.g., streaks, losses, all-ins).

### 4.3 Rarity Tiers

| Rarity | Pool Share | Example Complexity | Unlock Timing |
|--------|-----------|-------------------|---------------|
| Common | 60% | Low-impact, tactical | Available at start |
| Rare | 30% | Moderate, conditional | Appears after first break |
| Epic | 10% | Game-changing or dramatic | Appears after 2+ breaks |

### 4.4 Example Relics

| Name | Rarity | Type | Description |
|------|--------|------|-------------|
| Lucky Pair | Common | Passive | First pocket pair each orbit yields +5% chip bonus on win. |
| Peekaboo | Common | Triggered | Once per orbit, peek one random mucked card after showdown. |
| Chip Magnet | Common | Passive | Gain +2% chips on any pot over 500. |
| Mulligan | Rare | Triggered | Once per orbit, redraw both hole cards before flop. |
| Weighted Flop | Rare | Triggered | Once per round, re-roll one flop card. |
| Debt Marker | Rare | Passive | Immediately gain +10% stack; lose 15% next orbit. |
| The Dealer | Epic | Triggered | Once per match, re-deal the entire flop. |
| Chaos Burn | Epic | Triggered | Replace turn & river with three random community cards; pot doubles automatically. |
| Echo Tell | Rare | Passive | When another player reveals a relic, view their hole cards that hand. |
| The Gambler's Soul | Common | Conditional | After losing a hand, your next win yields +10% pot bonus. |
| Mirror Tell | Common | Passive | Reveals rarity color of any opponent relic upon trigger. |
| All-In Engine | Epic | Conditional | When you win an all-in, permanently gain +10% stack. Single activation. |

All relics exist in a data-driven JSON structure for easy expansion and AI tuning.

### 4.5 Hidden / Reveal UX

- **Player HUD:** Displays face-down relics with subtle rarity edge glow.
- **Activation:** Player clicks → confirm → animation + broadcast text.
  - Example: "Nathan invoked The Dealer! The flop is reshuffled!"
- **Cooldowns:** Shown as grey overlay or turn counter.
- **End Reveal:** Remaining relics flip automatically in final orbit.

## 5. Core Gameplay Loop

| Phase | Event | Description |
|-------|-------|-------------|
| 1 | Seat & Buy-in | Players join the table, get chips, and one Common relic. |
| 2 | Early Hands | Standard poker, build chip stacks. |
| 3 | Rogue Breaks | Occur every orbit or blind increase; draft relics from rarity-weighted options. |
| 4 | Escalation | Powers begin colliding; table dynamics grow unpredictable. |
| 5 | Final Orbit | High blinds, final relics revealed. |
| 6 | Results | Winner declared, stats logged. |

## 6. Match End Conditions

- **Elimination Victory:** Last remaining player.
- **Timed Victory:** Highest chip count at orbit limit.
- **Draw Handling:** Tie broken by total pots won, then highest single-hand pot.

## 7. AI / Bot Layer (For Testing)

| Function | Description |
|----------|-------------|
| Poker Engine | Standard Hold'em behavior. |
| AI Personalities | Passive, balanced, aggressive. |
| Relic Logic | Bots use relics randomly or via trigger scripts. |
| Simulation Support | Runs can be batch-tested (2–8 players) for balance and emergent behavior logging. |

## 8. Economy & Progression (Prototype Scope)

- No persistent progression; all relics and chips reset each run.
- XP logging optional (used for analytics).
- Future roadmap: cosmetic unlocks, relic codex, relic family discovery trees.

## 9. Visual & Audio Direction

**Theme:** Neo-casino surrealism — part cyberpunk, part cathedral of chance.

**Palette:** Deep crimson, polished obsidian, gold inlays, glitching neon HUD.

**VFX:**
- Common relics shimmer subtly.
- Rare relics pulse outward with a soft radial glow.
- Epic relics cause environmental reactions (cards flash, chips levitate, lighting shifts).

**SFX:**
- Dealer sounds preserved for grounding.
- Relic triggers use signature motifs: shuffle (Dealer), electric hum (Luck), metallic echo (Chaos).

**UI Language:** Clean typographic hierarchy with rare Latin tooltips for Relics (e.g., "Fortuna Mutabilis – Fortune is fickle.").

## 10. Technical Implementation

| System | Responsibility |
|--------|----------------|
| Poker Engine | Manages hand flow, bets, blinds, pots. |
| Relic Manager | Stores relics, executes triggers, handles cooldowns. |
| Draft UI | Displays relic options, logs choice. |
| Reveal System | Animations and tablewide broadcast. |
| Session Controller | Handles hand counts, orbits, breaks, and match end. |
| Telemetry | Logs relic use, win rate, duration, chip delta, and player retention metrics. |

**Data Structures:**
- `relics.json` → definitions and rarity tables.
- `player_state.json` → chips, relics, cooldowns, seat ID.
- `match_state.json` → blinds, hand counter, active players.

## 11. Example Timeline (8 Players, 30-Min Session)

| Time | Event |
|------|-------|
| 00:00 | Players join; blinds 50/100. Each gets one Common relic. |
| 05:00 | Blinds 100/200. Rogue Break #1 – draft Common/Rare. |
| 10:00 | Relics in play; table reveals begin. |
| 15:00 | Rogue Break #2 – Rare/Epic draft. |
| 25:00 | Final Orbit: 400/800 blinds, auto-reveals. |
| 30:00 | Match ends, winner declared. |

## 12. Narrative Hook (Optional Flavor)

> "The House doesn't deal fair hands.
> It deals rules.
> Each night, the table rewrites itself — odds twist, luck tilts, and the House watches.
> Everyone plays. Not everyone leaves."

## 13. Deliverables for AI Implementation

- Core Texas Hold'em logic (dealer rotation, betting rounds).
- Relic system hooks (pre-deal, post-deal, flop modify, info peek, showdown modify).
- Draft and reveal UI flow.
- Basic matchmaking and seat management.
- AI opponents with simple decision tree logic.
- Event-driven telemetry export (for later balancing).

## 14. Scalability Path

| Phase | Expansion Goal |
|-------|----------------|
| 1 | Single-Table Prototype (current design) – core mechanics + relic testing. |
| 2 | Multi-Table Ladder Mode – persistent relic set across tables. |
| 3 | Meta Unlocks – cosmetic or relic pool expansion. |
| 4 | Prize-Linked Events – optional integration with regulated poker ecosystems. |

## 15. Sample Tagline Options

- "Every table plays by its own rules."
- "The House changes. Can you?"
- "Break the rules. Bend the odds."
- "Poker. Rewritten."
