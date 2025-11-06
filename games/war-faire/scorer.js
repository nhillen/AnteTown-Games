// Scoring logic

export const RIBBON_TYPES = {
  GOLD: 'gold',
  SILVER: 'silver',
  BRONZE: 'bronze'
};

export const BASE_RIBBON_VALUES = {
  gold: 2,
  silver: 1,
  bronze: 0
};

export function scoreCategory(categoryName, players, prestige) {
  // Calculate each player's total for this category
  const playerTotals = players.map(player => ({
    player,
    total: player.getCategoryTotal(categoryName)
  })).filter(pt => pt.total > 0); // Only include players who played in this category

  if (playerTotals.length === 0) {
    return { winners: [], totalPoints: 0 };
  }

  // Sort by total (descending)
  playerTotals.sort((a, b) => b.total - a.total);

  // Award ribbons
  const winners = [];
  let currentRank = 0;
  let i = 0;

  while (i < playerTotals.length && currentRank < 3) {
    const currentTotal = playerTotals[i].total;
    const tiedPlayers = [];

    // Find all players with the same total
    while (i < playerTotals.length && playerTotals[i].total === currentTotal) {
      tiedPlayers.push(playerTotals[i].player);
      i++;
    }

    // Award ribbon based on current rank
    let ribbonType;
    if (currentRank === 0) {
      ribbonType = RIBBON_TYPES.GOLD;
    } else if (currentRank === 1) {
      ribbonType = RIBBON_TYPES.SILVER;
    } else if (currentRank === 2) {
      ribbonType = RIBBON_TYPES.BRONZE;
    }

    // Calculate VP for this ribbon
    const vp = BASE_RIBBON_VALUES[ribbonType] + prestige;

    // Award to all tied players
    for (const player of tiedPlayers) {
      player.addRibbon(categoryName, ribbonType, vp);
      winners.push({ player, ribbonType, vp, total: currentTotal });
    }

    // Skip next rank(s) if there was a tie
    currentRank += tiedPlayers.length;
  }

  // Calculate total points played in this category (for prestige ranking)
  const totalPoints = playerTotals.reduce((sum, pt) => sum + pt.total, 0);

  return { winners, totalPoints };
}

export function scoreFair(players, activeCategories, categoryPrestige) {
  const results = {
    categories: {},
    groups: {}
  };

  // Score each category
  for (const category of activeCategories) {
    const prestige = categoryPrestige[category.name] || 0;
    const result = scoreCategory(category.name, players, prestige);
    results.categories[category.name] = {
      ...result,
      prestige
    };
  }

  // Score groups
  const groups = [...new Set(activeCategories.map(cat => cat.group))];
  for (const groupName of groups) {
    const groupCats = activeCategories.filter(cat => cat.group === groupName);
    const playerScores = players.map(player => ({
      player,
      vp: player.getGroupVP(groupName, activeCategories)
    })).filter(ps => ps.vp > 0);

    playerScores.sort((a, b) => b.vp - a.vp);

    if (playerScores.length > 0) {
      results.groups[groupName] = {
        winner: playerScores[0].player,
        vp: playerScores[0].vp,
        standings: playerScores
      };
    }
  }

  return results;
}

export function updatePrestige(activeCategories, categoryPrestige, results) {
  // Rank categories by total points
  const categoryTotals = Object.entries(results.categories).map(([name, data]) => ({
    name,
    totalPoints: data.totalPoints
  }));

  categoryTotals.sort((a, b) => b.totalPoints - a.totalPoints);

  // Top 3 categories gain +1 prestige
  const topCategories = categoryTotals.slice(0, 3);
  for (const cat of topCategories) {
    categoryPrestige[cat.name] = (categoryPrestige[cat.name] || 0) + 1;
  }

  return topCategories.map(c => c.name);
}

export function findCategoryToRetire(activeCategories, categoryPrestige, results) {
  // Find lowest-ranked category by total points
  const categoryTotals = Object.entries(results.categories).map(([name, data]) => ({
    name,
    totalPoints: data.totalPoints,
    prestige: categoryPrestige[name] || 0
  }));

  categoryTotals.sort((a, b) => {
    // First by total points (ascending)
    if (a.totalPoints !== b.totalPoints) {
      return a.totalPoints - b.totalPoints;
    }
    // Then by prestige (ascending) - retire lowest prestige first
    return a.prestige - b.prestige;
  });

  if (categoryTotals.length > 0) {
    const lowestCategory = categoryTotals[0];
    return activeCategories.find(cat => cat.name === lowestCategory.name);
  }

  return null;
}
