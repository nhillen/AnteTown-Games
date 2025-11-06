// Card definitions and categories

export const GROUPS = {
  PRODUCE: 'Produce',
  BAKING: 'Baking',
  LIVESTOCK: 'Livestock'
};

export const CATEGORIES = {
  // Produce
  CARROTS: { name: 'Carrots', group: GROUPS.PRODUCE },
  PUMPKINS: { name: 'Pumpkins', group: GROUPS.PRODUCE },
  TOMATOES: { name: 'Tomatoes', group: GROUPS.PRODUCE },
  CORN: { name: 'Corn', group: GROUPS.PRODUCE },

  // Baking
  PIES: { name: 'Pies', group: GROUPS.BAKING },
  CAKES: { name: 'Cakes', group: GROUPS.BAKING },
  COOKIES: { name: 'Cookies', group: GROUPS.BAKING },
  BREADS: { name: 'Breads', group: GROUPS.BAKING },

  // Livestock
  PIGS: { name: 'Pigs', group: GROUPS.LIVESTOCK },
  COWS: { name: 'Cows', group: GROUPS.LIVESTOCK },
  CHICKENS: { name: 'Chickens', group: GROUPS.LIVESTOCK }
};

// Card value distribution: 2,2,2,2,3,3,3,3,4,4,5,5,6
export const CARD_VALUES = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6];

// Group card values: 2,2,3,3,4,4,5,5 per group (24 total)
export const GROUP_CARD_VALUES = [2, 2, 3, 3, 4, 4, 5, 5];

export class Card {
  constructor(category, value, isGroupCard = false) {
    this.category = category; // Can be a specific category or a group name
    this.value = value;
    this.isGroupCard = isGroupCard;
    this.selectedCategory = null; // For group cards, the player chooses
  }

  getDisplayName() {
    if (this.isGroupCard) {
      return `${this.category} (Group Card)`;
    }
    return this.category;
  }

  getEffectiveCategory() {
    if (this.isGroupCard && this.selectedCategory) {
      return this.selectedCategory;
    }
    return this.category;
  }

  clone() {
    const card = new Card(this.category, this.value, this.isGroupCard);
    card.selectedCategory = this.selectedCategory;
    return card;
  }
}

export function createDeck(activeCategories) {
  const deck = [];

  // Add category cards
  for (const categoryKey of activeCategories) {
    const category = CATEGORIES[categoryKey];
    for (const value of CARD_VALUES) {
      deck.push(new Card(category.name, value, false));
    }
  }

  // Determine which groups have at least one active category
  const activeGroups = new Set();
  for (const categoryKey of activeCategories) {
    const category = CATEGORIES[categoryKey];
    activeGroups.add(category.group);
  }

  // Add group cards only for groups with active categories
  for (const groupName of activeGroups) {
    for (const value of GROUP_CARD_VALUES) {
      deck.push(new Card(groupName, value, true));
    }
  }

  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getAllCategoryKeys() {
  return Object.keys(CATEGORIES);
}

export function getCategoryByName(name) {
  return Object.values(CATEGORIES).find(cat => cat.name === name);
}

export function getCategoriesInGroup(groupName) {
  return Object.values(CATEGORIES).filter(cat => cat.group === groupName);
}
