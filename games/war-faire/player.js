// Player class

export class Player {
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.hand = [];
    this.faceDownCards = []; // Cards that will flip during THIS Fair (current round tracking)
    this.nextFairFaceDownCards = []; // Cards saved for NEXT Fair
    this.playedCards = []; // Cards played this Fair
    this.ribbons = []; // Ribbons earned { category, type: 'gold'|'silver'|'bronze', vp }
    this.totalVP = 0;
    this.currentFair = 1; // Track current fair for metadata
    this.currentRound = 1; // Track current round for metadata
  }

  addToHand(card) {
    this.hand.push(card);
  }

  removeFromHand(card) {
    const index = this.hand.indexOf(card);
    if (index > -1) {
      this.hand.splice(index, 1);
      return true;
    }
    return false;
  }

  playCardFaceUp(card) {
    if (this.removeFromHand(card)) {
      // Add metadata for when this card was played
      card.playedAtFair = this.currentFair;
      card.playedAtRound = this.currentRound;
      this.playedCards.push(card);
      return true;
    }
    return false;
  }

  playCardFaceDown(card) {
    if (this.removeFromHand(card)) {
      // Tag the card with which round it was played
      card.playedFaceDownAtFair = this.currentFair;
      card.playedFaceDownAtRound = this.currentRound;
      // Cards go into nextFairFaceDownCards (will be moved to faceDownCards at start of next Fair)
      this.nextFairFaceDownCards.push(card);
      return true;
    }
    return false;
  }

  flipFaceDownCards() {
    // Move face-down cards to played cards and add metadata
    const cardsToFlip = [...this.faceDownCards];
    cardsToFlip.forEach(card => {
      card.playedAtFair = this.currentFair;
      card.playedAtRound = this.currentRound;
      this.playedCards.push(card);
    });
    const flipped = [...this.faceDownCards];
    this.faceDownCards = [];
    return flipped;
  }

  getCategoryTotal(categoryName) {
    return this.playedCards
      .filter(card => card.getEffectiveCategory() === categoryName)
      .reduce((sum, card) => sum + card.value, 0);
  }

  addRibbon(category, type, vp) {
    this.ribbons.push({ category, type, vp });
    this.totalVP += vp;
  }

  getGroupVP(groupName, activeCategories) {
    // Sum VP from ribbons in categories that belong to this group
    return this.ribbons
      .filter(ribbon => {
        const category = activeCategories.find(cat => cat.name === ribbon.category);
        return category && category.group === groupName;
      })
      .reduce((sum, ribbon) => sum + ribbon.vp, 0);
  }

  clearForNextFair() {
    this.hand = [];
    this.playedCards = [];
    // Move next Fair's face-down cards into current Fair's face-down cards
    this.faceDownCards = [...this.nextFairFaceDownCards];
    this.nextFairFaceDownCards = [];
    // Keep ribbons
  }

  reset() {
    this.hand = [];
    this.faceDownCards = [];
    this.nextFairFaceDownCards = [];
    this.playedCards = [];
    this.ribbons = [];
    this.totalVP = 0;
  }

  toString() {
    return `${this.name} (VP: ${this.totalVP})`;
  }
}
