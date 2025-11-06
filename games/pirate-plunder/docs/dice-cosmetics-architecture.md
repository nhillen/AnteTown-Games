# Dice Cosmetics Architecture v2.0

## Overview

This document outlines the consolidated dice cosmetics system for Pirate Plunder, moving from the current fragmented approach (separate dice skins, pip styles, high/low glow) to a unified **Dice Collection** system where each cosmetic is a complete, pre-designed combination sold as a single SKU.

## Key Changes from Current System

### What's Removed
- ❌ **Separate Pip Styles** - Not providing enough value, confusing UX
- ❌ **High/Low Glow Separation** - Weird distinction, inconsistent behavior  
- ❌ **Mix-and-Match UI** - Too many combinations, analysis paralysis

### What's Added
- ✅ **Complete Dice Collections** - Each SKU is a full visual package
- ✅ **Material System** - Solid, frosted glass, clear glass, ghost materials
- ✅ **Effects System** - Auras, sparkles, rim animations
- ✅ **5-Tier Rarity System** - Clear progression with complexity rules
- ✅ **Pirate/Nautical Theming** - Cohesive aesthetic with meaningful names

## Technical Architecture

### Core Components

```typescript
interface DiceCollectionItem {
  // Identity
  id: string;                    // "cursed-obsidian"
  name: string;                  // "Cursed Obsidian"
  rarity: RarityTier;           // "Kraken"
  theme?: string;               // "Cursed" | "Deep Sea" | "Captain's"
  
  // Visual Configuration
  skin: SkinId;                 // Base color palette
  material: MaterialType;       // How the die face renders
  glow: GlowConfig;             // External glow effect
  effects: EffectConfig[];      // Additional visual effects
  
  // Metadata  
  complexity: number;           // Computed complexity score
  price: number;                // Store price in dollars
  unlocked: boolean;            // Player ownership status
}

type RarityTier = 'Swabbie' | 'Deckhand' | 'Corsair' | 'Captain' | 'Kraken';
type MaterialType = 'solid' | 'frostedGlass' | 'clearGlass' | 'ghost';
type SkinId = 'bone' | 'pearl' | 'brass' | 'ebony' | 'ocean' | 'obsidian';
```

### Rendering System

The new renderer takes a complete dice configuration and produces premium SVG:

```typescript
function renderDiceCollection(config: DiceCollectionItem, options: RenderOptions): string {
  return dieSVG({
    size: options.size || 40,
    value: options.value || 6,
    
    // Core visual components
    skin: config.skin,
    material: config.material,
    glow: config.glow,
    effects: config.effects,
    
    // Always classic pips (simplification)
    pipStyle: 'classic'
  });
}
```

### Material System

Each material fundamentally changes how the die face renders:

**Solid** - Traditional opaque dice with gradient faces and beveled edges
- Face: Solid color with subtle gradient
- Edge: Contrasting border 
- Pips: High contrast, drop shadow

**Frosted Glass** - Translucent with texture
- Face: Semi-transparent with grain filter
- Edge: Subtle rim glow
- Pips: Dark, readable through glass

**Clear Glass** - Premium transparent with specular highlights  
- Face: Minimal tint, specular stripe
- Edge: Crisp light rim
- Pips: Solid dark for readability

**Ghost** - Nearly invisible, neon-edged
- Face: Barely visible
- Edge: Colored neon glow matching main glow
- Pips: Soft glowing to maintain visibility

### Effects System

Effects are independent visual layers that don't interfere with the core die:

**Aura** - Pulsing or electric ring behind the die
- `pulse`: Gentle opacity animation
- `electric`: Displacement filter for energy effect

**Sparkles** - Randomly positioned twinkling points around the die
- Configurable count and color
- Staggered fade animations

**Rim Marquee** - Animated dashed stroke around the die edge
- LED-style moving pattern
- Customizable color and speed

## Rarity System & Complexity Rules

### Rarity Tiers

| Tier | Look | Complexity | Materials | Glow | Effects | Price Range |
|------|------|------------|-----------|------|---------|-------------|
| **Swabbie** | Clean casino dice | 1-3 pts | solid only | low only | none | $1-2 |
| **Deckhand** | Material treatment | 4-6 pts | solid, frostedGlass | low/high | max 1 subtle | $3-5 |  
| **Corsair** | Signature flourish | 7-9 pts | +clearGlass | any | max 1 notable | $6-8 |
| **Captain** | Premium pairing | 10-12 pts | +ghost | high preferred | max 2 total | $9-12 |
| **Kraken** | Showcase piece | 13-16 pts | ghost/glass focus | high, multi-tone | max 3 total | $15-20 |

### Complexity Scoring

```typescript
function calculateComplexity(config: DiceCollectionItem): number {
  const materialPoints = {
    solid: 1,
    frostedGlass: 2, 
    clearGlass: 3,
    ghost: 4
  }[config.material];
  
  const glowPoints = config.glow.strength === 'high' ? 2 : 1;
  
  const effectsPoints = config.effects.reduce((total, effect) => {
    const basePoints = {
      'aura': effect.style === 'electric' ? 3 : 2,
      'sparkles': 2,
      'rim-marquee': 3
    }[effect.type] || 0;
    return total + basePoints;
  }, 0);
  
  const extraEffectsPoints = Math.max(0, config.effects.length - 1) * 2;
  
  return materialPoints + glowPoints + effectsPoints + extraEffectsPoints;
}
```

## Example Dice Collections

### Swabbie Tier (1-3 complexity)
```typescript
{
  id: "bone-classic",
  name: "Bone Classic", 
  rarity: "Swabbie",
  skin: "bone",
  material: "solid",
  glow: { color: "#10b981", strength: "low" },
  effects: [],
  complexity: 2, // solid(1) + low-glow(1) = 2
  price: 2.00
}
```

### Captain Tier (10-12 complexity)  
```typescript
{
  id: "sirens-tear",
  name: "Siren's Tear",
  rarity: "Captain", 
  skin: "pearl",
  material: "clearGlass",
  tint: "#2dd4bf",
  glow: { color: "#10b981", strength: "high" },
  effects: [
    { type: "sparkles", color: "#ffffff", count: 6 },
    { type: "aura", style: "pulse", color: "#10b981" }
  ],
  complexity: 11, // clearGlass(3) + high-glow(2) + sparkles(2) + aura(2) + extra-effect(2) = 11
  price: 12.00
}
```

### Kraken Tier (13-16 complexity)
```typescript
{
  id: "cursed-obsidian", 
  name: "Cursed Obsidian",
  rarity: "Kraken",
  skin: "obsidian",
  material: "ghost", 
  glow: { color: "#8b5cf6", strength: "high" },
  effects: [
    { type: "aura", style: "pulse", color: "#8b5cf6" },
    { type: "sparkles", color: "#c4b5fd", count: 6 },
    { type: "rim-marquee", color: "#8b5cf6" }
  ],
  complexity: 15, // ghost(4) + high-glow(2) + aura(2) + sparkles(2) + marquee(3) + 2-extra-effects(4) = 17 -> capped at 16
  price: 18.00
}
```

## Store Implementation

### New Store Structure

```typescript
// Replace current tabs system
const DICE_COLLECTIONS: DiceCollectionItem[] = [
  // Load from JSON or database
];

// Group by rarity for store display
const collectionsByRarity = groupBy(DICE_COLLECTIONS, 'rarity');

// Store component renders rarity-based sections
function DiceCollectionStore() {
  return (
    <div className="dice-collections">
      {Object.entries(collectionsByRarity).map(([rarity, collections]) => (
        <RaritySection key={rarity} rarity={rarity} collections={collections} />
      ))}
    </div>
  );
}
```

### Preview System

Each collection item shows a standardized preview:
- Die face showing value 6 
- Full effects active (auto-loop for animations)
- Rarity badge in corner
- Name and price below

## Migration Plan

### Phase 1: Implement New Renderer
- [ ] Create new `dieSVG()` function with material/effects support
- [ ] Add shared SVG definitions for effects
- [ ] Create material painters (solid, frosted, clear, ghost)
- [ ] Implement effect generators (aura, sparkles, rim marquee)

### Phase 2: Define Initial Collection
- [ ] Create 10-15 starter collections across all rarity tiers
- [ ] Implement complexity scoring and validation
- [ ] Add rarity-based pricing logic

### Phase 3: Update Store UI
- [ ] Replace current tab system with rarity-based sections
- [ ] Implement collection preview cards
- [ ] Add rarity visual indicators
- [ ] Update purchase flow for collections

### Phase 4: Data Migration
- [ ] Migrate existing cosmetic unlocks to closest collection equivalents
- [ ] Provide transition period or grandfathering for existing unlocks
- [ ] Remove old cosmetic config files

### Phase 5: Polish & Expansion
- [ ] Add more collections based on player feedback
- [ ] Implement collection pack system (blind boxes)
- [ ] Add seasonal/limited collections
- [ ] Performance optimization for mobile

## Technical Considerations

### Performance
- Limit active animations to 2 per die
- Use shared SVG definitions to reduce DOM size
- Pre-render static collections server-side
- Implement lazy loading for large collections

### Accessibility  
- Maintain high contrast between pips and face
- Provide text descriptions for effects
- Ensure animations don't trigger seizures (< 3 flashes/sec)

### Mobile Optimization
- Test all effects at 40px thumbnail size
- Reduce particle counts on mobile
- Provide option to disable animations

## Success Metrics

### Player Engagement
- Collection unlock rate by rarity tier
- Time spent in cosmetics store
- Purchase conversion by rarity

### Technical Performance  
- Render time per die < 5ms
- Memory usage per die < 50KB
- Mobile frame rate > 30fps with effects

### Business Metrics
- Average revenue per cosmetic purchase
- Collection completion rates
- Player retention correlation with cosmetic ownership

---

This architecture provides a clear path from our current fragmented system to a cohesive, premium dice collection experience that's easier to manage, more performant, and significantly more appealing to players.