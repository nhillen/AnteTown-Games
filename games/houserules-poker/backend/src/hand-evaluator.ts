import { Card, HandEvaluation, HandRank } from './types.js';
import { getRankValue } from './deck.js';

/**
 * Evaluates the best 5-card poker hand from 7 cards (2 hole + 5 community)
 * Simplified version - full implementation would have all combinations
 */
export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  const allCards = [...holeCards, ...communityCards];

  // For now, just return a simple evaluation
  // Full implementation would check all 21 combinations of 5 cards from 7
  return evaluate5Cards(allCards.slice(0, 5));
}

function evaluate5Cards(cards: Card[]): HandEvaluation {
  const sortedCards = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));

  // Check for flush
  const isFlush = cards.every(c => c.suit === cards[0].suit);

  // Check for straight
  const values = sortedCards.map(c => getRankValue(c.rank));
  const isStraight = values.every((v, i) => i === 0 || values[i-1] - v === 1);

  // Check for pairs, trips, quads
  const rankCounts = new Map<string, number>();
  cards.forEach(c => {
    rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
  });

  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);

  // Determine hand rank
  let rank: HandRank;
  let value: number;

  if (isStraight && isFlush && getRankValue(sortedCards[0].rank) === 14) {
    rank = 'royal-flush';
    value = 10_00_00_00_00;
  } else if (isStraight && isFlush) {
    rank = 'straight-flush';
    value = 9_00_00_00_00 + values[0] * 1_00_00_00;
  } else if (counts[0] === 4) {
    rank = 'four-of-a-kind';
    value = 8_00_00_00_00;
  } else if (counts[0] === 3 && counts[1] === 2) {
    rank = 'full-house';
    value = 7_00_00_00_00;
  } else if (isFlush) {
    rank = 'flush';
    value = 6_00_00_00_00;
  } else if (isStraight) {
    rank = 'straight';
    value = 5_00_00_00_00;
  } else if (counts[0] === 3) {
    rank = 'three-of-a-kind';
    value = 4_00_00_00_00;
  } else if (counts[0] === 2 && counts[1] === 2) {
    rank = 'two-pair';
    value = 3_00_00_00_00;
  } else if (counts[0] === 2) {
    rank = 'pair';
    value = 2_00_00_00_00;
  } else {
    rank = 'high-card';
    value = 1_00_00_00_00;
  }

  return {
    rank,
    value,
    cards: sortedCards,
    kickers: []
  };
}

export function handRankToString(rank: HandRank): string {
  const names: Record<HandRank, string> = {
    'high-card': 'High Card',
    'pair': 'Pair',
    'two-pair': 'Two Pair',
    'three-of-a-kind': 'Three of a Kind',
    'straight': 'Straight',
    'flush': 'Flush',
    'full-house': 'Full House',
    'four-of-a-kind': 'Four of a Kind',
    'straight-flush': 'Straight Flush',
    'royal-flush': 'Royal Flush'
  };
  return names[rank];
}
