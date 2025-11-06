#!/usr/bin/env node

/**
 * Migrate dice collections from flat files to database
 * This script populates the dice_collections table with initial data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simple combo normalization - just ensure required fields exist
function normalizeCombo(combo) {
  return {
    skin: combo.skin,
    material: combo.material,
    value: combo.value,
    pipStyle: combo.pipStyle || 'classic',
    effects: combo.effects || [],
    tint: combo.tint
  };
}

// Simple complexity scoring based on features
function scoreCombo(combo) {
  let score = 0;

  // Material complexity
  if (combo.material === 'frostedGlass') score += 1;
  if (combo.material === 'clearGlass') score += 2;
  if (combo.material === 'ghost') score += 3;

  // Effects
  if (combo.effects) {
    score += combo.effects.length;
    combo.effects.forEach(effect => {
      if (effect.strength === 'high') score += 1;
    });
  }

  // Tint adds complexity
  if (combo.tint) score += 1;

  return score;
}

// Rarity pricing
const RARITY_PRICING = {
  'Swabbie': 2.00,
  'Deckhand': 4.00,
  'Corsair': 6.00,
  'Captain': 8.00,
  'Kraken': 10.00
};

// Raw collection definitions (will be normalized by rules engine)
const RAW_COLLECTIONS = [
  // ================= Swabbie (Common) =================
  {
    id: "bone-classic",
    name: "Bone Classic",
    rarity: "Swabbie",
    theme: "Pirate Waters - Series I",
    description: "Traditional bone dice with gentle emerald glow",
    price: RARITY_PRICING['Swabbie'],
    combo: {
      skin: "bone",
      material: "solid",
      value: 6,
      effects: [{ type: "glow", color: "#10B981", strength: "low" }]
    }
  },
  {
    id: "pearl-simple",
    name: "Pearl Simple",
    rarity: "Swabbie",
    theme: "Pirate Waters - Series I",
    description: "Elegant pearl finish with subtle silver glow",
    price: RARITY_PRICING['Swabbie'],
    combo: {
      skin: "pearl",
      material: "solid",
      value: 6,
      effects: [{ type: "glow", color: "#A3A3A3", strength: "low" }]
    }
  },
  {
    id: "golden-doubloon-lite",
    name: "Golden Doubloon Lite",
    rarity: "Swabbie",
    theme: "Pirate Waters - Series I",
    description: "Basic brass with warm golden light",
    price: RARITY_PRICING['Swabbie'],
    combo: {
      skin: "brass",
      material: "solid",
      value: 6,
      effects: [{ type: "glow", color: "#F59E0B", strength: "low" }]
    }
  },
  {
    id: "shadow-ebony",
    name: "Shadow Ebony",
    rarity: "Swabbie",
    theme: "Pirate Waters - Series I",
    description: "Dark ebony with cool blue highlights",
    price: RARITY_PRICING['Swabbie'],
    combo: {
      skin: "ebony",
      material: "solid",
      value: 6,
      effects: [{ type: "glow", color: "#60A5FA", strength: "low" }]
    }
  },
  {
    id: "seafoam",
    name: "Seafoam",
    rarity: "Swabbie",
    theme: "Pirate Waters - Series I",
    description: "Ocean dice with natural seafoam glow",
    price: RARITY_PRICING['Swabbie'],
    combo: {
      skin: "ocean",
      material: "solid",
      value: 6,
      effects: [{ type: "glow", color: "#10B981", strength: "low" }]
    }
  },
  {
    id: "obsidian-ember",
    name: "Obsidian Ember",
    rarity: "Swabbie",
    theme: "Pirate Waters - Series I",
    description: "Dark obsidian with smoldering red ember",
    price: RARITY_PRICING['Swabbie'],
    combo: {
      skin: "obsidian",
      material: "solid",
      value: 6,
      effects: [{ type: "glow", color: "#EF4444", strength: "low" }]
    }
  },

  // ================= Deckhand (Uncommon) =================
  {
    id: "misty-pearl",
    name: "Misty Pearl",
    rarity: "Deckhand",
    theme: "Pirate Waters - Series I",
    description: "Frosted pearl with gentle sparkles like sea mist",
    price: RARITY_PRICING['Deckhand'],
    combo: {
      skin: "pearl",
      material: "frostedGlass",
      value: 6,
      effects: [
        { type: "glow", color: "#A3A3A3", strength: "low" },
        { type: "sparkles", color: "#FFFFFF", count: 6 }
      ]
    }
  },
  {
    id: "brass-beacon",
    name: "Brass Beacon",
    rarity: "Deckhand",
    theme: "Pirate Waters - Series I",
    description: "Solid brass with pulsing beacon glow",
    price: RARITY_PRICING['Deckhand'],
    combo: {
      skin: "brass",
      material: "solid",
      value: 6,
      effects: [
        { type: "glow", color: "#F59E0B", strength: "high" },
        { type: "aura", style: "pulse", color: "#F59E0B" }
      ]
    }
  },
  {
    id: "bone-lantern",
    name: "Bone Lantern",
    rarity: "Deckhand",
    theme: "Pirate Waters - Series I",
    description: "Frosted bone with soft lantern-like aura",
    price: RARITY_PRICING['Deckhand'],
    combo: {
      skin: "bone",
      material: "frostedGlass",
      value: 6,
      effects: [
        { type: "glow", color: "#10B981", strength: "low" },
        { type: "aura", style: "pulse", color: "#10B981" }
      ]
    }
  },
  {
    id: "night-watch",
    name: "Night Watch",
    rarity: "Deckhand",
    theme: "Pirate Waters - Series I",
    description: "Ebony dice with mysterious purple aura",
    price: RARITY_PRICING['Deckhand'],
    combo: {
      skin: "ebony",
      material: "solid",
      value: 6,
      effects: [
        { type: "glow", color: "#8B5CF6", strength: "low" },
        { type: "aura", style: "pulse", color: "#8B5CF6" }
      ]
    }
  },
  {
    id: "reef-glass",
    name: "Reef Glass",
    rarity: "Deckhand",
    theme: "Pirate Waters - Series I",
    description: "Tinted ocean glass with coral reef sparkles",
    price: RARITY_PRICING['Deckhand'],
    combo: {
      skin: "ocean",
      material: "frostedGlass",
      tint: "#7AE1D6",
      value: 6,
      effects: [
        { type: "glow", color: "#3B82F6", strength: "low" },
        { type: "sparkles", color: "#E0FFFF", count: 6 }
      ]
    }
  },
  {
    id: "obsidian-salt",
    name: "Obsidian Salt",
    rarity: "Deckhand",
    theme: "Pirate Waters - Series I",
    description: "Frosted obsidian with purple salt crystals",
    price: RARITY_PRICING['Deckhand'],
    combo: {
      skin: "obsidian",
      material: "frostedGlass",
      tint: "#6D28D9",
      value: 6,
      effects: [{ type: "glow", color: "#8B5CF6", strength: "low" }]
    }
  },

  // ================= Corsair (Rare) =================
  {
    id: "deep-current",
    name: "Deep Current",
    rarity: "Corsair",
    theme: "Pirate Waters - Series I",
    description: "Clear ocean glass with electric deep-sea current",
    price: RARITY_PRICING['Corsair'],
    combo: {
      skin: "ocean",
      material: "clearGlass",
      tint: "#2DD4BF",
      value: 6,
      effects: [
        { type: "glow", color: "#3B82F6", strength: "high" },
        { type: "aura", style: "electric", color: "#3B82F6" }
      ]
    }
  },
  {
    id: "doubloon-ring",
    name: "Doubloon Ring",
    rarity: "Corsair",
    theme: "Pirate Waters - Series I",
    description: "Solid brass with golden rim marquee",
    price: RARITY_PRICING['Corsair'],
    combo: {
      skin: "brass",
      material: "solid",
      value: 6,
      effects: [
        { type: "glow", color: "#F59E0B", strength: "high" },
        { type: "rim-marquee", color: "#F59E0B" }
      ]
    }
  },
  {
    id: "moonlit-bone",
    name: "Moonlit Bone",
    rarity: "Corsair",
    theme: "Pirate Waters - Series I",
    description: "Clear bone with moonlight tint and starlight sparkles",
    price: RARITY_PRICING['Corsair'],
    combo: {
      skin: "bone",
      material: "clearGlass",
      tint: "#CFE6F1",
      value: 6,
      effects: [
        { type: "glow", color: "#A3A3A3", strength: "high" },
        { type: "sparkles", color: "#FFFFFF", count: 6 }
      ]
    }
  },
  {
    id: "midnight-corsair",
    name: "Midnight Corsair",
    rarity: "Corsair",
    theme: "Pirate Waters - Series I",
    description: "Solid ebony with blue rim lighting",
    price: RARITY_PRICING['Corsair'],
    combo: {
      skin: "ebony",
      material: "solid",
      value: 6,
      effects: [
        { type: "glow", color: "#60A5FA", strength: "high" },
        { type: "rim-marquee", color: "#60A5FA" }
      ]
    }
  },
  {
    id: "siren-pearl",
    name: "Siren Pearl",
    rarity: "Corsair",
    theme: "Pirate Waters - Series I",
    description: "Frosted pearl with enchanting emerald aura",
    price: RARITY_PRICING['Corsair'],
    combo: {
      skin: "pearl",
      material: "frostedGlass",
      value: 6,
      effects: [
        { type: "glow", color: "#10B981", strength: "high" },
        { type: "aura", style: "pulse", color: "#10B981" }
      ]
    }
  },
  {
    id: "cursed-ember",
    name: "Cursed Ember",
    rarity: "Corsair",
    theme: "Pirate Waters - Series I",
    description: "Clear obsidian with purple curse and electric aura",
    price: RARITY_PRICING['Corsair'],
    combo: {
      skin: "obsidian",
      material: "clearGlass",
      tint: "#8B5CF6",
      value: 6,
      effects: [
        { type: "glow", color: "#8B5CF6", strength: "high" },
        { type: "aura", style: "electric", color: "#8B5CF6" }
      ]
    }
  },

  // ================= Captain (Epic) =================
  {
    id: "cursed-obsidian",
    name: "Cursed Obsidian",
    rarity: "Captain",
    theme: "Pirate Waters - Series I",
    description: "Ghostly obsidian with pulsing aura and cursed sparkles",
    price: RARITY_PRICING['Captain'],
    combo: {
      skin: "obsidian",
      material: "ghost",
      value: 6,
      effects: [
        { type: "glow", color: "#8B5CF6", strength: "high" },
        { type: "aura", style: "pulse", color: "#8B5CF6" },
        { type: "sparkles", color: "#C4B5FD", count: 6 }
      ]
    }
  },
  {
    id: "krakens-depths",
    name: "Kraken's Depths",
    rarity: "Captain",
    theme: "Pirate Waters - Series I",
    description: "Ghostly ocean dice with electric depths and sea sparkles",
    price: RARITY_PRICING['Captain'],
    combo: {
      skin: "ocean",
      material: "ghost",
      value: 6,
      effects: [
        { type: "glow", color: "#22D3EE", strength: "high" },
        { type: "aura", style: "electric", color: "#22D3EE" },
        { type: "sparkles", color: "#7DD3FC", count: 6 }
      ]
    }
  },
  {
    id: "storm-captain",
    name: "Storm Captain",
    rarity: "Captain",
    theme: "Pirate Waters - Series I",
    description: "Clear ebony with storm tint, rim lighting and tempest aura",
    price: RARITY_PRICING['Captain'],
    combo: {
      skin: "ebony",
      material: "clearGlass",
      tint: "#5FA8FF",
      value: 6,
      effects: [
        { type: "glow", color: "#60A5FA", strength: "high" },
        { type: "rim-marquee", color: "#60A5FA" },
        { type: "aura", style: "pulse", color: "#60A5FA" }
      ]
    }
  },
  {
    id: "doubloon-hoard",
    name: "Doubloon Hoard",
    rarity: "Captain",
    theme: "Pirate Waters - Series I",
    description: "Clear brass with golden rim and treasure sparkles",
    price: RARITY_PRICING['Captain'],
    combo: {
      skin: "brass",
      material: "clearGlass",
      value: 6,
      effects: [
        { type: "glow", color: "#F59E0B", strength: "high" },
        { type: "rim-marquee", color: "#F59E0B" },
        { type: "sparkles", color: "#FFF3C4", count: 6 }
      ]
    }
  },
  {
    id: "sirens-tear",
    name: "Siren's Tear",
    rarity: "Captain",
    theme: "Pirate Waters - Series I",
    description: "Clear pearl with siren tint, pulsing aura and white sparkles",
    price: RARITY_PRICING['Captain'],
    combo: {
      skin: "pearl",
      material: "clearGlass",
      tint: "#2DD4BF",
      value: 6,
      effects: [
        { type: "glow", color: "#10B981", strength: "high" },
        { type: "aura", style: "pulse", color: "#10B981" },
        { type: "sparkles", color: "#FFFFFF", count: 6 }
      ]
    }
  },
  {
    id: "ghostbone-relic",
    name: "Ghostbone Relic",
    rarity: "Captain",
    theme: "Pirate Waters - Series I",
    description: "Ghostly bone with silver aura and rim lighting",
    price: RARITY_PRICING['Captain'],
    combo: {
      skin: "bone",
      material: "ghost",
      value: 6,
      effects: [
        { type: "glow", color: "#A3A3A3", strength: "high" },
        { type: "aura", style: "pulse", color: "#A3A3A3" },
        { type: "rim-marquee", color: "#A3A3A3" }
      ]
    }
  }
];

async function migrateCollections() {
  console.log('Starting dice collection migration...');

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const rawCollection of RAW_COLLECTIONS) {
    try {
      // Normalize combo through rules engine
      const normalizedCombo = normalizeCombo(rawCollection.combo);
      const complexity = scoreCombo(normalizedCombo);

      // Check if collection already exists
      const existing = await prisma.diceCollection.findUnique({
        where: { id: rawCollection.id }
      });

      const data = {
        name: rawCollection.name,
        rarity: rawCollection.rarity,
        theme: rawCollection.theme,
        description: rawCollection.description,
        price: rawCollection.price,
        combo: JSON.stringify(normalizedCombo),
        complexity
      };

      if (existing) {
        await prisma.diceCollection.update({
          where: { id: rawCollection.id },
          data
        });
        console.log(`✓ Updated: ${rawCollection.name} (${rawCollection.id})`);
        updated++;
      } else {
        await prisma.diceCollection.create({
          data: {
            id: rawCollection.id,
            ...data
          }
        });
        console.log(`✓ Created: ${rawCollection.name} (${rawCollection.id})`);
        created++;
      }
    } catch (error) {
      console.error(`✗ Failed to migrate ${rawCollection.name}:`, error.message);
      errors++;
    }
  }

  console.log('\nMigration complete:');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total: ${created + updated} / ${RAW_COLLECTIONS.length}`);
}

migrateCollections()
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
