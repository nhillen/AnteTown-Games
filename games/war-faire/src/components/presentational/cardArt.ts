/**
 * Card Art Mapping - Presentational Only
 * Maps category IDs to card art image paths
 */

export const CARD_ART: Record<string, string> = {
  // Produce categories
  pumpkins: "/assets/card_art/pumpkins.png",
  carrots: "/assets/card_art/carrots.png",
  tomatoes: "/assets/card_art/tomatoes.png",
  corn: "/assets/card_art/corn.png",
  // Baking categories
  pies: "/assets/card_art/pies.png",
  cakes: "/assets/card_art/cake.png",
  breads: "/assets/card_art/bread.png",
  cookies: "/assets/card_art/cookies.png",
  // Livestock categories
  chickens: "/assets/card_art/chickens.png",
  pigs: "/assets/card_art/pigs.png",
  cows: "/assets/card_art/cows.png",
  // Group cards (use a representative image)
  livestock: "/assets/card_art/cows.png",  // Generic livestock image
  produce: "/assets/card_art/corn.png",    // Generic produce image
  baking: "/assets/card_art/bread.png"     // Generic baking image
};

/**
 * Get card art path for a category ID
 * Falls back to pies.png if category not found
 */
export function getCardArt(categoryId: string): string {
  return CARD_ART[categoryId] ?? "/assets/card_art/pies.png";
}
